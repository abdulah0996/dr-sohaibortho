const express = require("express");
const { ReminderJob, Patient } = require("../models");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");
const { asyncHandler } = require("../utils/asyncHandler");
const { badRequest, notFound } = require("../utils/errors");
const { normalizePhone } = require("../utils/security");
const { audit } = require("../services/auditService");
const { z } = require("zod");
const { requireObjectIdParam } = require("../middleware/validation");
const { createHash } = require("crypto");
const { REMINDER_DELIVERY_STATUSES } = require("../domain/whatsappRules");
const { retryFailedReminder, refreshAppointmentReminderStatus } = require("../services/reminderService");

const router = express.Router();
router.use(requireAuth);

// List Reminders
router.get("/", requirePermission("reminders.read"), asyncHandler(async (req, res) => {
  const filter = {};
  if (["appointment_reminder", "follow_up_reminder"].includes(req.query.type)) filter.type = req.query.type;
  if (REMINDER_DELIVERY_STATUSES.includes(req.query.status)) filter.status = req.query.status;
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 100));
  const page = Math.max(1, Number(req.query.page) || 1);

  const reminders = await ReminderJob.find(filter)
    .populate("patient appointment")
    .sort({ dueAt: 1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  await audit({ actorType: "staff", action: "reminders.list_viewed", entityType: "reminder", metadata: { resultCount: reminders.length }, req });

  res.json({ success: true, reminders });
}));

// Schedule Follow-up Reminder
router.post("/follow-up", requirePermission("reminders.manage"), asyncHandler(async (req, res) => {
  const parsed = z.object({
    patientId: z.string().optional(),
    phone: z.string().min(7).max(40),
    dueDays: z.coerce.number().int().min(1).max(365).optional(),
    message: z.string().min(1).max(2000)
  }).strict().safeParse(req.body);
  if (!parsed.success) throw badRequest("Invalid reminder request.");
  const { patientId, phone, dueDays, message } = parsed.data;

  let patient = null;
  if (patientId) {
    const mongoose = require("mongoose");
    if (!mongoose.Types.ObjectId.isValid(patientId)) throw badRequest("Invalid patient reference.");
    patient = await Patient.findById(patientId);
  }

  const days = Number(dueDays) || 7;
  const dueAt = new Date(Date.now() + days * 86400000);
  const phoneE164 = normalizePhone(phone);
  if (!phoneE164) throw badRequest("A valid patient phone number is required.");
  const dedupeKey = `follow-up:${createHash("sha256").update(`${patient?._id || ""}|${phoneE164}|${dueAt.toISOString()}|${message}`).digest("hex")}`;

  const reminder = await ReminderJob.findOneAndUpdate(
    { dedupeKey },
    { $setOnInsert: { patient: patient ? patient._id : null, phoneE164, type: "follow_up_reminder", dueAt, message, status: "pending" } },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );

  await audit({ actorType: "staff", action: "reminder.created", entityType: "reminder", entityId: String(reminder._id), req });

  res.status(201).json({ success: true, reminder });
}));

// Cancel a reminder. Delivery states are updated only by the scheduler and Meta callbacks.
router.patch("/:id/status", requirePermission("reminders.manage"), requireObjectIdParam("id", "Reminder job not found."), asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (status !== "cancelled") throw badRequest("Only reminder cancellation is allowed here. Use the retry endpoint for failed reminders.");

  const reminder = await ReminderJob.findById(req.params.id);
  if (!reminder) throw notFound("Reminder job not found.");
  if (!["pending", "processing"].includes(reminder.status)) throw badRequest("Only reminders that have not been handed to Meta can be cancelled.");

  const previousStatus = reminder.status;
  reminder.status = status;
  await reminder.save();
  await refreshAppointmentReminderStatus(reminder.appointment);

  await audit({ actorType: "staff", action: "reminder.status_updated", entityType: "reminder", entityId: String(reminder._id), metadata: { status }, before: { status: previousStatus }, after: { status }, req });

  res.json({ success: true, reminder });
}));

router.post("/:id/retry", requirePermission("reminders.manage"), requireObjectIdParam("id", "Reminder job not found."), asyncHandler(async (req, res) => {
  const reminder = await retryFailedReminder(req.params.id, { staffUser: req.user, req });
  if (!reminder) throw badRequest("Only failed reminders can be retried.");
  res.json({ success: true, reminder });
}));

module.exports = router;
