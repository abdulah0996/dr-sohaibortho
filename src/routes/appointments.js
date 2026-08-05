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
  safePublicAppointment
} = require("../services/appointmentService");
const { Appointment } = require("../models");
const { requireAuth } = require("../middleware/auth");
const { publicFormLimiter } = require("../middleware/security");
const { asyncHandler } = require("../utils/asyncHandler");
const { badRequest, notFound } = require("../utils/errors");

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
  consentGiven: z.boolean().optional(),
  locationId: z.string().optional()
});

// Book appointment
router.post("/", publicFormLimiter, asyncHandler(async (req, res) => {
  const input = validate(appointmentSchema, req.body);
  const appointment = await createAppointment({ ...input, consentGiven: true }, { source: "website", req });
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
  res.json({ success: true, appointment: safePublicAppointment(appointment) });
});

router.post("/lookup", publicFormLimiter, lookupHandler);
router.post("/search", publicFormLimiter, lookupHandler);

// Reschedule appointment (general endpoint)
router.post("/reschedule", publicFormLimiter, asyncHandler(async (req, res) => {
  const input = validate(z.object({
    appointmentId: z.string().min(3).max(50),
    phone: z.string().min(7).max(40),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().min(4).max(20),
    reason: z.string().max(1000).optional()
  }), req.body);
  const appointment = await rescheduleAppointment(input, { req });
  res.json({ success: true, appointment: safePublicAppointment(appointment) });
}));

// Cancel appointment (general endpoint)
router.post("/cancel", publicFormLimiter, asyncHandler(async (req, res) => {
  const input = validate(z.object({
    appointmentId: z.string().min(3).max(50),
    phone: z.string().min(7).max(40),
    reason: z.string().max(1000).optional()
  }), req.body);
  const appointment = await cancelAppointment(input, { req });
  res.json({ success: true, appointment: safePublicAppointment(appointment) });
}));

// Earlier slot request (general endpoint)
router.post("/earlier-slot", publicFormLimiter, asyncHandler(async (req, res) => {
  const input = validate(z.object({
    appointmentId: z.string().min(3).max(50),
    phone: z.string().min(7).max(40),
    notes: z.string().max(1000).optional()
  }), req.body);
  const appointment = await requestEarlierSlot(input.appointmentId, input.phone, input.notes);
  res.json({ success: true, appointment: safePublicAppointment(appointment) });
}));

// Action Endpoint: POST /api/appointments/:id/confirm
router.post("/:id/confirm", asyncHandler(async (req, res) => {
  const mongoose = require("mongoose");
  const conds = [{ appointmentId: req.params.id }, { tokenNumber: req.params.id }];
  if (mongoose.Types.ObjectId.isValid(req.params.id)) {
    conds.push({ _id: req.params.id });
  }
  const appt = await Appointment.findOne({ $or: conds });
  if (!appt) throw notFound("Appointment not found");
  appt.status = "confirmed";
  await appt.save();
  res.json({ success: true, appointment: appt, message: "Appointment confirmed." });
}));

// Action Endpoint: POST /api/appointments/:id/reschedule
router.post("/:id/reschedule", asyncHandler(async (req, res) => {
  const { date, time, phone, reason } = req.body;
  const appointment = await rescheduleAppointment({
    appointmentId: req.params.id,
    phone: phone || "",
    date,
    time,
    reason
  }, { req });
  res.json({ success: true, appointment: safePublicAppointment(appointment) });
}));

// Action Endpoint: POST /api/appointments/:id/cancel
router.post("/:id/cancel", asyncHandler(async (req, res) => {
  const { phone, reason } = req.body;
  const appointment = await cancelAppointment({
    appointmentId: req.params.id,
    phone: phone || "",
    reason
  }, { req });
  res.json({ success: true, appointment: safePublicAppointment(appointment) });
}));

// Action Endpoint: POST /api/appointments/:id/request-earlier
router.post("/:id/request-earlier", asyncHandler(async (req, res) => {
  const { phone, notes } = req.body;
  const appointment = await requestEarlierSlot(req.params.id, phone || "", notes || "");
  res.json({ success: true, appointment: safePublicAppointment(appointment) });
}));

// Admin list appointments
router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const appointments = await listAppointments(req.query);
  res.json({ success: true, appointments });
}));

// Admin manual booking
router.post("/manual", requireAuth, asyncHandler(async (req, res) => {
  const input = validate(appointmentSchema, req.body);
  const appointment = await createAppointment({ ...input, consentGiven: true }, { source: "staff", staffUser: req.user, req });
  res.status(201).json({ success: true, appointment });
}));

// Get appointment by ID
router.get("/:id", asyncHandler(async (req, res) => {
  const mongoose = require("mongoose");
  const conds = [{ appointmentId: req.params.id }, { tokenNumber: req.params.id }];
  if (mongoose.Types.ObjectId.isValid(req.params.id)) {
    conds.push({ _id: req.params.id });
  }
  const appt = await Appointment.findOne({ $or: conds }).populate("patient location").lean();
  if (!appt) throw notFound("Appointment not found");
  res.json({ success: true, appointment: appt });
}));

// Admin status update
router.patch("/:id/status", requireAuth, asyncHandler(async (req, res) => {
  const input = validate(z.object({
    status: z.enum([
      "pending",
      "confirmed",
      "patient_confirmed",
      "arrived",
      "in_consultation",
      "completed",
      "rescheduled",
      "cancelled",
      "no_show",
      "waiting_for_earlier_slot"
    ])
  }), req.body);
  const appointment = await updateAppointmentStatus(req.params.id, input.status, { staffUser: req.user, req });
  res.json({ success: true, appointment });
}));

module.exports = router;
