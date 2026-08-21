const express = require("express");
const { z } = require("zod");
const { ConversationSession, WhatsAppMessage, Patient } = require("../models");
const { asyncHandler } = require("../utils/asyncHandler");
const { badRequest, notFound } = require("../utils/errors");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");
const { normalizePhone } = require("../utils/security");
const { audit } = require("../services/auditService");
const mongoose = require("mongoose");
const { publicFormLimiter } = require("../middleware/security");
const { sendStaffMessage } = require("../services/whatsappService");
const { AppError } = require("../utils/errors");

const router = express.Router();

// POST /api/conversations (Start / Submit Staff Handover Request)
router.post("/", publicFormLimiter, asyncHandler(async (req, res) => {
  const schema = z.object({
    name: z.string().optional().or(z.literal("")),
    phone: z.string().min(7).max(40),
    appointmentId: z.string().optional().or(z.literal("")),
    message: z.string().min(1).max(2000),
    preferredContactMethod: z.string().optional().or(z.literal(""))
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw badRequest("Invalid conversation request data", parsed.error.flatten());
  const input = parsed.data;

  const phoneE164 = normalizePhone(input.phone);
  if (!phoneE164) throw badRequest("Invalid conversation request data");
  const serviceWindowExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  let session = await ConversationSession.findOne({ phoneE164 });

  if (!session) {
    session = await ConversationSession.create({
      phoneE164,
      humanRequired: true,
      aiPaused: false,
      lastMessageAt: new Date(),
      serviceWindowExpiresAt
    });
  } else {
    session.humanRequired = true;
    session.lastMessageAt = new Date();
    session.serviceWindowExpiresAt = serviceWindowExpiresAt;
    await session.save();
  }

  // Create message log
  await WhatsAppMessage.create({
    direction: "incoming",
    senderType: "patient",
    phoneE164,
    conversation: session._id,
    body: input.message,
    status: "received",
    serviceWindowExpiresAt
  });

  await audit({ actorType: "patient", action: "conversation.handover_requested", entityType: "conversation", entityId: String(session._id), req });

  res.status(201).json({
    success: true,
    session: { id: session._id, humanRequired: session.humanRequired },
    message: "Your message has been sent to Dr. Shoaib's clinic staff. An assistant will contact you shortly."
  });
}));

router.use(requireAuth, requirePermission("conversations.read"));

// GET /api/conversations - List Conversations
router.get("/", asyncHandler(async (req, res) => {
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 100));
  const page = Math.max(1, Number(req.query.page) || 1);
  const conversations = await ConversationSession.find()
    .populate("patient", "patientId fullName phoneE164 preferredLanguage city")
    .populate("takenOverBy", "name role")
    .sort({ lastMessageAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
  await audit({ actorType: "staff", action: "conversations.list_viewed", entityType: "conversation", metadata: { resultCount: conversations.length }, req });
  res.json({ success: true, conversations });
}));

// GET /api/conversations/:id
router.get("/:id", asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) throw notFound("Conversation not found");
  const session = await ConversationSession.findById(req.params.id)
    .populate("patient", "patientId fullName phoneE164 preferredLanguage city")
    .populate("takenOverBy", "name role")
    .lean();

  if (!session) throw notFound("Conversation not found");

  const messages = await WhatsAppMessage.find({ conversation: session._id })
    .sort({ createdAt: 1 })
    .lean();

  await audit({ actorType: "staff", action: "conversation.viewed", entityType: "conversation", entityId: String(session._id), req });

  res.json({ success: true, conversation: session, session, messages });
}));

// POST /api/conversations/:id/messages
router.post("/:id/messages", requirePermission("conversations.manage"), asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) throw notFound("Conversation not found");
  const session = await ConversationSession.findById(req.params.id);
  if (!session) throw notFound("Conversation not found");

  const parsed = z.object({ body: z.string().min(1).max(4000) }).strict().safeParse(req.body);
  if (!parsed.success) throw badRequest("Message body is required.");

  const result = await sendStaffMessage(session.phoneE164, parsed.data.body, { senderStaff: req.user._id });
  const sentMessage = result.message;

  session.lastMessageAt = new Date();
  await session.save();

  await audit({ actorType: "staff", action: result.status === "queued" ? "conversation.staff_message_queued" : "conversation.staff_message_failed", entityType: "conversation", entityId: String(session._id), metadata: { failureCode: result.failureCode }, req });

  if (result.status !== "queued") throw new AppError(result.failureCode === "SERVICE_WINDOW_CLOSED" ? 409 : 502, result.failureCode || "WHATSAPP_SEND_FAILED", result.error || "WhatsApp message could not be sent.");
  res.status(201).json({ success: true, message: sentMessage });
}));

// POST /api/conversations/:id/takeover
router.post("/:id/takeover", requirePermission("conversations.manage"), asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) throw notFound("Conversation not found");
  const session = await ConversationSession.findById(req.params.id);
  if (!session) throw notFound("Conversation not found");

  session.humanRequired = true;
  session.aiPaused = true;
  if (req.user) session.takenOverBy = req.user._id;
  await session.save();

  await audit({ actorType: "staff", action: "conversation.takeover", entityType: "conversation", entityId: String(session._id), req });

  res.json({ success: true, session, message: "Human takeover activated. AI is paused." });
}));

// POST /api/conversations/:id/reactivate-ai
router.post("/:id/reactivate-ai", requirePermission("conversations.manage"), asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) throw notFound("Conversation not found");
  const session = await ConversationSession.findById(req.params.id);
  if (!session) throw notFound("Conversation not found");

  session.humanRequired = false;
  session.aiPaused = false;
  session.takenOverBy = null;
  await session.save();

  await audit({ actorType: "staff", action: "conversation.reactivate_ai", entityType: "conversation", entityId: String(session._id), req });

  res.json({ success: true, session, message: "AI assistant reactivated." });
}));

module.exports = router;
