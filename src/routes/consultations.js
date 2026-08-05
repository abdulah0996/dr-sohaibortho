const express = require("express");
const { z } = require("zod");
const { OnlineConsultation, Patient } = require("../models");
const { publicFormLimiter } = require("../middleware/security");
const { asyncHandler } = require("../utils/asyncHandler");
const { badRequest, notFound } = require("../utils/errors");

const router = express.Router();

const handleConsultationSubmission = asyncHandler(async (req, res) => {
  const schema = z.object({
    fullName: z.string().min(2).max(160),
    phone: z.string().min(7).max(40),
    age: z.number().or(z.string()).optional(),
    city: z.string().optional().or(z.literal("")),
    patientType: z.enum(["new", "existing"]).optional(),
    appointmentId: z.string().optional().or(z.literal("")),
    symptoms: z.string().min(3).max(2000),
    medicalHistory: z.string().max(2000).optional().or(z.literal("")),
    preferredDate: z.string().optional().or(z.literal("")),
    preferredTime: z.string().optional().or(z.literal("")),
    reportFileName: z.string().optional().or(z.literal(""))
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw badRequest("Validation failed for online consultation request.", parsed.error.flatten());
  const input = parsed.data;

  const phoneE164 = input.phone.startsWith("+") ? input.phone : `+${input.phone}`;
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

  res.status(201).json({
    success: true,
    consultation,
    message: "Submit your consultation request for Dr. Sohaib. Clinic staff will review it and contact you for confirmation."
  });
});

// POST /api/online-consultations and /api/online-consultations/request
router.post("/", publicFormLimiter, handleConsultationSubmission);
router.post("/request", publicFormLimiter, handleConsultationSubmission);

// GET /api/online-consultations
router.get("/", asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const consultations = await OnlineConsultation.find(filter)
    .populate("patient assignedDoctor")
    .sort({ createdAt: -1 })
    .lean();
  res.json({ success: true, consultations });
}));

// GET /api/online-consultations/:id
router.get("/:id", asyncHandler(async (req, res) => {
  const consultation = await OnlineConsultation.findOne({
    $or: [{ _id: req.params.id }, { consultationId: req.params.id }]
  }).populate("patient assignedDoctor").lean();

  if (!consultation) throw notFound("Consultation request not found");
  res.json({ success: true, consultation });
}));

// PUT or PATCH /api/online-consultations/:id/status
const updateConsultationStatus = asyncHandler(async (req, res) => {
  const { status, doctorNotes } = req.body;
  const consultation = await OnlineConsultation.findOne({
    $or: [{ _id: req.params.id }, { consultationId: req.params.id }]
  });
  if (!consultation) throw notFound("Consultation request not found");

  if (status) consultation.status = status;
  if (doctorNotes) consultation.doctorNotes = doctorNotes;
  if (req.user) consultation.assignedDoctor = req.user._id;

  await consultation.save();
  res.json({ success: true, consultation, message: "Consultation status updated." });
});

router.put("/:id/status", updateConsultationStatus);
router.patch("/:id/status", updateConsultationStatus);
router.patch("/:id", updateConsultationStatus);

module.exports = router;
