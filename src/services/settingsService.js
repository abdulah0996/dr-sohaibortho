const { ClinicSettings, DoctorProfile, AuditLog } = require("../models");
const { getLocation } = require("./locationService");
const { updateLocation } = require("./scheduleService");
const { config } = require("../config/env");
const { notFound } = require("../utils/errors");

async function getClinicSettings() {
  let settings = await ClinicSettings.findOne({ key: "default" });
  if (!settings) {
    settings = await ClinicSettings.create({
      key: "default",
      remindersEnabled: true,
      reminderIntervalsMinutes: [4320, 1440, 120]
    });
  }
  const location = await getLocation("BWP");
  return {
    ...settings.toObject(),
    locationId: location._id,
    locationCode: location.code,
    contactNumber: location.contactNumber,
    status: location.status,
    timezone: location.timezone,
    slotDurationMinutes: location.slotDurationMinutes,
    sameDayBookingCutoffMinutes: location.sameDayBookingCutoffMinutes,
    weeklyHours: location.weeklyHours,
    blockedDates: location.blockedDates,
    blockedSlots: location.blockedSlots
  };
}

async function updateClinicSettings(input, staffUser, options = {}) {
  const location = await getLocation("BWP");
  const scheduleUpdate = {};
  for (const key of ["contactNumber", "status", "timezone", "slotDurationMinutes", "sameDayBookingCutoffMinutes", "weeklyHours"]) {
    if (input[key] !== undefined) scheduleUpdate[key] = input[key];
  }
  if (Object.keys(scheduleUpdate).length) {
    await updateLocation(location._id, scheduleUpdate, { confirmExistingAppointments: options.confirmExistingAppointments === true });
  }
  if (["reminderIntervalsMinutes", "remindersEnabled", "arrivalLeadMinutes", "currentDelayMinutes", "delayEffectiveDate", "approvedDoctorWelcome"].some((key) => input[key] !== undefined)) {
    const reminderUpdate = { updatedBy: staffUser?._id };
    if (input.reminderIntervalsMinutes !== undefined) reminderUpdate.reminderIntervalsMinutes = [...new Set(input.reminderIntervalsMinutes)].sort((a, b) => b - a);
    if (input.remindersEnabled !== undefined) reminderUpdate.remindersEnabled = input.remindersEnabled;
    if (input.arrivalLeadMinutes !== undefined) reminderUpdate.arrivalLeadMinutes = input.arrivalLeadMinutes;
    if (input.currentDelayMinutes !== undefined) reminderUpdate.currentDelayMinutes = input.currentDelayMinutes;
    if (input.delayEffectiveDate !== undefined) reminderUpdate.delayEffectiveDate = input.delayEffectiveDate;
    if (input.approvedDoctorWelcome !== undefined) {
      reminderUpdate.approvedDoctorWelcome = {
        ...input.approvedDoctorWelcome,
        approvedAt: input.approvedDoctorWelcome.enabled ? new Date() : undefined
      };
    }
    await ClinicSettings.findOneAndUpdate(
      { key: "default" },
      { $set: reminderUpdate },
      { new: true, upsert: true, runValidators: true }
    );
  }
  return getClinicSettings();
}

async function getDoctorProfile() {
  let profile = await DoctorProfile.findOne({ doctorKey: "dr-sohaib" });
  if (!profile) {
    if (config.isProduction) throw notFound("Doctor profile has not been configured.");
    profile = await DoctorProfile.create({
      doctorKey: "dr-sohaib",
      doctorName: "Dr. Shoaib Aslam",
      profileImage: ""
    });
  }
  return profile;
}

async function updateDoctorProfile(input, staffUser) {
  const allowed = {
    doctorName: input.doctorName,
    specialty: input.specialty,
    qualification: input.qualifications,
    experience: input.experience,
    bio: input.biography,
    consultationLocation: input.clinicLocation,
    profileImage: input.profileImageUrl
  };

  Object.keys(allowed).forEach((key) => allowed[key] === undefined && delete allowed[key]);

  if (config.isProduction && !(await DoctorProfile.exists({ doctorKey: "dr-sohaib" }))) {
    return DoctorProfile.create({
      doctorKey: "dr-sohaib",
      doctorName: "",
      profileImage: "",
      qualification: "",
      specialty: "",
      experience: "",
      services: "",
      consultationLocation: "",
      consultationDays: "",
      consultationTimings: "",
      bio: "",
      ...allowed
    });
  }

  return DoctorProfile.findOneAndUpdate(
    { doctorKey: "dr-sohaib" },
    { $set: allowed },
    { new: true, upsert: true, runValidators: true }
  );
}

async function listAuditLogs({ limit = 100 } = {}) {
  return AuditLog.find().sort({ createdAt: -1 }).limit(Math.max(1, Math.min(Number(limit) || 100, 300))).lean();
}

module.exports = {
  getClinicSettings,
  updateClinicSettings,
  getDoctorProfile,
  updateDoctorProfile,
  listAuditLogs
};
