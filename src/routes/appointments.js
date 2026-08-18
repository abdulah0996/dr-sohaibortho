const express = require("express");
const { z } = require("zod");
const {
  createAppointment,
  lookupAppointment,
  listAppointments,
  getAppointmentById,
  rescheduleAppointment,
  cancelAppointment,
  updateAppointmentStatus,
  requestEarlierSlot,
  recordConsentDecision,
  safePublicAppointment
} = require("../services/appointmentService");
const { Appointment } = require("../models");
const { requireAuth } = require("../middleware/auth");
const { requirePermission, canSetAppointmentStatus } = require("../middleware/permissions");
const { publicFormLimiter, patientVerificationLimiter } = require("../middleware/security");
const { asyncHandler } = require("../utils/asyncHandler");
const { badRequest, forbidden, notFound } = require("../utils/errors");
const { audit } = require("../services/auditService");
const { config } = require("../config/env");
const { attachOwnerEmailStatuses, retryOwnerAppointmentEmail } = require("../services/ownerEmailOutboxService");
const { requireObjectIdParam } = require("../middleware/validation");

const router = express.Router();

function validate(schema, body) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw badRequest("Validation failed", parsed.error.flatten());
  return parsed.data;
}

const appointmentSchema = z.object({
  fullName: z.string().min(2).max(160),
  phone: z.string().min(7).max(40),
  age: z.coerce.number().int().min(0).max(130).optional(),
  gender: z.enum(["female", "male", "other", "not_provided"]).optional(),
  appointmentType: z.enum(["in_person", "online", "In-Person", "Online"]).optional(),
  preferredLanguage: z.string().max(30).optional(),
  reason: z.string().min(2).max(1000).optional().or(z.literal("")),
  optionalNote: z.string().max(1000).optional().or(z.literal("")),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().min(4).max(20),
  consentGiven: z.boolean(),
  consentTextVersion: z.string().min(1).max(80),
  locationId: z.string().optional()
});

router.get("/consent", (req, res) => {
  res.json({ success: true, consent: { text: config.appointmentConsent.text, version: config.appointmentConsent.version } });
});

router.post("/consent/decision", publicFormLimiter, asyncHandler(async (req, res) => {
  const input = validate(z.object({
    fullName: z.string().min(2).max(160),
    phone: z.string().min(7).max(40),
    preferredLanguage: z.enum(["en", "ur"]).optional(),
    consentGiven: z.literal(false),
    consentTextVersion: z.string().min(1).max(80)
  }).strict(), req.body);
  const { consent } = await recordConsentDecision(input, "website", { req });
  res.status(201).json({ success: true, consent: { consentGiven: consent.consentGiven, consentedAt: consent.consentedAt, version: consent.consentTextVersion } });
}));

// Book appointment
router.post("/", publicFormLimiter, asyncHandler(async (req, res) => {
  const input = validate(appointmentSchema, req.body);
  const appointment = await createAppointment(input, { source: "website", idempotencyKey: req.get("idempotency-key"), req });
  res.status(201).json({ success: true, appointment: safePublicAppointment(appointment) });
}));

// Lookup / Search appointment
const lookupHandler = asyncHandler(async (req, res) => {
  const schema = z.object({
    appointmentId: z.string().min(1).max(50).optional(),
    reference: z.string().min(1).max(50).optional(),
    tokenNumber: z.string().min(1).max(50).optional(),
    phone: z.string().min(7).max(40).optional(),
    phoneNumber: z.string().min(7).max(40).optional()
  });
  const input = validate(schema, req.body);
  const ref = input.reference || input.appointmentId || input.tokenNumber;
  const ph = input.phone || input.phoneNumber;

  if (!ref || !ph) throw badRequest("Both Appointment ID/Token and Phone Number are required.");

  const appointment = await lookupAppointment({ reference: ref, phone: ph });
  await audit({ actorType: "patient", action: "appointment.self_service_viewed", entityType: "appointment", entityId: appointment.appointmentId, req });
  res.json({ success: true, appointment: safePublicAppointment(appointment) });
});

