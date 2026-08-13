const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

process.env.NODE_ENV = "test";
process.env.CORS_ORIGINS = "https://clinic.example";
process.env.FRONTEND_URL = "https://clinic.example";
process.env.META_APP_SECRET = "whatsapp-test-secret";
process.env.WHATSAPP_VERIFY_TOKEN = "whatsapp-verify-token";
process.env.WHATSAPP_ACCESS_TOKEN = "whatsapp-access-token";
process.env.WHATSAPP_PHONE_NUMBER_ID = "123456789";
process.env.WHATSAPP_TEMPLATE_APPOINTMENT_CONFIRMATION = "dr_sohaib_appointment_confirmation_v1";
process.env.WHATSAPP_TEMPLATE_APPOINTMENT_CONFIRMATION_LANGUAGE = "en_US";
process.env.WHATSAPP_TEMPLATE_APPOINTMENT_REMINDER = "dr_sohaib_appointment_reminder_v1";
process.env.WHATSAPP_TEMPLATE_APPOINTMENT_REMINDER_LANGUAGE = "en_US";
process.env.WHATSAPP_TEMPLATE_RESCHEDULE_CONFIRMATION = "dr_sohaib_reschedule_confirmation_v1";
process.env.WHATSAPP_TEMPLATE_RESCHEDULE_CONFIRMATION_LANGUAGE = "en_US";
process.env.WHATSAPP_TEMPLATE_CANCELLATION_CONFIRMATION = "dr_sohaib_cancellation_confirmation_v1";
process.env.WHATSAPP_TEMPLATE_CANCELLATION_CONFIRMATION_LANGUAGE = "en_US";

const { createApp } = require("../src/app");
const { handleIncomingMessage } = require("../src/conversation/orchestrator");
const {
  setMetaFetchForTests, sendStaffMessage, sendText, updateDeliveryStatus
} = require("../src/services/whatsappService");
const { createAppointment } = require("../src/services/appointmentService");
const { ensureInitialLocations } = require("../src/services/locationService");
const {
  Appointment, AuditLog, BookingRequest, ClinicLocation, ConversationSession,
  MessageDeliveryStatus, Patient, PatientConsent, ReminderJob, RescheduleHistory, WhatsAppMessage, Counter
} = require("../src/models");

let mongod;
let server;
let baseUrl;
let metaRequests = [];
let metaSequence = 0;

function successfulMetaFetch() {
  setMetaFetchForTests(async (url, options) => {
    const payload = JSON.parse(options.body);
    metaRequests.push({ url, payload });
    if (payload.status === "read") return new Response(JSON.stringify({ success: true }), { status: 200 });
    return new Response(JSON.stringify({ messages: [{ id: `wamid.out.${++metaSequence}` }] }), {
      status: 200, headers: { "content-type": "application/json" }
    });
  });
}

async function waitFor(check, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for asynchronous webhook processing.");
}

function signedBody(body) {
  const raw = JSON.stringify(body);
  return { raw, signature: `sha256=${crypto.createHmac("sha256", process.env.META_APP_SECRET).update(raw).digest("hex")}` };
}

