const express = require("express");
const { z } = require("zod");
const { EmergencyAlert, Patient } = require("../models");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");
const { publicFormLimiter } = require("../middleware/security");
const { asyncHandler } = require("../utils/asyncHandler");
const { badRequest, notFound } = require("../utils/errors");
const { normalizePhone } = require("../utils/security");
const { audit } = require("../services/auditService");
const { requireObjectIdParam } = require("../middleware/validation");

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

  const phoneE164 = normalizePhone(input.phone);
  if (!phoneE164) throw badRequest("Invalid emergency alert input.");
  let patient = await Patient.findOne({ phoneE164 });

  const alert = await EmergencyAlert.create({
    patient: patient ? patient._id : null,
    phoneE164,
    alertMessage: input.alertMessage,
    priority: input.priority || "critical",
    status: "open"
  });

  await audit({ actorType: "patient", action: "emergency.submitted", entityType: "emergency", entityId: String(alert._id), req });

  res.status(201).json({
    success: true,
    alert: { id: alert._id, priority: alert.priority, status: alert.status }
  });
}));

// List Emergency Alerts (Staff facing)
router.get("/", requireAuth, requirePermission("emergencies.read"), asyncHandler(async (req, res) => {
  const filter = {};
  if (["open", "acknowledged", "resolved"].includes(req.query.status)) filter.status = req.query.status;
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 100));
  const page = Math.max(1, Number(req.query.page) || 1);
  const alerts = await EmergencyAlert.find(filter)
    .populate("patient resolvedBy")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
  await audit({ actorType: "staff", action: "emergencies.list_viewed", entityType: "emergency", metadata: { resultCount: alerts.length }, req });
  res.json({ success: true, alerts });
}));

// Resolve Emergency Alert
router.patch("/:id/resolve", requireAuth, requirePermission("emergencies.resolve"), requireObjectIdParam("id", "Emergency alert not found."), asyncHandler(async (req, res) => {
  const { resolutionNotes } = req.body;
  const alert = await EmergencyAlert.findById(req.params.id);
  if (!alert) throw notFound("Emergency alert not found.");

  alert.status = "resolved";
  alert.resolvedBy = req.user._id;
  alert.resolutionNotes = resolutionNotes || "Resolved by clinic staff.";
  alert.resolvedAt = new Date();

  await alert.save();
  await audit({ actorType: "staff", action: "emergency.resolved", entityType: "emergency", entityId: String(alert._id), req });
  res.json({ success: true, alert });
}));

module.exports = router;
