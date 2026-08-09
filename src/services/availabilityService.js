const { DateTime } = require("luxon");
const { Appointment, ClinicLocation } = require("../models");
const { badRequest, conflict, notFound } = require("../utils/errors");
const {
  generateScheduleSlots,
  validateSlotAgainstSchedule,
  nowInClinicZone,
  normalizeTime
} = require("../utils/time");
const { getBookableLocation, getLocation } = require("./locationService");
const { OCCUPYING_APPOINTMENT_STATUSES, activeSlotKey } = require("../domain/appointmentRules");

function isBlockedDate(settings, date) {
  return (settings.blockedDates || []).some((entry) => entry.date === date);
}

function isBlockedSlot(settings, date, time) {
  return (settings.blockedSlots || []).some((entry) => entry.date === date && normalizeTime(entry.time) === time);
}

function validateAdministrativeDate(settings, date, { allowPast = false } = {}) {
  const parsed = DateTime.fromISO(date, { zone: settings.timezone });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) || !parsed.isValid || parsed.toISODate() !== date) {
    throw badRequest("Use a valid date in YYYY-MM-DD format.");
  }
  if (!allowPast && parsed.startOf("day") < nowInClinicZone(settings.timezone).startOf("day")) throw badRequest("Past dates cannot be blocked.");
}

async function ensureSlotBookable(locationId, date, time) {
  const settings = await getBookableLocation(locationId);
  const normalizedTime = normalizeTime(time);
  if (!normalizedTime) throw badRequest("Use a valid appointment time.");
  const validation = validateSlotAgainstSchedule({ settings, date, time: normalizedTime });
  if (!validation.ok) throw badRequest(validation.reason);
  if (isBlockedDate(settings, date)) throw conflict("The selected date is blocked by the clinic.");
  if (isBlockedSlot(settings, date, normalizedTime)) throw conflict("The selected time slot is blocked by the clinic.");

  const existing = await Appointment.findOne({
    $or: [
      { activeSlotKey: activeSlotKey(settings._id, date, normalizedTime) },
      { location: settings._id, date, time: normalizedTime, status: { $in: OCCUPYING_APPOINTMENT_STATUSES } }
    ]
  });
  if (existing) throw conflict("Slot no longer available");
  return { settings, time: normalizedTime, slotKey: activeSlotKey(settings._id, date, normalizedTime) };
}

async function getAvailableSlots(locationId, date) {
  const settings = await getBookableLocation(locationId);
  validateAdministrativeDate(settings, date, { allowPast: true });
  if (isBlockedDate(settings, date)) return [];
  const scheduleSlots = generateScheduleSlots(settings, date);
  const bookedAppointments = await Appointment.find({ location: settings._id, date, status: { $in: OCCUPYING_APPOINTMENT_STATUSES } }).select("time").lean();
  const blocked = new Set((settings.blockedSlots || []).filter((slot) => slot.date === date).map((slot) => normalizeTime(slot.time)));
  const booked = new Set(bookedAppointments.map((appointment) => normalizeTime(appointment.time)));
  const now = nowInClinicZone(settings.timezone);

  return scheduleSlots
    .filter((time) => validateSlotAgainstSchedule({ settings, date, time, now }).ok)
    .map((time) => ({ time, available: !blocked.has(time) && !booked.has(time), blocked: blocked.has(time), booked: booked.has(time) }));
}

async function getAvailableDates(locationId, days = 21) {
  const settings = await getBookableLocation(locationId);
  const today = nowInClinicZone(settings.timezone).startOf("day");
  const dates = [];
  for (let i = 0; i < Number(days || 21); i += 1) {
    const date = today.plus({ days: i }).toISODate();
    const slots = await getAvailableSlots(settings._id, date);
    if (slots.some((slot) => slot.available)) dates.push({ date, availableSlots: slots.filter((slot) => slot.available).length });
  }
  return dates;
}

async function appointmentsForBlock(locationId, date, time) {
  const filter = { location: locationId, date, status: { $in: OCCUPYING_APPOINTMENT_STATUSES } };
  if (time) filter.time = time;
  return Appointment.find(filter).select("appointmentId time").lean();
}

async function blockDate({ locationId, date, reason, staffUser, confirmExistingAppointments = false }) {
  const settings = await getLocation(locationId);
  validateAdministrativeDate(settings, date);
  const entry = { date, reason, createdBy: staffUser?._id, createdAt: new Date() };
  const updated = await ClinicLocation.findOneAndUpdate(
    { _id: settings._id, blockedDates: { $not: { $elemMatch: { date } } } },
    { $push: { blockedDates: entry } },
    { new: true, runValidators: true }
  );
  if (!updated) throw conflict("This date is already blocked.");
  const appointments = await appointmentsForBlock(settings._id, date);
  if (appointments.length && !confirmExistingAppointments) {
    await ClinicLocation.updateOne({ _id: settings._id }, { $pull: { blockedDates: { date } } });
    throw conflict("This date contains existing appointments. Confirm explicitly to block it without cancelling patients.", {
      requiresConfirmation: true,
      appointmentCount: appointments.length,
      appointmentIds: appointments.slice(0, 20).map((appointment) => appointment.appointmentId)
    });
  }
  return { ...entry, conflictingAppointmentsPreserved: appointments.length };
}

