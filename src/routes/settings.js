const express = require("express");
const { z } = require("zod");
const {
  getClinicSettings,
  updateClinicSettings,
  getDoctorProfile,
  updateDoctorProfile,
  listAuditLogs
} = require("../services/settingsService");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");
const { audit } = require("../services/auditService");
const { asyncHandler } = require("../utils/asyncHandler");
const { badRequest } = require("../utils/errors");

const router = express.Router();

function validate(schema, body) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw badRequest("Validation failed", parsed.error.flatten());
  return parsed.data;
}

router.get("/clinic", requireAuth, requirePermission("settings.read"), asyncHandler(async (req, res) => {
  res.json({ success: true, clinic: await getClinicSettings() });
}));

router.put("/clinic", requireAuth, requirePermission("settings.manage"), asyncHandler(async (req, res) => {
  const input = validate(z.object({
    contactNumber: z.string().min(5).max(40).optional(),
    status: z.enum(["Active", "Inactive", "Coming Soon"]).optional(),
    timezone: z.string().min(3).max(80).optional(),
    slotDurationMinutes: z.coerce.number().int().min(5).max(240).optional(),
    sameDayBookingCutoffMinutes: z.coerce.number().int().min(0).max(1440).optional(),
    weeklyHours: z.array(z.object({
      day: z.coerce.number().int().min(1).max(7),
      isOpen: z.boolean(),
      start: z.string().regex(/^\d{2}:\d{2}$/),
      end: z.string().regex(/^\d{2}:\d{2}$/)
    })).length(7).optional(),
    remindersEnabled: z.boolean().optional(),
    reminderIntervalsMinutes: z.array(z.coerce.number().int().min(1).max(525600)).max(10).refine((values) => new Set(values).size === values.length, "Reminder intervals must be unique.").optional(),
    arrivalLeadMinutes: z.coerce.number().int().min(0).max(120).optional(),
    currentDelayMinutes: z.coerce.number().int().min(0).max(480).optional(),
    delayEffectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    approvedDoctorWelcome: z.object({
      enabled: z.boolean(),
      mediaType: z.enum(["audio", "video"]),
      mediaId: z.string().regex(/^[A-Za-z0-9._:-]{3,300}$/)
    }).strict().optional(),
    confirmExistingAppointments: z.boolean().optional()
  }).strict(), req.body);
  const previous = await getClinicSettings();
  const clinic = await updateClinicSettings(input, req.user, { confirmExistingAppointments: input.confirmExistingAppointments === true });
  const summary = (value) => ({
    timezone: value.timezone,
    slotDurationMinutes: value.slotDurationMinutes,
    sameDayBookingCutoffMinutes: value.sameDayBookingCutoffMinutes,
    remindersEnabled: value.remindersEnabled,
    reminderIntervalsMinutes: value.reminderIntervalsMinutes
  });
  await audit({
    actorType: "staff",
    action: input.remindersEnabled !== undefined || input.reminderIntervalsMinutes !== undefined ? "clinic.reminder_settings_updated" : "clinic_schedule.updated",
    entityType: "location",
    entityId: String(clinic.locationId),
    metadata: { changedFields: Object.keys(input).filter((key) => key !== "confirmExistingAppointments") },
    before: summary(previous),
    after: summary(clinic),
    req
  });
  res.json({ success: true, clinic });
}));

router.get("/doctor-profile", requireAuth, requirePermission("settings.read"), asyncHandler(async (req, res) => {
  res.json({ success: true, doctorProfile: await getDoctorProfile() });
}));

router.put("/doctor-profile", requireAuth, requirePermission("doctor_profile.manage"), asyncHandler(async (req, res) => {
  const input = validate(z.object({
    doctorName: z.string().min(2).max(120).optional(),
    contactNumber: z.string().min(5).max(40).optional(),
    specialty: z.string().max(200).optional(),
    qualifications: z.string().max(400).optional(),
    experience: z.string().max(200).optional(),
    biography: z.string().max(2000).optional(),
    clinicLocation: z.string().max(600).optional(),
    profileImageUrl: z.string().max(500).optional()
  }), req.body);
  const doctorProfile = await updateDoctorProfile(input, req.user);
  await audit({ actorType: "staff", action: "doctor_profile.updated", entityType: "doctor_profile", entityId: String(doctorProfile._id), req });
  res.json({ success: true, doctorProfile });
}));

router.get("/audit-logs", requireAuth, requirePermission("audit.read"), asyncHandler(async (req, res) => {
  const auditLogs = await listAuditLogs({ limit: req.query.limit });
  await audit({ actorType: "staff", action: "audit_logs.viewed", entityType: "audit_log", metadata: { resultCount: auditLogs.length }, req });
  res.json({ success: true, auditLogs });
}));

module.exports = router;