async function postWebhook(body, signatureOverride) {
  const signed = signedBody(body);
  const response = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": signatureOverride || signed.signature },
    body: signed.raw
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

function incomingWebhook({ id, phone = "923001234567", text, replyId, replyTitle = "Selection" }) {
  const message = replyId
    ? { id, from: phone, type: "interactive", interactive: { button_reply: { id: replyId, title: replyTitle } } }
    : { id, from: phone, type: "text", text: { body: text } };
  return { object: "whatsapp_business_account", entry: [{ changes: [{ value: { messages: [message] } }] }] };
}

async function reachBookingReview(phone = "+923001234567") {
  await handleIncomingMessage({ phoneE164: phone, text: "Hi", messageId: "direct-hi" });
  let reply = await handleIncomingMessage({ phoneE164: phone, text: "Book Appointment", replyId: "MENU_BOOK", messageId: "direct-book" });
  const locationId = reply.sections[0].rows.find((row) => row.id.startsWith("BOOK_LOCATION_")).id;
  reply = await handleIncomingMessage({ phoneE164: phone, text: "Clinic", replyId: locationId, messageId: "direct-location" });
  assert.match(reply.body, /District selected/i);
  reply = await handleIncomingMessage({ phoneE164: phone, text: "WhatsApp Test Patient", messageId: "direct-name" });
  assert.equal(reply.kind, "buttons");
  reply = await handleIncomingMessage({ phoneE164: phone, text: "Use this number", replyId: "BOOK_PHONE_CONFIRM", messageId: "direct-phone" });
  assert.equal(reply.buttonText, "Department");
  reply = await handleIncomingMessage({ phoneE164: phone, text: "General", replyId: "BOOK_REASON_0", messageId: "direct-reason" });
  const dateId = reply.sections[0].rows.find((row) => row.id.startsWith("BOOK_DATE_")).id;
  reply = await handleIncomingMessage({ phoneE164: phone, text: "Date", replyId: dateId, messageId: "direct-date" });
  const slotId = reply.sections[0].rows.find((row) => row.id.startsWith("BOOK_SLOT_")).id;
  reply = await handleIncomingMessage({ phoneE164: phone, text: "Time", replyId: slotId, messageId: "direct-slot" });
  assert.equal(reply.kind, "buttons");
  reply = await handleIncomingMessage({ phoneE164: phone, text: "Yes", replyId: "BOOK_CONSENT_YES", messageId: "direct-consent" });
  assert.equal(reply.kind, "buttons");
  const session = await ConversationSession.findOne({ phoneE164: phone });
  assert.equal(session.state, "BOOKING_REVIEW");
  return session;
}

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { autoIndex: true });
  await ensureInitialLocations();
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongod.stop();
});

test.beforeEach(async () => {
  successfulMetaFetch();
  metaRequests = [];
  metaSequence = 0;
  await Promise.all([
    Appointment.deleteMany({}), AuditLog.deleteMany({}), BookingRequest.deleteMany({}),
    ConversationSession.deleteMany({}), MessageDeliveryStatus.deleteMany({}), Patient.deleteMany({}),
    PatientConsent.deleteMany({}), ReminderJob.deleteMany({}), RescheduleHistory.deleteMany({}),
    WhatsAppMessage.deleteMany({}), Counter.deleteMany({})
  ]);
  await ClinicLocation.updateMany({}, { $set: { blockedDates: [], blockedSlots: [] } });
});

test("webhook verification, signatures, text and Book Appointment reply IDs work", async () => {
  const verification = await fetch(`${baseUrl}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=whatsapp-verify-token&hub.challenge=321`);
  assert.equal(verification.status, 200);
  assert.equal(await verification.text(), "321");
  const invalid = await postWebhook(incomingWebhook({ id: "wamid.bad", text: "Hi" }), "sha256=invalid");
  assert.equal(invalid.status, 403);

  const greeting = await postWebhook(incomingWebhook({ id: "wamid.hi", text: "Hi" }));
  assert.equal(greeting.status, 200);
  await waitFor(() => WhatsAppMessage.exists({ metaMessageId: "wamid.hi" }));
  await waitFor(() => metaRequests.some((request) => request.payload.type === "interactive" && request.payload.interactive.type === "list"));

  const booking = await postWebhook(incomingWebhook({ id: "wamid.book", replyId: "MENU_BOOK", replyTitle: "Book Appointment" }));
  assert.equal(booking.status, 200);
  const session = await waitFor(() => ConversationSession.findOne({ phoneE164: "+923001234567", state: "BOOKING_LOCATION" }));
  assert.ok(session);
  await waitFor(() => metaRequests.some((request) => request.payload.interactive?.action?.sections?.[0]?.rows?.some((row) => row.id.startsWith("BOOK_LOCATION_"))));
});

test("main menu offers secure medical document upload guidance", async () => {
  const menu = await handleIncomingMessage({ phoneE164: "+923001234567", text: "Hi", messageId: "upload-menu" });
  assert.ok(menu.sections[0].rows.some((row) => row.id === "MENU_UPLOAD"));
  const reply = await handleIncomingMessage({ phoneE164: "+923001234567", text: "Upload Medical Document", replyId: "MENU_UPLOAD", messageId: "upload-choice" });
  assert.match(reply.body, /PDF, JPEG or PNG/);
  assert.match(reply.body, /secure upload form/);
});