router.post("/lookup", patientVerificationLimiter, lookupHandler);
router.post("/search", patientVerificationLimiter, lookupHandler);

// Reschedule appointment (general endpoint)
router.post("/reschedule", patientVerificationLimiter, asyncHandler(async (req, res) => {
  const input = validate(z.object({
    appointmentId: z.string().min(3).max(50),
    phone: z.string().min(7).max(40),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().min(4).max(20),
    locationId: z.string().min(2).max(24).optional(),
    reason: z.string().max(1000).optional()
  }), req.body);
  const appointment = await rescheduleAppointment(input, { req });
  res.json({ success: true, appointment: safePublicAppointment(appointment) });
}));

// Cancel appointment (general endpoint)
router.post("/cancel", patientVerificationLimiter, asyncHandler(async (req, res) => {
  const input = validate(z.object({
    appointmentId: z.string().min(3).max(50),
    phone: z.string().min(7).max(40),
    reason: z.string().max(1000).optional()
  }), req.body);
  const appointment = await cancelAppointment(input, { req });
  res.json({ success: true, appointment: safePublicAppointment(appointment) });
}));

// Earlier slot request (general endpoint)
router.post("/earlier-slot", patientVerificationLimiter, asyncHandler(async (req, res) => {
  const input = validate(z.object({
    appointmentId: z.string().min(3).max(50),
    phone: z.string().min(7).max(40),
    notes: z.string().max(1000).optional()
  }), req.body);
  const appointment = await requestEarlierSlot(input.appointmentId, input.phone, input.notes);
  await audit({ actorType: "patient", action: "appointment.earlier_slot_requested", entityType: "appointment", entityId: appointment.appointmentId, req });
  res.json({ success: true, appointment: safePublicAppointment(appointment) });
}));

// Action Endpoint: POST /api/appointments/:id/confirm
router.post("/:id/confirm", patientVerificationLimiter, asyncHandler(async (req, res) => {
  const input = validate(z.object({ phone: z.string().min(7).max(40) }), req.body);
  const appt = await lookupAppointment({ reference: req.params.id, phone: input.phone });
  const confirmed = await updateAppointmentStatus(appt._id, "patient_confirmed", { req });
  res.json({ success: true, appointment: safePublicAppointment(confirmed), message: "Appointment confirmed." });
}));

// Action Endpoint: POST /api/appointments/:id/reschedule
router.post("/:id/reschedule", patientVerificationLimiter, asyncHandler(async (req, res) => {
  const input = validate(z.object({
    phone: z.string().min(7).max(40),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().min(4).max(20),
    locationId: z.string().min(2).max(24).optional(),
    reason: z.string().max(1000).optional()
  }), req.body);
  const appointment = await rescheduleAppointment({
    appointmentId: req.params.id,
    ...input
  }, { req });
  res.json({ success: true, appointment: safePublicAppointment(appointment) });
}));

// Action Endpoint: POST /api/appointments/:id/cancel
router.post("/:id/cancel", patientVerificationLimiter, asyncHandler(async (req, res) => {
  const input = validate(z.object({
    phone: z.string().min(7).max(40),
    reason: z.string().max(1000).optional()
  }), req.body);
  const appointment = await cancelAppointment({
    appointmentId: req.params.id,
    ...input
  }, { req });
  res.json({ success: true, appointment: safePublicAppointment(appointment) });
}));

// Action Endpoint: POST /api/appointments/:id/request-earlier
router.post("/:id/request-earlier", patientVerificationLimiter, asyncHandler(async (req, res) => {
  const input = validate(z.object({
    phone: z.string().min(7).max(40),
    notes: z.string().max(1000).optional()
  }), req.body);
  const appointment = await requestEarlierSlot(req.params.id, input.phone, input.notes || "");
  await audit({ actorType: "patient", action: "appointment.earlier_slot_requested", entityType: "appointment", entityId: appointment.appointmentId, req });
  res.json({ success: true, appointment: safePublicAppointment(appointment) });
}));

