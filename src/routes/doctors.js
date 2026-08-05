const express = require("express");
const { DoctorProfile } = require("../models");
const { asyncHandler } = require("../utils/asyncHandler");

const router = express.Router();

async function getOrSeedProfile() {
  let profile = await DoctorProfile.findOne({ doctorKey: "dr-sohaib" });
  if (!profile) {
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
  res.json({ success: true, doctor: profile, profile });
}));

// PUT /api/doctors/dr-sohaib
router.put("/dr-sohaib", asyncHandler(async (req, res) => {
  let profile = await getOrSeedProfile();
  const allowed = [
    "doctorName", "profileImage", "qualification", "specialty",
    "experience", "services", "consultationLocation", "consultationDays",
    "consultationTimings", "bio"
  ];

  allowed.forEach((field) => {
    if (req.body[field] !== undefined) {
      profile[field] = req.body[field];
    }
  });

  await profile.save();
  res.json({ success: true, doctor: profile, profile, message: "Doctor profile updated successfully." });
}));

module.exports = router;