test("invalid and expired WhatsApp conversation selections fail safely", async () => {
  const phone = "+923001234567";
  let reply = await handleIncomingMessage({ phoneE164: phone, text: "Confirm", replyId: "CONFIRM_BOOKING", messageId: "invalid-confirm" });
  assert.match(reply.body, /invalid|expired/i);
  assert.equal(await Appointment.countDocuments(), 0);

  reply = await handleIncomingMessage({ phoneE164: phone, text: "Book", replyId: "MENU_BOOK", messageId: "invalid-menu" });
  const locationId = reply.sections[0].rows.find((row) => row.id.startsWith("BOOK_LOCATION_")).id;
  await handleIncomingMessage({ phoneE164: phone, text: "Clinic", replyId: locationId, messageId: "invalid-location" });
  reply = await handleIncomingMessage({ phoneE164: phone, text: "Old date", replyId: "BOOK_DATE_2020-01-01", messageId: "expired-date" });
  assert.match(reply.body, /closed|blocked|expired|no longer available/i);
  assert.equal(await Appointment.countDocuments(), 0);
});

test("full WhatsApp booking uses the shared engine and a duplicated final webhook creates exactly one appointment", async () => {
  await reachBookingReview();
  const finalEvent = incomingWebhook({ id: "wamid.confirm.once", replyId: "CONFIRM_BOOKING", replyTitle: "Confirm Booking" });
  assert.equal((await postWebhook(finalEvent)).status, 200);
  const appointment = await waitFor(() => Appointment.findOne({ phoneE164: "+923001234567" }));
  assert.ok(appointment.appointmentId.startsWith("DS-"));
  assert.ok(appointment.activeSlotKey);
  assert.equal(appointment.source, "whatsapp");
  assert.equal((await PatientConsent.findById(appointment.consent)).consentGiven, true);
  await waitFor(() => WhatsAppMessage.exists({ templateName: "dr_sohaib_appointment_confirmation_v1", status: "queued" }));

  assert.equal((await postWebhook(finalEvent)).status, 200);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(await Appointment.countDocuments(), 1);
  assert.equal(await WhatsAppMessage.countDocuments({ metaMessageId: "wamid.confirm.once", direction: "incoming" }), 1);
  assert.equal(await WhatsAppMessage.countDocuments({ templateName: "dr_sohaib_appointment_confirmation_v1" }), 1);
});

test("WhatsApp cancellation and rescheduling use secure phone ownership and configured templates", async () => {
  const phone = "+923001234567";
  const review = await reachBookingReview(phone);
  await handleIncomingMessage({ phoneE164: phone, text: "Confirm", replyId: "CONFIRM_BOOKING", messageId: "direct-confirm" });
  let appointment = await Appointment.findOne({ phoneE164: phone });

  let reply = await handleIncomingMessage({ phoneE164: phone, text: "Manage", replyId: "MENU_MANAGE", messageId: "manage-1" });
  const cancelId = reply.sections[0].rows.find((row) => row.id.startsWith("MANAGE_CANCEL_")).id;
  await handleIncomingMessage({ phoneE164: phone, text: "Cancel", replyId: cancelId, messageId: "cancel-1" });
  reply = await handleIncomingMessage({ phoneE164: phone, text: "Confirm", replyId: "CONFIRM_CANCEL", messageId: "cancel-2" });
  assert.equal(reply.notificationQueued, true);
  appointment = await Appointment.findById(appointment._id);
  assert.equal(appointment.status, "cancelled");
  assert.ok(await WhatsAppMessage.exists({ templateName: "dr_sohaib_cancellation_confirmation_v1" }));

  const bwp = await ClinicLocation.findOne({ code: "BWP" });
  const dates = await require("../src/services/availabilityService").getAvailableDates("BWP", 60);
  const slots = await require("../src/services/availabilityService").getAvailableSlots("BWP", dates[0].date);
  appointment = await createAppointment({
    fullName: "WhatsApp Test Patient", phone, reason: "General", date: dates[0].date,
    time: slots.find((slot) => slot.available).time, locationId: bwp.code, consentGiven: true
  }, { source: "whatsapp", idempotencyKey: "second-booking", skipNotification: true });
  await handleIncomingMessage({ phoneE164: phone, text: "Menu", messageId: "reset" });
  reply = await handleIncomingMessage({ phoneE164: phone, text: "Manage", replyId: "MENU_MANAGE", messageId: "manage-2" });
  const rescheduleId = reply.sections[0].rows.find((row) => row.id.startsWith("MANAGE_RESCHEDULE_")).id;
  reply = await handleIncomingMessage({ phoneE164: phone, text: "Reschedule", replyId: rescheduleId, messageId: "reschedule-1" });
  const locationId = reply.sections[0].rows.find((row) => row.id.startsWith("RESCHEDULE_LOCATION_")).id;
  reply = await handleIncomingMessage({ phoneE164: phone, text: "Clinic", replyId: locationId, messageId: "reschedule-2" });
  const differentDate = reply.sections[0].rows.find((row) => row.id.startsWith("RESCHEDULE_DATE_") && !row.id.endsWith(appointment.date));
  reply = await handleIncomingMessage({ phoneE164: phone, text: "Date", replyId: differentDate.id, messageId: "reschedule-3" });
  const slotId = reply.sections[0].rows.find((row) => row.id.startsWith("RESCHEDULE_SLOT_")).id;
  await handleIncomingMessage({ phoneE164: phone, text: "Time", replyId: slotId, messageId: "reschedule-4" });
  reply = await handleIncomingMessage({ phoneE164: phone, text: "Confirm", replyId: "CONFIRM_RESCHEDULE", messageId: "reschedule-5" });
  assert.equal(reply.notificationQueued, true);
  appointment = await Appointment.findById(appointment._id);
  assert.equal(appointment.status, "rescheduled");
  assert.ok(await WhatsAppMessage.exists({ templateName: "dr_sohaib_reschedule_confirmation_v1" }));
});

