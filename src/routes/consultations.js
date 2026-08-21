const express = require("express");
const { z } = require("zod");
const { OnlineConsultation, Patient } = require("../models");
const { publicFormLimiter } = require("../middleware/security");
const { requireAuth } = require("../middleware/auth");
const { requirePermission, hasPermission } = require("../middleware/permissions");
const { asyncHandler } = require("../utils/asyncHandler");
const { badRequest, notFound, forbidden } = require("../utils/errors");
const { normalizePhone } = require("../utils/security");
const { audit } = require("../services/auditService");
const mongoose = require("mongoose");

const router = express.Router();

const handleConsultationSubmission = asyncHandler(async (req, res) => {
  const schema = z.object({
    fullName: z.string().min(2).max(160),
    phone: z.string().min(7).max(40),
    age: z.coerce.number().int().min(0).max(130).optional(),
    city: z.string().max(100).optional().or(z.literal("")),
    patientType: z.enum(["new", "existing"]).optional(),
    appointmentId: z.string().optional().or(z.literal("")),
    symptoms: z.string().min(3).max(2000),
    medicalHistory: z.string().max(2000).optional().or(z.literal("")),
    preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
    preferredTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
    reportFileName: z.string().max(255).optional().or(z.literal(""))
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw badRequest("Validation failed for online consultation request.", parsed.error.flatten());
  const input = parsed.data;

  const phoneE164 = normalizePhone(input.phone);
  if (!phoneE164) throw badRequest("Validation failed for online consultation request.");
  let patient = await Patient.findOne({ phoneE164 });
  if (!patient) {
    patient = await Patient.create({
      patientId: `PAT-${Date.now().toString().slice(-6)}`,
      fullName: input.fullName,
      phoneE164,
      city: input.city || "Bahawalpur",
      age: input.age ? Number(input.age) : undefined
    });
  }

  const consultationId = `VC-${Date.now().toString().slice(-6)}`;
  const consultation = await OnlineConsultation.create({
    consultationId,
    patient: patient._id,
    patientPhone: phoneE164,
    fullName: input.fullName,
    age: input.age ? Number(input.age) : undefined,
    city: input.city || "Bahawalpur",
    patientType: input.patientType || "new",
    appointmentId: input.appointmentId || "",
    preferredDate: input.preferredDate || "",
    preferredTime: input.preferredTime || "",
    symptoms: input.symptoms,
    medicalHistory: input.medicalHistory || "",
    reportFileName: input.reportFileName || "",
    contactPhone: phoneE164,
    status: "Pending",
    doctorNotes: input.preferredTime ? `Preferred Time: ${input.preferredTime}` : ""
  });

  await audit({ actorType: "patient", action: "consultation.submitted", entityType: "consultation", entityId: String(consultation._id), req });

  res.status(201).json({
    success: true,
    consultation: {
      consultationId: consultation.consultationId,
      preferredDate: consultation.preferredDate,
      preferredTime: consultation.preferredTime,
      status: consultation.status
    },
    message: "Submit your consultation request for Dr. Shoaib. Clinic staff will review it and contact you for confirmation."
  });
});

// POST /api/online-consultations and /api/online-consultations/request
router.post("/", publicFormLimiter, handleConsultationSubmission);
router.post("/request", publicFormLimiter, handleConsultationSubmission);

router.use(requireAuth);

// GET /api/online-consultations
router.get("/", requirePermission("consultations.read"), asyncHandler(async (req, res) => {
  const filter = {};
  const allowedStatuses = new Set(["Pending", "Under Review", "Approved", "Scheduled", "Completed", "Rejected", "Cancelled", "pending", "under_review", "scheduled", "completed", "rejected"]);
  if (allowedStatuses.has(req.query.status)) filter.status = req.query.status;
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 100));
  const page = Math.max(1, Number(req.query.page) || 1);
  let query = OnlineConsultation.find(filter)
    .populate("patient", "patientId fullName phoneE164 preferredLanguage city")
    .populate("assignedDoctor", "name role")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
  if (!hasPermission(req.user, "consultations.review") && req.user.role !== "super_admin") {
    query = query.select("consultationId patient patientPhone fullName city patientType appointmentId preferredDate preferredTime contactPhone status assignedDoctor createdAt updatedAt");
  }
  const consultations = await query.lean();
  await audit({ actorType: "staff", action: "consultations.list_viewed", entityType: "consultation", metadata: { resultCount: consultations.length }, req });
  res.json({ success: true, consultations });
}));

// GET /api/online-consultations/:id
router.get("/:id", requirePermission("consultations.read"), asyncHandler(async (req, res) => {
  const conditions = [{ consultationId: req.params.id }];
  if (mongoose.Types.ObjectId.isValid(req.params.id)) conditions.push({ _id: req.params.id });
  let query = OnlineConsultation.findOne({ $or: conditions })
    .populate("patient", "patientId fullName phoneE164 preferredLanguage city")
    .populate("assignedDoctor", "name role");
  if (!hasPermission(req.user, "consultations.review") && req.user.role !== "super_admin") {
    query = query.select("consultationId patient patientPhone fullName city patientType appointmentId preferredDate preferredTime contactPhone status assignedDoctor createdAt updatedAt");
  }
  const consultation = await query.lean();

  if (!consultation) throw notFound("Consultation request not found");
  await audit({ actorType: "staff", action: "consultation.viewed", entityType: "consultation", entityId: String(consultation._id), req });
  res.json({ success: true, consultation });
}));

// PUT or PATCH /api/online-consultations/:id/status
const updateConsultationStatus = asyncHandler(async (req, res) => {
  const parsed = z.object({
    status: z.enum(["Pending", "Under Review", "Approved", "Scheduled", "Completed", "Rejected", "Cancelled", "pending", "under_review", "scheduled", "completed", "rejected"]).optional(),
    doctorNotes: z.string().max(1000).optional().or(z.literal(""))
  }).strict().safeParse(req.body);
  if (!parsed.success) throw badRequest("Invalid consultation update.");
  if (!hasPermission(req.user, "consultations.review") && req.user.role !== "super_admin") {
    const allowed = new Set(["Approved", "Scheduled", "Cancelled", "scheduled"]);
    if (parsed.data.doctorNotes !== undefined || (parsed.data.status && !allowed.has(parsed.data.status))) throw forbidden();
  }
  const conditions = [{ consultationId: req.params.id }];
  if (mongoose.Types.ObjectId.isValid(req.params.id)) conditions.push({ _id: req.params.id });
  const consultation = await OnlineConsultation.findOne({ $or: conditions });
  if (!consultation) throw notFound("Consultation request not found");

  if (parsed.data.status) consultation.status = parsed.data.status;
  if (parsed.data.doctorNotes !== undefined) consultation.doctorNotes = parsed.data.doctorNotes;
  if (hasPermission(req.user, "consultations.review") || req.user.role === "super_admin") consultation.assignedDoctor = req.user._id;

  await consultation.save();
  await audit({ actorType: "staff", action: "consultation.updated", entityType: "consultation", entityId: String(consultation._id), metadata: { status: consultation.status }, req });
  res.json({ success: true, consultation, message: "Consultation status updated." });
});

router.put("/:id/status", requirePermission("consultations.review", "consultations.schedule"), updateConsultationStatus);
router.patch("/:id/status", requirePermission("consultations.review", "consultations.schedule"), updateConsultationStatus);
router.patch("/:id", requirePermission("consultations.review", "consultations.schedule"), updateConsultationStatus);

module.exports = router;
