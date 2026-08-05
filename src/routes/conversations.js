const express = require("express");
const { z } = require("zod");
const { ConversationSession, WhatsAppMessage, Patient } = require("../models");
const { asyncHandler } = require("../utils/asyncHandler");
const { badRequest, notFound } = require("../utils/errors");

const router = express.Router();

// POST /api/conversations (Start / Submit Staff Handover Request)
router.post("/", asyncHandler(async (req, res) => {
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

  const phoneE164 = input.phone.startsWith("+") ? input.phone : `+${input.phone}`;
  let session = await ConversationSession.findOne({ phoneE164 });

  if (!session) {
    session = await ConversationSession.create({
      phoneE164,
      humanRequired: true,
      aiPaused: true,
      lastMessageAt: new Date()
    });
  } else {
    session.humanRequired = true;
    session.aiPaused = true;
    session.lastMessageAt = new Date();
    await session.save();
  }

  // Create message log
  await WhatsAppMessage.create({
    direction: "incoming",
    senderType: "patient",
    phoneE164,
    conversation: session._id,
    body: input.message,
    status: "received"
  });

  res.status(201).json({
    success: true,
    session,
    message: "Your message has been sent to Dr. Sohaib's clinic staff. An assistant will contact you shortly."
  });
}));

// GET /api/conversations - List Conversations
router.get("/", asyncHandler(async (req, res) => {
  const conversations = await ConversationSession.find()
    .populate("patient takenOverBy")
    .sort({ lastMessageAt: -1 })
    .lean();
  res.json({ success: true, conversations });
}));

// GET /api/conversations/:id
router.get("/:id", asyncHandler(async (req, res) => {
  const session = await ConversationSession.findById(req.params.id)
    .populate("patient takenOverBy")
    .lean();

  if (!session) throw notFound("Conversation not found");

  const messages = await WhatsAppMessage.find({ conversation: session._id })
    .sort({ createdAt: 1 })
    .lean();

  res.json({ success: true, conversation: session, session, messages });
}));

// POST /api/conversations/:id/messages
router.post("/:id/messages", asyncHandler(async (req, res) => {
  const session = await ConversationSession.findById(req.params.id);
  if (!session) throw notFound("Conversation not found");

  const { body, senderType } = req.body;
  if (!body) throw badRequest("Message body is required.");

  const msg = await WhatsAppMessage.create({
    direction: senderType === "patient" ? "incoming" : "outgoing",
    senderType: senderType || "staff",
    phoneE164: session.phoneE164,
    conversation: session._id,
    body,
    status: "sent"
  });

  session.lastMessageAt = new Date();
  await session.save();

  res.status(201).json({ success: true, message: msg });
}));

// POST /api/conversations/:id/takeover
router.post("/:id/takeover", asyncHandler(async (req, res) => {
  const session = await ConversationSession.findById(req.params.id);
  if (!session) throw notFound("Conversation not found");

  session.humanRequired = true;
  session.aiPaused = true;
  if (req.user) session.takenOverBy = req.user._id;
  await session.save();

  res.json({ success: true, session, message: "Human takeover activated. AI is paused." });
}));

// POST /api/conversations/:id/reactivate-ai
router.post("/:id/reactivate-ai", asyncHandler(async (req, res) => {
  const session = await ConversationSession.findById(req.params.id);
  if (!session) throw notFound("Conversation not found");

  session.humanRequired = false;
  session.aiPaused = false;
  session.takenOverBy = null;
  await session.save();

  res.json({ success: true, session, message: "AI assistant reactivated." });
}));

module.exports = router;
