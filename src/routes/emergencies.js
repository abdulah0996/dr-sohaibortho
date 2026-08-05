const express = require("express");
const { z } = require("zod");
const { EmergencyAlert, Patient } = require("../models");
const { requireAuth } = require("../middleware/auth");
const { publicFormLimiter } = require("../middleware/security");
const { asyncHandler } = require("../utils/asyncHandler");
const { badRequest, notFound } = require("../utils/errors");

const router = express.Router();

// Create Emergency Alert (Patient / Chatbot facing)
router.post("/", publicFormLimiter, asyncHandler(async (req, res) => {
  const schema = z.object({
    phone: z.string().min(7).max(40),
    alertMessage: z.string().min(2).max(2000),
    priority: z.enum(["high", "critical"]).optional()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw badRequest("Invalid emergency alert input.", parsed.error.flatten());
  const input = parsed.data;

  const phoneE164 = input.phone.startsWith("+") ? input.phone : `+${input.phone}`;
  let patient = await Patient.findOne({ phoneE164 });

  const alert = await EmergencyAlert.create({
    patient: patient ? patient._id : null,
    phoneE164,
    alertMessage: input.alertMessage,
    priority: input.priority || "critical",
    status: "open"
  });

  res.status(201).json({ success: true, alert });
}));

// List Emergency Alerts (Staff facing)
router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const alerts = await EmergencyAlert.find(filter)
    .populate("patient resolvedBy")
    .sort({ createdAt: -1 })
    .lean();
  res.json({ success: true, alerts });
}));

// Resolve Emergency Alert
router.patch("/:id/resolve", requireAuth, asyncHandler(async (req, res) => {
  const { resolutionNotes } = req.body;
  const alert = await EmergencyAlert.findById(req.params.id);
  if (!alert) throw notFound("Emergency alert not found.");

  alert.status = "resolved";
  alert.resolvedBy = req.user._id;
  alert.resolutionNotes = resolutionNotes || "Resolved by clinic staff.";
  alert.resolvedAt = new Date();

  await alert.save();
  res.json({ success: true, alert });
}));

module.exports = router;
