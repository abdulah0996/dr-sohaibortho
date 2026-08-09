const express = require("express");
const { DoctorProfile } = require("../models");
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");
const { audit } = require("../services/auditService");
const { z } = require("zod");
const { badRequest, notFound } = require("../utils/errors");
const { config } = require("../config/env");

const router = express.Router();

async function getOrSeedProfile() {
  let profile = await DoctorProfile.findOne({ doctorKey: "dr-sohaib" });
  if (!profile) {
    if (config.isProduction) return null;
    profile = await DoctorProfile.create({
      doctorKey: "dr-sohaib",
      doctorName: "Dr. Sohaib",
      profileImage: "/assets/dr-sohaib.png",
      qualification: "Specialist Physician & Surgeon",
      specialty: "General & Specialty Clinical Consultation, Surgical Evaluation & Patient Care",
      experience: "12+ Years Clinical Experience",
      services: "Professional Consultations, Surgical Evaluations, Comprehensive Diagnosis & Follow-up Care",
      consultationLocation: "Iqbal Hospital, Noor Mahal Road, Bahawalpur",
      consultationDays: "Monday to Thursday",
      consultationTimings: "4:30 PM to 8:30 PM",
      bio: "Dr. Sohaib is a dedicated physician and surgeon based at Iqbal Hospital, Bahawalpur. He provides professional consultations, surgical evaluations, and follow-up care for patients."
    });
  }
  return profile;
}

// GET /api/doctors/dr-sohaib
router.get("/dr-sohaib", asyncHandler(async (req, res) => {
  const profile = await getOrSeedProfile();
  if (!profile) throw notFound("Doctor profile has not been configured.");
  res.json({ success: true, doctor: profile, profile });
}));

// PUT /api/doctors/dr-sohaib
router.put("/dr-sohaib", requireAuth, requirePermission("doctor_profile.manage"), asyncHandler(async (req, res) => {
  let profile = await DoctorProfile.findOne({ doctorKey: "dr-sohaib" });
  const parsed = z.object({
    doctorName: z.string().min(2).max(120).optional(),
    profileImage: z.string().max(500).optional(),
    qualification: z.string().max(400).optional(),
    specialty: z.string().max(400).optional(),
    experience: z.string().max(200).optional(),
    services: z.string().max(1000).optional(),
    consultationLocation: z.string().max(600).optional(),
    consultationDays: z.string().max(200).optional(),
    consultationTimings: z.string().max(200).optional(),
    bio: z.string().max(2000).optional()
  }).strict().safeParse(req.body);
  if (!parsed.success) throw badRequest("Invalid doctor profile update.");

  if (!profile) {
    profile = new DoctorProfile({
      doctorKey: "dr-sohaib",
      doctorName: "",
      profileImage: "",
      qualification: "",
      specialty: "",
      experience: "",
      services: "",
      consultationLocation: "",
      consultationDays: "",
      consultationTimings: "",
      bio: ""
    });
  }

  Object.entries(parsed.data).forEach(([field, value]) => { profile[field] = value; });

  await profile.save();
  await audit({ actorType: "staff", action: "doctor_profile.updated", entityType: "doctor_profile", entityId: String(profile._id), req });
  res.json({ success: true, doctor: profile, profile, message: "Doctor profile updated successfully." });
}));

module.exports = router;