test("staff messages call Meta, remain queued, and delivery/read events advance the same record idempotently", async () => {
  await ConversationSession.create({
    phoneE164: "+923001234567", state: "STAFF_HANDOVER",
    serviceWindowExpiresAt: new Date(Date.now() + 60 * 60 * 1000)
  });
  const result = await sendStaffMessage("+923001234567", "Authorized clinic reply", { senderStaff: new mongoose.Types.ObjectId() });
  assert.equal(result.status, "queued");
  assert.equal(metaRequests.filter((request) => request.payload.type === "text").length, 1);
  let stored = await WhatsAppMessage.findById(result.message._id);
  assert.equal(stored.status, "queued");
  assert.ok(stored.metaMessageId);

  await updateDeliveryStatus({ id: stored.metaMessageId, recipient_id: "923001234567", status: "sent", timestamp: "1800000000" });
  await updateDeliveryStatus({ id: stored.metaMessageId, recipient_id: "923001234567", status: "delivered", timestamp: "1800000001" });
  await updateDeliveryStatus({ id: stored.metaMessageId, recipient_id: "923001234567", status: "read", timestamp: "1800000002" });
  await updateDeliveryStatus({ id: stored.metaMessageId, recipient_id: "923001234567", status: "read", timestamp: "1800000002" });
  stored = await WhatsAppMessage.findById(stored._id);
  assert.equal(stored.status, "read");
  assert.equal(await MessageDeliveryStatus.countDocuments({ metaMessageId: stored.metaMessageId }), 3);

  const closed = await ConversationSession.create({ phoneE164: "+923009999999", serviceWindowExpiresAt: new Date(Date.now() - 1000) });
  const blocked = await sendStaffMessage(closed.phoneE164, "Outside service window", { senderStaff: new mongoose.Types.ObjectId() });
  assert.equal(blocked.status, "failed");
  assert.equal(blocked.failureCode, "SERVICE_WINDOW_CLOSED");
});

test("Meta authentication and validation failures are stored safely as failed", async () => {
  setMetaFetchForTests(async () => new Response(JSON.stringify({ error: { message: "Access token expired", code: 190 } }), {
    status: 401, headers: { "content-type": "application/json" }
  }));
  const result = await sendText("+923001234567", "Test failure");
  assert.equal(result.status, "failed");
  const stored = await WhatsAppMessage.findById(result.message._id);
  assert.equal(stored.status, "failed");
  assert.equal(stored.failureCode, "190");
  assert.match(stored.failureReason, /expired/i);
  assert.equal(JSON.stringify(stored.toObject()).includes(process.env.WHATSAPP_ACCESS_TOKEN), false);
});
