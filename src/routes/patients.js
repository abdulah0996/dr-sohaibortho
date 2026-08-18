const express = require("express");
const { z } = require("zod");
const { Patient, Appointment, MedicalReport, OnlineConsultation, StaffNote } = require("../models");
const { requireAuth } = require("../middleware/auth");
const { requirePermission, hasPermission } = require("../middleware/permissions");
const { asyncHandler } = require("../utils/asyncHandler");
const { badRequest, notFound } = require("../utils/errors");
const { audit } = require("../services/auditService");
const mongoose = require("mongoose");
const { requireObjectIdParam } = require("../middleware/validation");
const { maskPhone } = require("../utils/security");

const router = express.Router();

router.use(requireAuth);

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// List Patients (Search, Pagination, Sort)
router.get("/", requirePermission("patients.read.clinical", "patients.read.basic"), asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.search) {
    const s = escapeRegex(String(req.query.search).slice(0, 120));
    filter.$or = [
      { fullName: new RegExp(s, "i") },
      { phoneE164: new RegExp(s, "i") }
    ];
  }

  const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 200));
  const page = Math.max(Number(req.query.page) || 1, 1);
  let query = Patient.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit);
  if (!hasPermission(req.user, "patients.read.clinical") && req.user.role !== "super_admin") {
    query = query.select("patientId fullName phoneE164 preferredLanguage city createdAt updatedAt");
  }
  let patients = await query.lean();
  if (req.user.role === "clinic_staff") {
    patients = patients.map(({ phoneE164, ...patient }) => ({ ...patient, phoneMasked: maskPhone(phoneE164) }));
  }
  await audit({ actorType: "staff", action: "patients.list_viewed", entityType: "patient", metadata: { resultCount: patients.length }, req });
  res.json({ success: true, patients });
}));

// Get Patient Details by ID (with appointments, reports, notes)
router.get("/:id", requirePermission("patients.read.clinical", "patients.read.basic"), asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) throw notFound("Patient not found.");
  const clinical = req.user.role === "super_admin" || hasPermission(req.user, "patients.read.clinical");
  let patientQuery = Patient.findById(req.params.id);
  if (!clinical) patientQuery = patientQuery.select("patientId fullName phoneE164 preferredLanguage city createdAt updatedAt");
  let patient = await patientQuery.lean();
  if (!patient) throw notFound("Patient not found.");
  if (req.user.role === "clinic_staff") {
    const { phoneE164, ...safePatient } = patient;
    patient = { ...safePatient, phoneMasked: maskPhone(phoneE164) };
  }

  const appointments = await Appointment.find({ patient: patient._id })
    .select(clinical ? "-__v" : "appointmentId tokenNumber date time status appointmentType locationSnapshot createdAt")
    .sort({ date: -1 }).lean();
  const [reports, consultations, notes] = clinical ? await Promise.all([
    MedicalReport.find({ patient: patient._id }).sort({ createdAt: -1 }).lean(),
    OnlineConsultation.find({ patient: patient._id }).sort({ createdAt: -1 }).lean(),
    StaffNote.find({ targetType: "patient", targetId: patient._id.toString() }).populate("createdBy", "name role").sort({ createdAt: -1 }).lean()
  ]) : [[], [], []];

  await audit({ actorType: "staff", action: "patient.record_viewed", entityType: "patient", entityId: String(patient._id), req });

  res.json({
    success: true,
    patient,
    appointments,
    reports,
    consultations,
    notes
  });
}));

// Add Staff Note for Patient
router.post("/:id/notes", requirePermission("patients.notes.write"), requireObjectIdParam("id", "Patient not found."), asyncHandler(async (req, res) => {
  const parsed = z.object({ note: z.string().trim().min(1).max(2000) }).strict().safeParse(req.body);
  if (!parsed.success) throw badRequest("Note content is required.");
  const { note } = parsed.data;

  const patient = await Patient.findById(req.params.id);
  if (!patient) throw notFound("Patient not found.");

  const staffNote = await StaffNote.create({
    targetType: "patient",
    targetId: patient._id.toString(),
    createdBy: req.user._id,
    note: note.trim()
  });

  await audit({ actorType: "staff", action: "patient.note_created", entityType: "patient", entityId: String(patient._id), req });

  res.status(201).json({ success: true, note: staffNote });
}));

module.exports = router;
