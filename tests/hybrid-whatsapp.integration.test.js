const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

process.env.NODE_ENV = "test";
process.env.AI_CONCIERGE_ENABLED = "true";
process.env.META_APP_SECRET = "hybrid-meta-secret";
process.env.WHATSAPP_VERIFY_TOKEN = "hybrid-verify";
process.env.WHATSAPP_ACCESS_TOKEN = "hybrid-access-token";
process.env.WHATSAPP_PHONE_NUMBER_ID = "123456789";

let voiceTranscript = "";
const { setTranscriptionClientForTests } = require("../src/services/transcriptionService");
setTranscriptionClientForTests({
  audio: { transcriptions: { create: async () => ({ text: voiceTranscript, logprobs: [{ logprob: 0 }, { logprob: 0 }] }) } }
});

const { createApp } = require("../src/app");
const { setMetaFetchForTests } = require("../src/services/whatsappService");
const { getAvailableDates } = require("../src/services/availabilityService");
const { ensureInitialLocations } = require("../src/services/locationService");
const { Appointment, ConversationSession, WhatsAppMessage } = require("../src/models");

let mongod;
let server;
let baseUrl;
let outgoing = [];
let sequence = 0;

function signed(body) {
  const raw = JSON.stringify(body);
  const signature = `sha256=${crypto.createHmac("sha256", process.env.META_APP_SECRET).update(raw).digest("hex")}`;
  return { raw, signature };
}

function webhookMessage(message) {
  return { object: "whatsapp_business_account", entry: [{ changes: [{ value: { messages: [message] } }] }] };
}

async function post(message) {
  const payload = signed(webhookMessage(message));
  const response = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": payload.signature },
    body: payload.raw
  });
  assert.equal(response.status, 200);
}

async function waitFor(check, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for hybrid webhook processing.");
}

async function click(id, title) {
  await post({
    id: `wamid.hybrid.${++sequence}`,
    from: "923009998888",
    type: "interactive",
    interactive: { button_reply: { id, title } }
  });
}

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { autoIndex: true });
  await ensureInitialLocations();
  setMetaFetchForTests(async (url, options = {}) => {
    if (url.endsWith("/voice-media-id")) {
      return new Response(JSON.stringify({ url: "https://lookaside.fbsbx.com/voice.ogg", mime_type: "audio/ogg", file_size: 32 }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url === "https://lookaside.fbsbx.com/voice.ogg") {
      return new Response(Buffer.from("synthetic-voice-note"), { status: 200, headers: { "content-type": "audio/ogg", "content-length": "20" } });
    }
    const payload = JSON.parse(options.body || "{}");
    if (!payload.status) outgoing.push(payload);
    return new Response(JSON.stringify({ messages: [{ id: `wamid.out.${++sequence}` }] }), { status: 200, headers: { "content-type": "application/json" } });
  });
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongod.stop();
});

test("a signed WhatsApp voice note follows the same confirmation workflow and stores no raw transcript", async () => {
  const date = (await getAvailableDates("BWP", 60))[0].date;
  voiceTranscript = `My name is Voice Test Patient. I have knee pain and need an appointment on ${date}.`;
  outgoing = [];
  await post({ id: "wamid.voice.in", from: "923009998888", type: "audio", audio: { id: "voice-media-id", mime_type: "audio/ogg", voice: true } });

  const slotPayload = await waitFor(() => outgoing.find((payload) => payload.interactive?.action?.buttons?.some((button) => button.reply.id.startsWith("HYBRID_SLOT_"))));
  const slot = slotPayload.interactive.action.buttons[0].reply;
  await click(slot.id, slot.title);
  await waitFor(() => outgoing.find((payload) => payload.interactive?.action?.buttons?.some((button) => button.reply.id === "HYBRID_CONFIRM_BOOKING")));
  await click("HYBRID_CONFIRM_BOOKING", "Confirm Appointment");
  await waitFor(() => outgoing.find((payload) => payload.interactive?.action?.buttons?.some((button) => button.reply.id === "HYBRID_CONSENT_YES")));
  await click("HYBRID_CONSENT_YES", "Yes, I Consent");
  await waitFor(() => outgoing.find((payload) => payload.interactive?.action?.buttons?.some((button) => button.reply.id === "HYBRID_SKIP_REPORTS")));
  await click("HYBRID_SKIP_REPORTS", "Continue Without");
  await waitFor(() => outgoing.find((payload) => payload.interactive?.action?.buttons?.some((button) => button.reply.id === "HYBRID_SUMMARY_CORRECT")));
  await click("HYBRID_SUMMARY_CORRECT", "Everything Is Correct");

  const appointment = await waitFor(() => Appointment.findOne({ phoneE164: "+923009998888" }));
  await waitFor(() => outgoing.find((payload) => payload.interactive?.body?.text?.includes("Appointment Confirmed")));
  assert.equal(appointment.patientSnapshot.fullName, "Voice Test Patient");
  assert.equal(await Appointment.countDocuments({ phoneE164: "+923009998888" }), 1);
  await waitFor(() => ConversationSession.exists({ phoneE164: "+923009998888", state: "HYBRID_COMPLETE" }));
  assert.equal(await WhatsAppMessage.countDocuments({ body: voiceTranscript }), 0);
  const incomingVoice = await WhatsAppMessage.findOne({ metaMessageId: "wamid.voice.in" });
  assert.equal(incomingVoice.messageType, "audio");
  assert.ok(!incomingVoice.body);
});
