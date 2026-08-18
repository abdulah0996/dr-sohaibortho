const express = require("express");
const { DateTime } = require("luxon");
const { z } = require("zod");
const { Appointment, Patient, MedicalReport, OnlineConsultation, EmergencyAlert, ConversationSession } = require("../models");
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");
const { audit } = require("../services/auditService");
const { getScheduleSummary } = require("../services/availabilityService");
const { config } = require("../config/env");
const { badRequest } = require("../utils/errors");

const router = express.Router();
router.use(requireAuth, requirePermission("dashboard.read"));

// GET /api/dashboard/summary
router.get("/summary", asyncHandler(async (req, res) => {
  const parsed = z.object({
    locationId: z.string().min(2).max(24).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
  }).strict().safeParse(req.query);
  if (!parsed.success) throw badRequest("Invalid dashboard clinic or date selection.");
  const selectedDate = parsed.data.date || DateTime.now().setZone(config.clinicTimezone).toISODate();
  const availability = await getScheduleSummary(parsed.data.locationId || "BWP", selectedDate);
  const selection = { location: availability.location.id, date: selectedDate };

  const [
    totalAppointments,
    todayAppointments,
    todayConfirmed,
    todayCompleted,
    todayCancelled,
    noShows,
    totalPatients,
    pendingReports,
    pendingConsultations,
    activeEmergencies,
    humanHandovers,
  ] = await Promise.all([
    Appointment.countDocuments(selection),
    Appointment.countDocuments(selection),
    Appointment.countDocuments({ ...selection, status: { $in: ["confirmed", "patient_confirmed"] } }),
    Appointment.countDocuments({ ...selection, status: "completed" }),
    Appointment.countDocuments({ ...selection, status: "cancelled" }),
    Appointment.countDocuments({ ...selection, status: "no_show" }),
    Patient.countDocuments(),
    MedicalReport.countDocuments({ status: { $in: ["New", "pending", "Uploaded", "Received"] } }),
    OnlineConsultation.countDocuments({ status: { $in: ["pending", "Pending", "under_review", "Under Review"] } }),
    EmergencyAlert.countDocuments({ status: "open" }),
    ConversationSession.countDocuments({ humanRequired: true })
  ]);

  await audit({ actorType: "staff", action: "dashboard.summary_viewed", entityType: "dashboard", req });
  res.json({
    success: true,
    summary: {
      totalAppointments,
      todayAppointments,
      todayConfirmed,
      todayCompleted,
      todayCancelled,
      noShows,
      selectedClinic: availability.location,
      selectedDate,
      totalPossibleSlots: availability.totalPossibleSlots,
      bookedSlots: availability.bookedSlots,
      availableSlots: availability.availableSlots,
      blockedSlots: availability.blockedSlots,
      cancelledAppointments: availability.cancelledAppointments,
      blockedSlotsCount: availability.blockedSlots,
      upcomingOffDaysCount: availability.upcomingBlockedDates,
      totalPatients,
      pendingReports,
      pendingConsultations,
      activeEmergencies,
      humanHandovers
    }
  });
}));

// GET /api/dashboard/recent-appointments
router.get("/recent-appointments", requirePermission("appointments.read"), asyncHandler(async (req, res) => {
  let query = Appointment.find()
    .populate("patient", "patientId fullName phoneE164 preferredLanguage city")
    .populate("location", "clinicName city code fullAddress contactNumber timezone")
    .sort({ createdAt: -1 })
    .limit(10);
  if (req.user.role === "clinic_staff") {
    query = query.select("appointmentId tokenNumber appointmentType patientSnapshot date time status locationSnapshot createdAt");
  }
  const appointments = await query.lean();
  await audit({ actorType: "staff", action: "appointments.recent_viewed", entityType: "appointment", req });
  res.json({ success: true, appointments });
}));

// GET /api/dashboard/recent-reports
router.get("/recent-reports", requirePermission("reports.read"), asyncHandler(async (req, res) => {
  const reports = await MedicalReport.find()
    .select("-storageKey -fileUrl")
    .populate("patient", "patientId fullName phoneE164 preferredLanguage city")
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();
  await audit({ actorType: "staff", action: "reports.recent_viewed", entityType: "report", req });
  res.json({ success: true, reports });
}));

// GET /api/dashboard/recent-consultations
router.get("/recent-consultations", requirePermission("consultations.read"), asyncHandler(async (req, res) => {
  const consultations = await OnlineConsultation.find()
    .populate("patient", "patientId fullName phoneE164 preferredLanguage city")
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();
  await audit({ actorType: "staff", action: "consultations.recent_viewed", entityType: "consultation", req });
  res.json({ success: true, consultations });
}));

// GET /api/dashboard/emergency-alerts
router.get("/emergency-alerts", requirePermission("emergencies.read"), asyncHandler(async (req, res) => {
  const alerts = await EmergencyAlert.find()
    .populate("patient", "patientId fullName phoneE164 preferredLanguage city")
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();
  await audit({ actorType: "staff", action: "emergencies.recent_viewed", entityType: "emergency", req });
  res.json({ success: true, alerts, emergencyAlerts: alerts });
}));

module.exports = router;
