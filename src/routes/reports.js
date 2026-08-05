const express = require("express");
const { z } = require("zod");
const { MedicalReport, Patient, Appointment } = require("../models");
const { publicFormLimiter } = require("../middleware/security");
const { asyncHandler } = require("../utils/asyncHandler");
const { badRequest, notFound } = require("../utils/errors");

const router = express.Router();

// Upload Medical Report
router.post("/upload", publicFormLimiter, asyncHandler(async (req, res) => {
  const schema = z.object({
    phone: z.string().min(7).max(40),
    reportTitle: z.string().min(2).max(200),
    appointmentId: z.string().optional().or(z.literal("")),
    tokenNumber: z.string().optional().or(z.literal("")),
    documentType: z.enum(["mri", "xray", "prescription", "lab", "discharge", "other", "blood_test"]).optional(),
    fileUrl: z.string().optional().or(z.literal("")),
    fileName: z.string().min(1),
    fileType: z.string().optional().or(z.literal("")),
    fileSize: z.number().optional(),
    notes: z.string().max(1000).optional().or(z.literal(""))
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw badRequest("Invalid report upload data.", parsed.error.flatten());
  const input = parsed.data;

  const phoneE164 = input.phone.startsWith("+") ? input.phone : `+${input.phone}`;
  let patient = await Patient.findOne({ phoneE164 });
  if (!patient) {
    patient = await Patient.create({
      patientId: `PAT-${Date.now().toString().slice(-6)}`,
      fullName: "Patient (" + input.phone + ")",
      phoneE164
    });
  }

  let appointmentRef = null;
  let linkedToken = input.tokenNumber || "";

  // Auto link to appointment if appointmentId or token is passed or if patient has an active appointment
  let appt = null;
  if (input.appointmentId) {
    const mongoose = require("mongoose");
    const orConds = [{ appointmentId: input.appointmentId }, { tokenNumber: input.appointmentId }];
    if (mongoose.Types.ObjectId.isValid(input.appointmentId)) {
      orConds.push({ _id: input.appointmentId });
    }
    appt = await Appointment.findOne({ $or: orConds });
  }
  if (!appt) {
    appt = await Appointment.findOne({ phoneE164 }).sort({ createdAt: -1 });
  }

  if (appt) {
    appointmentRef = appt._id;
    input.appointmentId = appt.appointmentId;
    linkedToken = appt.tokenNumber;

    if (patient && (patient.fullName.startsWith("Patient (") || !patient.fullName) && appt.patientSnapshot?.fullName) {
      patient.fullName = appt.patientSnapshot.fullName;
      await patient.save().catch(() => {});
    }
  }

  const reportId = `RPT-${Date.now().toString().slice(-6)}`;
  const report = await MedicalReport.create({
    reportId,
    patient: patient._id,
    patientPhone: phoneE164,
    appointmentId: input.appointmentId || "",
    tokenNumber: linkedToken,
    appointment: appointmentRef,
    reportTitle: input.reportTitle,
    documentType: input.documentType || "other",
    fileUrl: input.fileUrl || `/uploads/${Date.now()}_${input.fileName}`,
    fileName: input.fileName,
    fileType: input.fileType || "application/pdf",
    fileSize: input.fileSize || 1024000,
    notes: input.notes || "",
    status: "New"
  });

  res.status(201).json({
    success: true,
    report,
    message: "Your medical document has been uploaded successfully and linked with your record."
  });
}));

// GET /api/reports - List Reports
router.get("/", asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.phone) filter.patientPhone = req.query.phone.startsWith("+") ? req.query.phone : `+${req.query.phone}`;
  const reports = await MedicalReport.find(filter)
    .populate("patient appointment reviewedBy")
    .sort({ createdAt: -1 })
    .lean();
  res.json({ success: true, reports });
}));

// GET /api/reports/appointment/:appointmentId
router.get("/appointment/:appointmentId", asyncHandler(async (req, res) => {
  const reports = await MedicalReport.find({ appointmentId: req.params.appointmentId })
    .populate("patient appointment reviewedBy")
    .sort({ createdAt: -1 })
    .lean();
  res.json({ success: true, reports });
}));

// GET /api/reports/:id
router.get("/:id", asyncHandler(async (req, res) => {
  const report = await MedicalReport.findOne({
    $or: [{ _id: req.params.id }, { reportId: req.params.id }]
  }).populate("patient appointment reviewedBy").lean();

  if (!report) throw notFound("Medical report not found");
  res.json({ success: true, report });
}));

// PUT or PATCH /api/reports/:id/status
const updateStatusHandler = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const report = await MedicalReport.findOne({
    $or: [{ _id: req.params.id }, { reportId: req.params.id }]
  });
  if (!report) throw notFound("Report not found");

  if (status) report.status = status;
  if (req.user) {
    report.reviewedBy = req.user._id;
    report.reviewedAt = new Date();
  }
  await report.save();

  res.json({ success: true, report, message: "Report status updated successfully." });
});

router.put("/:id/status", updateStatusHandler);
router.patch("/:id/status", updateStatusHandler);

module.exports = router;
