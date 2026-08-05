const express = require("express");
const { DateTime } = require("luxon");
const { Appointment, Patient, MedicalReport, OnlineConsultation, EmergencyAlert, ConversationSession, ClinicLocation } = require("../models");
const { asyncHandler } = require("../utils/asyncHandler");

const router = express.Router();

// GET /api/dashboard/summary
router.get("/summary", asyncHandler(async (req, res) => {
  const todayStr = DateTime.now().setZone("Asia/Karachi").toISODate();

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
    locations
  ] = await Promise.all([
    Appointment.countDocuments(),
    Appointment.countDocuments({ date: todayStr }),
    Appointment.countDocuments({ date: todayStr, status: { $in: ["confirmed", "patient_confirmed"] } }),
    Appointment.countDocuments({ date: todayStr, status: "completed" }),
    Appointment.countDocuments({ date: todayStr, status: "cancelled" }),
    Appointment.countDocuments({ status: "no_show" }),
    Patient.countDocuments(),
    MedicalReport.countDocuments({ status: { $in: ["New", "pending", "Uploaded", "Received"] } }),
    OnlineConsultation.countDocuments({ status: { $in: ["pending", "Pending", "under_review", "Under Review"] } }),
    EmergencyAlert.countDocuments({ status: "open" }),
    ConversationSession.countDocuments({ humanRequired: true }),
    ClinicLocation.find({ isActive: true }).lean()
  ]);

  // Calculate blocked slots and available slots
  let blockedSlotsCount = 0;
  let upcomingOffDaysCount = 0;

  locations.forEach(loc => {
    if (Array.isArray(loc.blockedSlots)) {
      blockedSlotsCount += loc.blockedSlots.length;
    }
    if (Array.isArray(loc.blockedDates)) {
      upcomingOffDaysCount += loc.blockedDates.length;
    }
  });

  const availableSlots = Math.max(0, 16 - todayConfirmed - todayCompleted);

  res.json({
    success: true,
    summary: {
      totalAppointments,
      todayAppointments,
      todayConfirmed,
      todayCompleted,
      todayCancelled,
      noShows,
      availableSlots,
      blockedSlotsCount,
      upcomingOffDaysCount,
      totalPatients,
      pendingReports,
      pendingConsultations,
      activeEmergencies,
      humanHandovers
    }
  });
}));

// GET /api/dashboard/recent-appointments
router.get("/recent-appointments", asyncHandler(async (req, res) => {
  const appointments = await Appointment.find()
    .populate("patient location")
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();
  res.json({ success: true, appointments });
}));

// GET /api/dashboard/recent-reports
router.get("/recent-reports", asyncHandler(async (req, res) => {
  const reports = await MedicalReport.find()
    .populate("patient")
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();
  res.json({ success: true, reports });
}));

// GET /api/dashboard/recent-consultations
router.get("/recent-consultations", asyncHandler(async (req, res) => {
  const consultations = await OnlineConsultation.find()
    .populate("patient")
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();
  res.json({ success: true, consultations });
}));

// GET /api/dashboard/emergency-alerts
router.get("/emergency-alerts", asyncHandler(async (req, res) => {
  const alerts = await EmergencyAlert.find()
    .populate("patient")
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();
  res.json({ success: true, alerts, emergencyAlerts: alerts });
}));

module.exports = router;