// Admin list appointments
router.get("/", requireAuth, requirePermission("appointments.read"), asyncHandler(async (req, res) => {
  let appointments = await listAppointments(req.query);
  appointments = await attachOwnerEmailStatuses(appointments);
  if (req.user.role === "clinic_staff") {
    appointments = appointments.map((appointment) => ({
      _id: appointment._id,
      ...safePublicAppointment(appointment)
    }));
  }
  await audit({ actorType: "staff", action: "appointments.list_viewed", entityType: "appointment", metadata: { resultCount: appointments.length }, req });
  res.json({ success: true, appointments });
}));

// Admin manual booking
router.post("/manual", requireAuth, requirePermission("appointments.create"), asyncHandler(async (req, res) => {
  const input = validate(appointmentSchema, req.body);
  const appointment = await createAppointment(input, { source: "staff", idempotencyKey: req.get("idempotency-key"), staffUser: req.user, req });
  res.status(201).json({ success: true, appointment });
}));

router.post("/:id/owner-email/retry", requireAuth, requirePermission("appointments.create"), requireObjectIdParam("id", "Appointment was not found."), asyncHandler(async (req, res) => {
  const ownerEmailNotification = await retryOwnerAppointmentEmail(req.params.id, { staffUser: req.user, req });
  res.json({ success: true, ownerEmailNotification });
}));

// Authenticated staff rescheduling uses the same atomic engine as public self-service.
router.patch("/:id/reschedule", requireAuth, requirePermission("appointments.create"), asyncHandler(async (req, res) => {
  const input = validate(z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().min(4).max(20),
    locationId: z.string().min(2).max(24).optional(),
    reason: z.string().max(1000).optional()
  }), req.body);
  const appointment = await rescheduleAppointment({ appointmentId: req.params.id, ...input }, { staffUser: req.user, req });
  res.json({ success: true, appointment });
}));

// Get appointment by ID
router.get("/:id", requireAuth, requirePermission("appointments.read"), asyncHandler(async (req, res) => {
  const mongoose = require("mongoose");
  const conds = [{ appointmentId: req.params.id }, { tokenNumber: req.params.id }];
  if (mongoose.Types.ObjectId.isValid(req.params.id)) {
    conds.push({ _id: req.params.id });
  }
  const appt = await Appointment.findOne({ $or: conds })
    .populate("patient", "patientId fullName phoneE164 preferredLanguage age city gender")
    .populate("location", "clinicName city code fullAddress contactNumber timezone")
    .lean();
  if (!appt) throw notFound("Appointment not found");
  await audit({ actorType: "staff", action: "appointment.viewed", entityType: "appointment", entityId: appt.appointmentId, req });
  res.json({ success: true, appointment: await attachOwnerEmailStatuses(appt) });
}));

// Admin status update
router.patch("/:id/status", requireAuth, requirePermission("appointments.status.clinical", "appointments.status.reception", "appointments.status.operational"), asyncHandler(async (req, res) => {
  const input = validate(z.object({
    status: z.enum([
      "pending",
      "scheduled",
      "confirmed",
      "patient_confirmed",
      "arrived",
      "in_consultation",
      "completed",
      "rescheduled",
      "cancelled",
      "no_show",
      "waiting_for_earlier_slot"
    ]),
    reason: z.string().max(1000).optional()
  }), req.body);
  if (!canSetAppointmentStatus(req.user, input.status)) throw forbidden();
  const appointment = await updateAppointmentStatus(req.params.id, input.status, { staffUser: req.user, reason: input.reason, req });
  res.json({ success: true, appointment });
}));

module.exports = router;
