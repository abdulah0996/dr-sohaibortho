const { connectDatabase, disconnectDatabase } = require("../src/config/db");
const { logError } = require("../src/utils/safeLogger");
const { Appointment } = require("../src/models");
const { normalizeTime } = require("../src/utils/time");
const { OCCUPYING_APPOINTMENT_STATUSES, activeSlotKey } = require("../src/domain/appointmentRules");
const { recalculateQueueTokens } = require("../src/services/appointmentService");
const { cancelAppointmentReminders } = require("../src/services/reminderService");
const { audit } = require("../src/services/auditService");

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const keepId = argument("keep");
  const cancelIds = String(argument("cancel") || "").split(",").map((value) => value.trim()).filter(Boolean);
  if (!keepId || !cancelIds.length || argument("confirm") !== "RECONCILE_DUPLICATE_SLOT") {
    throw new Error("Usage: npm run reconcile:appointment-slots -- --keep=DS-... --cancel=DS-...,DS-... --confirm=RECONCILE_DUPLICATE_SLOT");
  }
  await connectDatabase({ autoIndex: false });
  const requestedIds = [keepId, ...cancelIds];
  const requested = await Appointment.find({ appointmentId: { $in: requestedIds }, status: { $in: OCCUPYING_APPOINTMENT_STATUSES } });
  if (requested.length !== requestedIds.length) throw new Error("Every requested appointment must exist and currently occupy a slot.");
  const keys = new Set(requested.map((appointment) => activeSlotKey(appointment.location, appointment.date, normalizeTime(appointment.time))));
  if (keys.size !== 1) throw new Error("The requested appointments do not occupy the same clinic/date/time slot.");
  const exemplar = requested[0];
  const sameDateAppointments = await Appointment.find({
    location: exemplar.location,
    date: exemplar.date,
    status: { $in: OCCUPYING_APPOINTMENT_STATUSES }
  }).select("appointmentId time").lean();
  const allDuplicates = sameDateAppointments.filter((appointment) => normalizeTime(appointment.time) === normalizeTime(exemplar.time));
  const actual = allDuplicates.map((appointment) => appointment.appointmentId).sort();
  const declared = requestedIds.slice().sort();
  if (JSON.stringify(actual) !== JSON.stringify(declared)) throw new Error(`The full duplicate set must be declared. Active records: ${actual.join(", ")}`);
  const result = await Appointment.updateMany(
    { appointmentId: { $in: cancelIds }, status: { $in: OCCUPYING_APPOINTMENT_STATUSES } },
    {
      $set: {
        status: "cancelled",
        cancelledAt: new Date(),
        cancellationReason: `Operator reconciliation; retained ${keepId}`,
        cancellationSource: "system",
        reminderStatus: "cancelled"
      },
      $unset: { activeSlotKey: "" }
    }
  );
  await Promise.all(cancelIds.map(async (appointmentId) => {
    const appointment = requested.find((item) => item.appointmentId === appointmentId);
    await cancelAppointmentReminders(appointment._id);
    await audit({
      actorType: "system",
      action: "appointment.duplicate_reconciled",
      entityType: "appointment",
      entityId: appointmentId,
      metadata: { retainedAppointmentId: keepId }
    });
  }));
  await recalculateQueueTokens(exemplar.location, exemplar.date);
  console.log(JSON.stringify({ retained: keepId, cancelled: cancelIds, modifiedCount: result.modifiedCount }, null, 2));
  await disconnectDatabase();
}

main().catch(async (error) => {
  logError("Duplicate reconciliation failed", error);
  await disconnectDatabase().catch(() => undefined);
  process.exitCode = 1;
});
