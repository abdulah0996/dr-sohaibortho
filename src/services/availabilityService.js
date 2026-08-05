const { DateTime } = require("luxon");
const { Appointment } = require("../models");
const { badRequest, conflict, notFound } = require("../utils/errors");
const {
  generateScheduleSlots,
  validateSlotAgainstSchedule,
  nowInClinicZone,
  appointmentDateTime,
  slotKey
} = require("../utils/time");
const { getBookableLocation } = require("./locationService");

async function ensureSlotBookable(locationId, date, time) {
  const settings = await getBookableLocation(locationId);
  const validation = validateSlotAgainstSchedule({ settings, date, time });
  if (!validation.ok) throw badRequest(validation.reason);

  if ((settings.blockedDates || []).some((entry) => entry.date === date)) throw conflict("The selected date is blocked by the clinic.");
  if ((settings.blockedSlots || []).some((entry) => entry.date === date && entry.time === time)) throw conflict("The selected time slot is blocked by the clinic.");

  const existing = await Appointment.findOne({
    activeSlotKey: slotKey(settings._id, date, time),
    status: { $in: ["scheduled", "rescheduled"] }
  });
  if (existing) throw conflict("The selected appointment slot is already booked.");

  return true;
}

async function getAvailableSlots(locationId, date) {
  const settings = await getBookableLocation(locationId);
  if ((settings.blockedDates || []).some((entry) => entry.date === date)) return [];

  const scheduleSlots = generateScheduleSlots(settings, date);
  const bookedAppointments = await Appointment.find({ location: settings._id, date, status: { $in: ["scheduled", "rescheduled"] } }).select("time").lean();

  const blocked = new Set((settings.blockedSlots || []).filter((slot) => slot.date === date).map((slot) => slot.time));
  const booked = new Set(bookedAppointments.map((appointment) => appointment.time));
  const now = nowInClinicZone(settings.timezone);

  return scheduleSlots
    .filter((time) => appointmentDateTime(date, time, settings.timezone) > now)
    .map((time) => ({
      time,
      available: !blocked.has(time) && !booked.has(time),
      blocked: blocked.has(time),
      booked: booked.has(time)
    }));
}

async function getAvailableDates(locationId, days = 21) {
  const settings = await getBookableLocation(locationId);
  const today = nowInClinicZone(settings.timezone).startOf("day");
  const dates = [];

  for (let i = 0; i < Number(days || 21); i += 1) {
    const date = today.plus({ days: i }).toISODate();
    const slots = await getAvailableSlots(settings._id, date);
    if (slots.some((slot) => slot.available)) {
      dates.push({ date, availableSlots: slots.filter((slot) => slot.available).length });
    }
  }

  return dates;
}

async function blockDate({ locationId, date, reason }) {
  const settings = await getBookableLocation(locationId);
  const parsed = DateTime.fromISO(date, { zone: settings.timezone });
  if (!parsed.isValid) throw badRequest("Use a valid date in YYYY-MM-DD format.");
  settings.blockedDates = (settings.blockedDates || []).filter((entry) => entry.date !== date);
  settings.blockedDates.push({ date, reason }); await settings.save(); return { date, reason };
}

async function unblockDate(locationId, date) {
  const settings = await getBookableLocation(locationId); const before = settings.blockedDates.length;
  settings.blockedDates = settings.blockedDates.filter((entry) => entry.date !== date); if (before === settings.blockedDates.length) throw notFound("Blocked date was not found.");
  await settings.save(); return { date };
}

async function blockSlot({ locationId, date, time, reason }) {
  const settings = await getBookableLocation(locationId);
  const validation = validateSlotAgainstSchedule({
    settings,
    date,
    time,
    now: nowInClinicZone(settings.timezone).minus({ years: 1 })
  });
  if (!validation.ok) throw badRequest(validation.reason);

  settings.blockedSlots = (settings.blockedSlots || []).filter((entry) => !(entry.date === date && entry.time === time));
  settings.blockedSlots.push({ date, time, reason }); await settings.save(); return { date, time, reason };
}

async function unblockSlot(locationId, date, time) {
  const settings = await getBookableLocation(locationId); const before = settings.blockedSlots.length;
  settings.blockedSlots = settings.blockedSlots.filter((entry) => !(entry.date === date && entry.time === time)); if (before === settings.blockedSlots.length) throw notFound("Blocked slot was not found.");
  await settings.save(); return { date, time };
}

module.exports = {
  ensureSlotBookable,
  getAvailableSlots,
  getAvailableDates,
  blockDate,
  unblockDate,
  blockSlot,
  unblockSlot
};