async function unblockDate(locationId, date) {
  const settings = await getLocation(locationId);
  validateAdministrativeDate(settings, date, { allowPast: true });
  const result = await ClinicLocation.updateOne({ _id: settings._id, "blockedDates.date": date }, { $pull: { blockedDates: { date } } });
  if (result.modifiedCount !== 1) throw notFound("Blocked date was not found.");
  return { date };
}

async function blockSlot({ locationId, date, time, reason, staffUser, confirmExistingAppointments = false }) {
  const settings = await getLocation(locationId);
  validateAdministrativeDate(settings, date);
  const normalizedTime = normalizeTime(time);
  const validation = validateSlotAgainstSchedule({ settings: { ...settings.toObject(), sameDayBookingCutoffMinutes: 0 }, date, time: normalizedTime, now: DateTime.fromISO(`${date}T00:00`, { zone: settings.timezone }).minus({ days: 1 }) });
  if (!validation.ok) throw badRequest(validation.reason);
  const entry = { date, time: normalizedTime, reason, createdBy: staffUser?._id, createdAt: new Date() };
  const updated = await ClinicLocation.findOneAndUpdate(
    { _id: settings._id, blockedSlots: { $not: { $elemMatch: { date, time: normalizedTime } } } },
    { $push: { blockedSlots: entry } },
    { new: true, runValidators: true }
  );
  if (!updated) throw conflict("This time slot is already blocked.");
  const appointments = await appointmentsForBlock(settings._id, date, normalizedTime);
  if (appointments.length && !confirmExistingAppointments) {
    await ClinicLocation.updateOne({ _id: settings._id }, { $pull: { blockedSlots: { date, time: normalizedTime } } });
    throw conflict("This time slot contains an existing appointment. Confirm explicitly to block it without cancelling the patient.", {
      requiresConfirmation: true,
      appointmentCount: appointments.length,
      appointmentIds: appointments.slice(0, 20).map((appointment) => appointment.appointmentId)
    });
  }
  return { ...entry, conflictingAppointmentsPreserved: appointments.length };
}

async function unblockSlot(locationId, date, time) {
  const settings = await getLocation(locationId);
  validateAdministrativeDate(settings, date, { allowPast: true });
  const normalizedTime = normalizeTime(time);
  if (!normalizedTime) throw badRequest("Use a valid appointment time.");
  const result = await ClinicLocation.updateOne(
    { _id: settings._id, blockedSlots: { $elemMatch: { date, time: normalizedTime } } },
    { $pull: { blockedSlots: { date, time: normalizedTime } } }
  );
  if (result.modifiedCount !== 1) throw notFound("Blocked slot was not found.");
  return { date, time: normalizedTime };
}

async function getScheduleSummary(locationId, date) {
  const settings = await getLocation(locationId);
  validateAdministrativeDate(settings, date, { allowPast: true });
  const possible = generateScheduleSlots(settings, date);
  const bookedAppointments = await appointmentsForBlock(settings._id, date);
  const cancelledAppointments = await Appointment.countDocuments({ location: settings._id, date, status: "cancelled" });
  const fullDateBlocked = isBlockedDate(settings, date);
  const scheduledBlocked = new Set((settings.blockedSlots || []).filter((entry) => entry.date === date && possible.includes(normalizeTime(entry.time))).map((entry) => normalizeTime(entry.time)));
  let availableSlots = 0;
  const selectedDay = DateTime.fromISO(date, { zone: settings.timezone }).startOf("day");
  const today = nowInClinicZone(settings.timezone).startOf("day");
  if (settings.status === "Active" && !fullDateBlocked && selectedDay >= today) {
    availableSlots = (await getAvailableSlots(settings._id, date)).filter((slot) => slot.available).length;
  }
  return {
    location: { id: settings._id, code: settings.code, clinicName: settings.clinicName, status: settings.status, timezone: settings.timezone },
    date,
    totalPossibleSlots: possible.length,
    bookedSlots: bookedAppointments.length,
    availableSlots,
    blockedSlots: fullDateBlocked ? possible.length : scheduledBlocked.size,
    cancelledAppointments,
    upcomingBlockedDates: (settings.blockedDates || []).filter((entry) => entry.date >= date).length
  };
}

module.exports = {
  ensureSlotBookable,
  getAvailableSlots,
  getAvailableDates,
  getScheduleSummary,
  blockDate,
  unblockDate,
  blockSlot,
  unblockSlot,
  isBlockedDate,
  isBlockedSlot
};
