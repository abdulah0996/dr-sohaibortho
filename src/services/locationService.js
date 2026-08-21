const { ClinicLocation } = require("../models");
const { badRequest, notFound } = require("../utils/errors");
const { defaultWeeklyHours } = require("../utils/time");
const { config } = require("../config/env");

const initialLocations = [
  {
    clinicName: "Iqbal Hospital", city: "Bahawalpur", code: "BWP",
    fullAddress: "Noor Mahal Road, Bahawalpur", status: "Active",
    timezone: "Asia/Karachi", slotDurationMinutes: 20, sameDayBookingCutoffMinutes: 0, weeklyHours: defaultWeeklyHours(), displayOrder: 1
  },
  { clinicName: "Coming Soon", city: "Bahawalnagar", code: "BWN", fullAddress: "To be confirmed", status: "Coming Soon", timezone: "Asia/Karachi", weeklyHours: defaultWeeklyHours(), displayOrder: 2 },
  { clinicName: "Coming Soon", city: "Rahim Yar Khan", code: "RYK", fullAddress: "To be confirmed", status: "Coming Soon", timezone: "Asia/Karachi", weeklyHours: defaultWeeklyHours(), displayOrder: 3 }
];

async function ensureInitialLocations() {
  if (await ClinicLocation.exists({})) return;
  if (config.isProduction) return;
  await ClinicLocation.insertMany(initialLocations);
}

async function listLocations({ bookableOnly = false } = {}) {
  await ensureInitialLocations();
  const filter = bookableOnly ? { status: "Active" } : {};
  return ClinicLocation.find(filter).sort({ displayOrder: 1, city: 1 }).lean();
}

async function getLocation(idOrCode) {
  await ensureInitialLocations();
  const query = /^[a-f\d]{24}$/i.test(String(idOrCode || ""))
    ? { _id: idOrCode }
    : { code: String(idOrCode || "").replace(/^LOCATION_/, "").toUpperCase() };
  const location = await ClinicLocation.findOne(query);
  if (!location) throw notFound("Clinic location was not found.");
  return location;
}

async function getBookableLocation(idOrCode) {
  const location = await getLocation(idOrCode);
  if (location.status !== "Active") throw badRequest("This clinic location is not accepting bookings.");
  return location;
}

module.exports = { initialLocations, ensureInitialLocations, listLocations, getLocation, getBookableLocation };
