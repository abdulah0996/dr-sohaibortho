const { DateTime } = require("luxon");
const { connectDatabase, disconnectDatabase } = require("../src/config/db");
const { logError } = require("../src/utils/safeLogger");
const { ClinicLocation, ClinicSettings } = require("../src/models");
const { defaultWeeklyHours, normalizeTime } = require("../src/utils/time");
const { isValidTimezone, isValidWeeklyHours } = require("../src/domain/scheduleRules");

function validDate(value, timezone) {
  const parsed = DateTime.fromISO(String(value || ""), { zone: timezone });
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) && parsed.isValid && parsed.toISODate() === value;
}

function normalizedBlocks(location) {
  const seenDates = new Set();
  const blockedDates = [];
  for (const entry of location.blockedDates || []) {
    if (!validDate(entry.date, location.timezone) || seenDates.has(entry.date)) continue;
    seenDates.add(entry.date);
    blockedDates.push({ date: entry.date, reason: String(entry.reason || "Migrated clinic block").slice(0, 500), ...(entry.createdBy ? { createdBy: entry.createdBy } : {}), createdAt: entry.createdAt || new Date() });
  }
  const seenSlots = new Set();
  const blockedSlots = [];
  for (const entry of location.blockedSlots || []) {
    const time = normalizeTime(entry.time);
    const key = `${entry.date}|${time}`;
    if (!time || !validDate(entry.date, location.timezone) || seenSlots.has(key)) continue;
    seenSlots.add(key);
    blockedSlots.push({ date: entry.date, time, reason: String(entry.reason || "Migrated clinic block").slice(0, 500), ...(entry.createdBy ? { createdBy: entry.createdBy } : {}), createdAt: entry.createdAt || new Date() });
  }
  return { blockedDates, blockedSlots };
}

async function migrateClinicSchedules() {
  const legacySettings = await ClinicSettings.collection.findOne({ key: "default" });
  const locations = await ClinicLocation.collection.find({}).toArray();
  let migratedLocations = 0;
  for (const location of locations) {
    const proposedTimezone = location.timezone || legacySettings?.timezone || "Asia/Karachi";
    const timezone = isValidTimezone(proposedTimezone) ? proposedTimezone : "Asia/Karachi";
    let slotDurationMinutes = Number(location.slotDurationMinutes || legacySettings?.slotDurationMinutes || 15);
    let weeklyHours = isValidWeeklyHours(location.weeklyHours, slotDurationMinutes) ? location.weeklyHours : defaultWeeklyHours();
    if (!isValidWeeklyHours(weeklyHours, slotDurationMinutes)) {
      slotDurationMinutes = 15;
      weeklyHours = defaultWeeklyHours();
    }
    let status = location.status;
    if (["BWN", "RYK"].includes(location.code)) status = "Coming Soon";
    else if (status !== "Coming Soon" && (location.isActive === false || location.bookingEnabled === false)) status = "Inactive";
    else if (!["Active", "Inactive", "Coming Soon"].includes(status)) status = "Active";
    const blocks = normalizedBlocks({ ...location, timezone });
    await ClinicLocation.collection.updateOne(
      { _id: location._id },
      {
        $set: {
          status,
          timezone,
          weeklyHours,
          slotDurationMinutes,
          sameDayBookingCutoffMinutes: Number.isInteger(location.sameDayBookingCutoffMinutes) && location.sameDayBookingCutoffMinutes >= 0 && location.sameDayBookingCutoffMinutes <= 1440 ? location.sameDayBookingCutoffMinutes : 0,
          blockedDates: blocks.blockedDates,
          blockedSlots: blocks.blockedSlots,
          ...(location.code === "BWP" && !location.contactNumber && legacySettings?.contactNumber ? { contactNumber: legacySettings.contactNumber } : {})
        },
        $unset: { isActive: "", bookingEnabled: "" }
      }
    );
    migratedLocations += 1;
  }
  await ClinicSettings.collection.updateMany({}, { $unset: { contactNumber: "", timezone: "", slotDurationMinutes: "", weeklyHours: "", blockedDates: "", blockedSlots: "" } });
  const indexes = await ClinicLocation.collection.indexes();
  if (indexes.some((index) => index.name === "isActive_1_bookingEnabled_1_displayOrder_1")) {
    await ClinicLocation.collection.dropIndex("isActive_1_bookingEnabled_1_displayOrder_1");
  }
  await ClinicLocation.collection.createIndex({ status: 1, displayOrder: 1 }, { name: "status_1_displayOrder_1" });
  const bwp = await ClinicLocation.findOne({ code: "BWP" }).lean();
  if (!bwp || !isValidWeeklyHours(bwp.weeklyHours, bwp.slotDurationMinutes)) throw new Error("BWP authoritative schedule verification failed");
  const comingSoonCount = await ClinicLocation.countDocuments({ code: { $in: ["BWN", "RYK"] }, status: "Coming Soon" });
  if (comingSoonCount !== 2) throw new Error("Coming Soon clinic verification failed");
  const report = { migratedLocations, bwpSchedule: "verified", comingSoonClinics: comingSoonCount, scheduleIndex: "verified" };
  console.log(JSON.stringify(report));
  return report;
}

async function main() {
  await connectDatabase({ autoIndex: false });
  await migrateClinicSchedules();
  await disconnectDatabase();
}

if (require.main === module) {
  main().catch(async (error) => {
    logError("Clinic schedule migration failed", error);
    await disconnectDatabase().catch(() => {});
    process.exitCode = 1;
  });
}

module.exports = { migrateClinicSchedules };
