const express = require("express");
const { z } = require("zod");
const { Patient, Appointment, MedicalReport, OnlineConsultation, StaffNote } = require("../models");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler } = require("../utils/asyncHandler");
const { badRequest, notFound } = require("../utils/errors");

const router = express.Router();

// List Patients (Search, Pagination, Sort)
router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.search) {
    const s = req.query.search;
    filter.$or = [
      { fullName: new RegExp(s, "i") },
      { phoneE164: new RegExp(s, "i") }
    ];
  }

  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const patients = await Patient.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  res.json({ success: true, patients });
}));

// Get Patient Details by ID (with appointments, reports, notes)
router.get("/:id", requireAuth, asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.params.id).lean();
  if (!patient) throw notFound("Patient not found.");

  const [appointments, reports, consultations, notes] = await Promise.all([
    Appointment.find({ patient: patient._id }).sort({ date: -1 }).lean(),
    MedicalReport.find({ patient: patient._id }).sort({ createdAt: -1 }).lean(),
    OnlineConsultation.find({ patient: patient._id }).sort({ createdAt: -1 }).lean(),
    StaffNote.find({ targetType: "patient", targetId: patient._id.toString() }).populate("createdBy", "name role").sort({ createdAt: -1 }).lean()
  ]);

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
router.post("/:id/notes", requireAuth, asyncHandler(async (req, res) => {
  const { note } = req.body;
  if (!note || !note.trim()) throw badRequest("Note content is required.");

  const patient = await Patient.findById(req.params.id);
  if (!patient) throw notFound("Patient not found.");

  const staffNote = await StaffNote.create({
    targetType: "patient",
    targetId: patient._id.toString(),
    createdBy: req.user._id,
    note: note.trim()
  });

  res.status(201).json({ success: true, note: staffNote });
}));

module.exports = router;
