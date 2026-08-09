const { Appointment, ClinicLocation } = require("../models");
const { normalizeTime } = require("../utils/time");
const { OCCUPYING_APPOINTMENT_STATUSES, appointmentOccupiesSlot, activeSlotKey } = require("../domain/appointmentRules");

async function auditActiveSlotData() {
  const locations = await ClinicLocation.find().select("_id code clinicName timezone").lean();
  const locationMap = new Map(locations.map((location) => [String(location._id), location]));
  const appointments = await Appointment.find({ status: { $in: OCCUPYING_APPOINTMENT_STATUSES } })
    .select("appointmentId location date time status activeSlotKey")
    .lean();
  const groups = new Map();
  const invalid = [];

  for (const appointment of appointments) {
    const location = locationMap.get(String(appointment.location));
    const time = normalizeTime(appointment.time);
    if (!location || !/^\d{4}-\d{2}-\d{2}$/.test(String(appointment.date || "")) || !time) {
      invalid.push({
        appointmentId: appointment.appointmentId,
        clinic: location?.code || String(appointment.location || "missing"),
        date: appointment.date,
        time: appointment.time,
        status: appointment.status,
        reason: !location ? "missing clinic" : "invalid date or time"
      });
      continue;
    }
    const key = activeSlotKey(location._id, appointment.date, time);
    if (!groups.has(key)) groups.set(key, { key, clinic: location.code, clinicName: location.clinicName, date: appointment.date, time, appointments: [] });
    groups.get(key).appointments.push({ appointmentId: appointment.appointmentId, status: appointment.status });
  }

  const duplicates = Array.from(groups.values()).filter((group) => group.appointments.length > 1);
  return {
    checkedActiveAppointments: appointments.length,
    uniqueActiveSlots: groups.size,
    duplicateSlotCount: duplicates.length,
    invalidRecordCount: invalid.length,
    duplicates,
    invalid
  };
}

async function backfillActiveSlotKeys() {
  const locations = await ClinicLocation.find().select("_id timezone").lean();
  const locationMap = new Map(locations.map((location) => [String(location._id), location]));
  const appointments = await Appointment.find().select("_id location date time status activeSlotKey slotTimezone").lean();
  const operations = [];
  for (const appointment of appointments) {
    if (appointmentOccupiesSlot(appointment.status)) {
      const location = locationMap.get(String(appointment.location));
      const time = normalizeTime(appointment.time);
      if (!location || !time) throw new Error(`Cannot backfill invalid active appointment ${appointment._id}`);
      operations.push({ updateOne: { filter: { _id: appointment._id }, update: { $set: {
        time,
        slotTimezone: location.timezone || "Asia/Karachi",
        activeSlotKey: activeSlotKey(appointment.location, appointment.date, time)
      } } } });
    } else if (appointment.activeSlotKey) {
      operations.push({ updateOne: { filter: { _id: appointment._id }, update: { $unset: { activeSlotKey: "" } } } });
    }
  }
  if (operations.length) await Appointment.bulkWrite(operations, { ordered: true });
  return operations.length;
}

module.exports = { auditActiveSlotData, backfillActiveSlotKeys };
