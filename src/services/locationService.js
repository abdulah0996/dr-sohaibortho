const { ClinicLocation } = require("../models");
const { badRequest, notFound } = require("../utils/errors");
const { defaultWeeklyHours } = require("../utils/time");

const initialLocations = [
  {
    clinicName: "Iqbal Hospital", city: "Bahawalpur", code: "BWP",
    fullAddress: "Noor Mahal Road, Bahawalpur", isActive: true, bookingEnabled: true,
    timezone: "Asia/Karachi", slotDurationMinutes: 15, weeklyHours: defaultWeeklyHours(), displayOrder: 1
  },
  { clinicName: "Coming Soon", city: "Bahawalnagar", code: "BWN", fullAddress: "To be confirmed", isActive: false, bookingEnabled: false, timezone: "Asia/Karachi", weeklyHours: defaultWeeklyHours(), displayOrder: 2 },
  { clinicName: "Coming Soon", city: "Rahim Yar Khan", code: "RYK", fullAddress: "To be confirmed", isActive: false, bookingEnabled: false, timezone: "Asia/Karachi", weeklyHours: defaultWeeklyHours(), displayOrder: 3 }
];

async function ensureInitialLocations() {
  if (await ClinicLocation.exists({})) return;
  await ClinicLocation.insertMany(initialLocations);
}

async function listLocations({ bookableOnly = false } = {}) {
  await ensureInitialLocations();
  const filter = bookableOnly ? { isActive: true, bookingEnabled: true } : {};
  return ClinicLocation.find(filter).sort({ displayOrder: 1, city: 1 }).lean();
}

async function getBookableLocation(idOrCode) {
  await ensureInitialLocations();
  const query = /^[a-f\d]{24}$/i.test(String(idOrCode || ""))
    ? { _id: idOrCode }
    : { code: String(idOrCode || "").replace(/^LOCATION_/, "").toUpperCase() };
  const location = await ClinicLocation.findOne(query);
  if (!location) throw notFound("Clinic location was not found.");
  if (!location.isActive || !location.bookingEnabled) throw badRequest("This clinic location is not accepting bookings.");
  return location;
}

module.exports = { initialLocations, ensureInitialLocations, listLocations, getBookableLocation };
