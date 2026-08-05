const express = require("express");
const { ReminderJob, Patient } = require("../models");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler } = require("../utils/asyncHandler");
const { badRequest, notFound } = require("../utils/errors");

const router = express.Router();

// List Reminders
router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.type) filter.type = req.query.type;
  if (req.query.status) filter.status = req.query.status;

  const reminders = await ReminderJob.find(filter)
    .populate("patient appointment")
    .sort({ dueAt: 1 })
    .lean();

  res.json({ success: true, reminders });
}));

// Schedule Follow-up Reminder
router.post("/follow-up", requireAuth, asyncHandler(async (req, res) => {
  const { patientId, phone, dueDays, message } = req.body;
  if (!phone || !message) throw badRequest("Phone number and reminder message are required.");

  let patient = null;
  if (patientId) patient = await Patient.findById(patientId);

  const days = Number(dueDays) || 7;
  const dueAt = new Date(Date.now() + days * 86400000);

  const reminder = await ReminderJob.create({
    patient: patient ? patient._id : null,
    phoneE164: phone.startsWith("+") ? phone : `+${phone}`,
    type: "follow_up_reminder",
    dueAt,
    message,
    status: "pending"
  });

  res.status(201).json({ success: true, reminder });
}));

// Update Reminder Status
router.patch("/:id/status", requireAuth, asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!["pending", "sent", "cancelled"].includes(status)) throw badRequest("Invalid reminder status.");

  const reminder = await ReminderJob.findById(req.params.id);
  if (!reminder) throw notFound("Reminder job not found.");

  reminder.status = status;
  if (status === "sent") reminder.sentAt = new Date();
  await reminder.save();

  res.json({ success: true, reminder });
}));

module.exports = router;
