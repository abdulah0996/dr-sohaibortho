const models = require("../models");
const { config } = require("../config/env");
const { normalizePhone } = require("../utils/security");
const { createAiInterpreter } = require("../services/aiInterpreterService");
const { createConversationTools } = require("./tools");
const { fallbackInterpret, parseDate, parseTime } = require("./fallbackNlu");
const { storeWhatsAppReport, linkReportsToAppointment } = require("../services/whatsappReportService");
const { sendApprovedDoctorWelcome } = require("../services/visitExperienceService");

const WELCOME = "Assalam-o-Alaikum! I’m Dr. Sohaib’s Smart Clinic Assistant.\nYou can type or send a voice note and tell me how I can help.";
const HANDOFF = "I’m connecting you with the clinic receptionist for accurate assistance.";

function buttons(body, options) {
  return { kind: "buttons", body, buttons: options };
}

function displayTime(value) {
  const [hour, minute] = String(value).split(":").map(Number);
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function mergeFacts(context, facts) {
  const next = { ...context };
  const mappings = {
    patient_name: "fullName", age: "age", concern: "reason", preferred_clinic: "preferredClinic",
    preferred_date: "date", preferred_time: "time", appointment_id: "appointmentId", reports_available: "reportsAvailable"
  };
  for (const [source, target] of Object.entries(mappings)) {
    if (facts[source] !== null && facts[source] !== undefined && facts[source] !== "") next[target] = facts[source];
  }
  if (facts.patient_relationship && !["unknown", "self"].includes(facts.patient_relationship)) next.relationship = facts.patient_relationship;
  else if (!next.relationship) next.relationship = "self";
  if (facts.language) next.language = facts.language === "ur" ? "ur" : "en";
  return next;
}

function createHybridOrchestrator(deps = {}) {
  const d = {
    models,
    interpret: createAiInterpreter(),
    tools: createConversationTools(),
    storeWhatsAppReport,
    linkReportsToAppointment,
    sendApprovedDoctorWelcome,
    ...deps
  };

  async function save(session, state, context = session.context || {}) {
    session.state = state;
    session.context = context;
    session.lastMessageAt = new Date();
    await session.save();
  }

  async function getSession(phoneE164, language) {
    const phone = normalizePhone(phoneE164) || phoneE164;
    let session = await d.models.ConversationSession.findOne({ phoneE164: phone });
    if (!session) session = await d.models.ConversationSession.create({ phoneE164: phone, language: language === "ur" ? "ur" : "en", state: "HYBRID_IDLE", lastMessageAt: new Date() });
    return { session, phone };
  }

  async function handoff(session, reason) {
    await d.tools.execute("request_staff_handoff", { reason }, { session });
    return { body: HANDOFF };
  }

  async function greeting(session) {
    let body = WELCOME;
    const recentlyVerified = session.identityVerifiedAt && Date.now() - new Date(session.identityVerifiedAt).getTime() < 30 * 24 * 60 * 60 * 1000;
    if (recentlyVerified && session.patient) {
      const patient = await d.models.Patient.findById(session.patient).select("fullName").lean();
      const family = await d.models.FamilyProfile.find({ contactPatient: session.patient }).select("fullName").limit(3).lean();
      if (patient) body += family.length ? `\n\nWelcome back, ${patient.fullName}. You can tell me whether this is for you or ${family.map((item) => item.fullName).join(" or ")}.` : `\n\nWelcome back, ${patient.fullName}.`;
    }
    await save(session, "HYBRID_IDLE", {});
    return { body };
  }

  async function resolveLocation(context) {
    const locations = await d.tools.execute("get_clinic_information", {});
    const active = locations.locations.filter((location) => location.status === "Active");
    if (!active.length) return { error: "No clinic is currently accepting appointments. I’m connecting you with reception." };
    if (context.locationId) return { location: active.find((location) => location.code === context.locationId) };
    const wanted = String(context.preferredClinic || "").toLowerCase();
    const selected = wanted ? active.find((location) => [location.code, location.clinicName, location.city].some((value) => String(value).toLowerCase().includes(wanted))) : null;
    if (selected) return { location: selected };
    if (active.length === 1) return { location: active[0] };
    return { choices: active.slice(0, 3) };
  }

  async function availableSlotReply(session, context, mode) {
    const availability = await d.tools.execute("get_available_slots", { locationId: context.locationId, date: context.date });
    const available = availability.slots.filter((slot) => slot.available);
    if (!available.length) {
      delete context.date;
      delete context.time;
      await save(session, mode === "reschedule" ? "HYBRID_RESCHEDULE_DATE" : "HYBRID_BOOKING_DATE", context);
      return { body: "That day has no available appointments. Which other day would suit you?" };
    }
    if (context.time && available.some((slot) => slot.time === context.time)) return null;
    const choices = available.slice(0, 3);
    delete context.time;
    await save(session, mode === "reschedule" ? "HYBRID_RESCHEDULE_TIME" : "HYBRID_BOOKING_TIME", { ...context, offeredSlots: choices.map((slot) => slot.time) });
    const prefix = mode === "reschedule" ? "HYBRID_RESLOT_" : "HYBRID_SLOT_";
    return buttons(
      context.time ? "That time is no longer available. These are available:" : `I found ${choices.length === 1 ? "an available appointment" : "these available appointments"} on ${context.date}. Which time suits you?`,
      choices.map((slot) => ({ id: `${prefix}${slot.time}`, title: displayTime(slot.time) }))
    );
  }

  async function bookingConfirmation(session, context) {
    await save(session, "HYBRID_BOOKING_CONFIRM", context);
    return buttons(
      `Please confirm: ${context.fullName}${context.age !== undefined ? `, age ${context.age}` : ""}, ${context.date} at ${displayTime(context.time)}, ${context.locationName}.`,
      [{ id: "HYBRID_CONFIRM_BOOKING", title: "Confirm Appointment" }, { id: "HYBRID_CHANGE_TIME", title: "Change Time" }]
    );
  }

  async function continueBooking(session, phone, facts, input) {
    let context = mergeFacts(session.context || {}, facts);
    context.intent = "booking";
    if (session.state === "HYBRID_BOOKING_NAME" && !facts.patient_name && input.length >= 2) context.fullName = input;
    if (session.state === "HYBRID_BOOKING_CONCERN" && !facts.concern && input.length >= 2) context.reason = input;
    if (session.state === "HYBRID_BOOKING_DATE" && !facts.preferred_date) context.date = parseDate(input);
    if (session.state === "HYBRID_BOOKING_TIME" && !facts.preferred_time) context.time = parseTime(input);

    if (!context.fullName) {
      await save(session, "HYBRID_BOOKING_NAME", context);
      return { body: context.relationship !== "self" ? "What is the patient’s name?" : "What is the patient’s full name?" };
    }
    if (!context.reason) {
      await save(session, "HYBRID_BOOKING_CONCERN", context);
      return { body: "What is the main concern for this visit? A short description is enough." };
    }
    const locationResult = await resolveLocation(context);
    if (locationResult.error) return handoff(session, "unsupported");
    if (locationResult.choices) {
      await save(session, "HYBRID_BOOKING_LOCATION", context);
      return buttons("Which clinic would you prefer?", locationResult.choices.map((location) => ({ id: `HYBRID_LOCATION_${location.code}`, title: `${location.city}`.slice(0, 20) })));
    }
    if (!locationResult.location) {
      delete context.locationId;
      return handoff(session, "unsupported");
    }
    context.locationId = locationResult.location.code;
    context.locationName = `${locationResult.location.clinicName}, ${locationResult.location.city}`;
    if (!context.date) {
      await save(session, "HYBRID_BOOKING_DATE", context);
      return { body: "Which day would you prefer?" };
    }
    const slotReply = await availableSlotReply(session, context, "booking");
    if (slotReply) return slotReply;
    return bookingConfirmation(session, context);
  }

  async function reportChoice(session, context) {
    const next = { ...context, reportsAsked: true, reportIds: context.reportIds || [] };
    await save(session, "HYBRID_REPORT_CHOICE", next);
    return buttons("Would you like to attach any previous medical reports for Dr. Sohaib?", [
      { id: "HYBRID_UPLOAD_REPORTS", title: "Upload Reports" },
      { id: "HYBRID_SKIP_REPORTS", title: "Continue Without" }
    ]);
  }

  async function summaryReview(session, context) {
    const reports = context.reportIds?.length || 0;
    await save(session, "HYBRID_SUMMARY_REVIEW", context);
    return buttons(
      `*Visit Summary*\nPatient: ${context.fullName}${context.age !== undefined ? `, ${context.age}` : ""}\nConcern: ${context.reason}\nReports attached: ${reports}\nAppointment: ${context.date}, ${displayTime(context.time)}\n\nPatient-provided information; not an AI diagnosis.`,
      [{ id: "HYBRID_SUMMARY_CORRECT", title: "Everything Is Correct" }, { id: "HYBRID_SUMMARY_CHANGE", title: "Make a Change" }]
    );
  }

  async function completeBooking(session, phone, messageId) {
    const context = session.context || {};
    const created = await d.tools.execute("create_appointment", {
      fullName: context.fullName,
      ...(context.age !== undefined ? { age: context.age } : {}),
      reason: context.reason,
      locationId: context.locationId,
      date: context.date,
      time: context.time,
      language: context.language || "en",
      relationship: context.relationship || "self",
      consentGiven: true,
      explicitConfirmation: context.appointmentConfirmed === true,
      summaryApproved: true,
      reportsAttached: context.reportIds?.length || 0,
      ...(context.existingCondition ? { existingCondition: context.existingCondition } : {})
    }, { phoneE164: phone, session, idempotencyKey: messageId });
    const appointment = await d.models.Appointment.findOne({ appointmentId: created.appointmentId, phoneE164: phone });
    if (appointment) await d.linkReportsToAppointment({ reportIds: context.reportIds, phoneE164: phone, appointment });
    if (!session.patient && appointment) session.patient = appointment.patient;
    await save(session, "HYBRID_COMPLETE", { lastAppointmentId: created.appointmentId });
    return {
      ...buttons(`✅ *Appointment Confirmed*\n${created.fullName}\n${created.date}, ${displayTime(created.time)}\nToken: ${created.tokenNumber}\n${created.clinicName}\nReports received: ${created.reportsAttached}`, [
        { id: "HYBRID_DIRECTIONS", title: "Directions" },
        { id: "HYBRID_CHANGE_APPOINTMENT", title: "Change Appointment" },
        { id: "HYBRID_TALK_RECEPTION", title: "Talk to Reception" }
      ]),
      welcomeAppointmentId: appointment ? String(appointment._id) : undefined
    };
  }

  async function verifyForManagement(session, phone, context) {
    if (!context.appointmentId) return null;
    try {
      return await d.tools.execute("lookup_verified_appointment", { appointmentId: context.appointmentId }, { phoneE164: phone, session });
    } catch {
      return false;
    }
  }

  async function continueCancellation(session, phone, facts, input) {
    const context = mergeFacts(session.context || {}, facts);
    context.intent = "cancel";
    if (session.state === "HYBRID_CANCEL_ID" && !facts.appointment_id) context.appointmentId = input.trim().toUpperCase();
    if (!context.appointmentId) {
      await save(session, "HYBRID_CANCEL_ID", context);
      return { body: "Please send the appointment ID so I can verify it securely." };
    }
    const verified = await verifyForManagement(session, phone, context);
    if (!verified) {
      delete context.appointmentId;
      await save(session, "HYBRID_CANCEL_ID", context);
      return { body: "I couldn’t verify that appointment with this WhatsApp number. Please check the appointment ID." };
    }
    await save(session, "HYBRID_CANCEL_CONFIRM", context);
    return buttons(`Please confirm cancellation of appointment ${verified.appointmentId} on ${verified.date} at ${displayTime(verified.time)}.`, [
      { id: "HYBRID_CONFIRM_CANCEL", title: "Cancel Appointment" }, { id: "HYBRID_KEEP_APPOINTMENT", title: "Keep Appointment" }
    ]);
  }

  async function continueReschedule(session, phone, facts, input) {
    let context = mergeFacts(session.context || {}, facts);
    context.intent = "reschedule";
    if (session.state === "HYBRID_RESCHEDULE_ID" && !facts.appointment_id) context.appointmentId = input.trim().toUpperCase();
    if (session.state === "HYBRID_RESCHEDULE_DATE" && !facts.preferred_date) context.date = parseDate(input);
    if (session.state === "HYBRID_RESCHEDULE_TIME" && !facts.preferred_time) context.time = parseTime(input);
    if (!context.appointmentId) {
      await save(session, "HYBRID_RESCHEDULE_ID", context);
      return { body: "Please send the appointment ID so I can verify it securely." };
    }
    const verified = await verifyForManagement(session, phone, context);
    if (!verified) {
      delete context.appointmentId;
      await save(session, "HYBRID_RESCHEDULE_ID", context);
      return { body: "I couldn’t verify that appointment with this WhatsApp number. Please check the appointment ID." };
    }
    context.locationId = context.locationId || verified.clinicCode;
    context.locationName = verified.clinicName;
    if (!context.date) {
      await save(session, "HYBRID_RESCHEDULE_DATE", context);
      return { body: "Which new day would you prefer?" };
    }
    const slotReply = await availableSlotReply(session, context, "reschedule");
    if (slotReply) return slotReply;
    await save(session, "HYBRID_RESCHEDULE_CONFIRM", context);
    return buttons(`Please confirm: move appointment ${context.appointmentId} to ${context.date} at ${displayTime(context.time)}, ${context.locationName}.`, [
      { id: "HYBRID_CONFIRM_RESCHEDULE", title: "Confirm Change" }, { id: "HYBRID_CHANGE_TIME", title: "Change Time" }
    ]);
  }

  async function handleAction(session, phone, action, messageId) {
    const context = { ...(session.context || {}) };
    if (action.startsWith("HYBRID_LOCATION_")) {
      context.locationId = action.slice("HYBRID_LOCATION_".length);
      delete context.preferredClinic;
      await save(session, session.state, context);
      return continueBooking(session, phone, fallbackInterpret(""), "");
    }
    if (action.startsWith("HYBRID_SLOT_")) {
      context.time = action.slice("HYBRID_SLOT_".length);
      await save(session, session.state, context);
      return bookingConfirmation(session, context);
    }
    if (action.startsWith("HYBRID_RESLOT_")) {
      context.time = action.slice("HYBRID_RESLOT_".length);
      await save(session, "HYBRID_RESCHEDULE_CONFIRM", context);
      return buttons(`Please confirm: move appointment ${context.appointmentId} to ${context.date} at ${displayTime(context.time)}, ${context.locationName}.`, [
        { id: "HYBRID_CONFIRM_RESCHEDULE", title: "Confirm Change" }, { id: "HYBRID_CHANGE_TIME", title: "Change Time" }
      ]);
    }
    if (action === "HYBRID_CONFIRM_BOOKING" && session.state === "HYBRID_BOOKING_CONFIRM") {
      context.appointmentConfirmed = true;
      await save(session, "HYBRID_CONSENT", context);
      return buttons(`${config.appointmentConsent.text}\n\nDo you consent?`, [{ id: "HYBRID_CONSENT_YES", title: "Yes, I Consent" }, { id: "HYBRID_CONSENT_NO", title: "No" }]);
    }
    if (action === "HYBRID_CHANGE_TIME") {
      delete context.time;
      const mode = context.intent === "reschedule" ? "reschedule" : "booking";
      return availableSlotReply(session, context, mode);
    }
    if (action === "HYBRID_CONSENT_NO") {
      await save(session, "HYBRID_IDLE", {});
      return { body: "No appointment was created because consent was not provided." };
    }
    if (action === "HYBRID_CONSENT_YES" && session.state === "HYBRID_CONSENT") {
      context.consentGiven = true;
      return reportChoice(session, context);
    }
    if (action === "HYBRID_UPLOAD_REPORTS" && session.state === "HYBRID_REPORT_CHOICE") {
      await save(session, "HYBRID_REPORT_UPLOAD", context);
      return { body: "Please attach a PDF, JPEG, or PNG report here. I won’t interpret or summarize its contents." };
    }
    if (action === "HYBRID_SKIP_REPORTS" && session.state === "HYBRID_REPORT_CHOICE") return summaryReview(session, context);
    if (action === "HYBRID_ADD_REPORT") {
      await save(session, "HYBRID_REPORT_UPLOAD", context);
      return { body: "Please attach the next PDF, JPEG, or PNG report." };
    }
    if (action === "HYBRID_REPORT_DONE") return summaryReview(session, context);
    if (action === "HYBRID_SUMMARY_CHANGE" && session.state === "HYBRID_SUMMARY_REVIEW") {
      await save(session, "HYBRID_SUMMARY_CHANGE", context);
      return { body: "What should I change?" };
    }
    if (action === "HYBRID_SUMMARY_CORRECT" && session.state === "HYBRID_SUMMARY_REVIEW") return completeBooking(session, phone, messageId);
    if (action === "HYBRID_CONFIRM_CANCEL" && session.state === "HYBRID_CANCEL_CONFIRM") {
      const cancelled = await d.tools.execute("cancel_appointment", { appointmentId: context.appointmentId, explicitConfirmation: true }, { phoneE164: phone, session });
      await save(session, "HYBRID_IDLE", { lastAppointmentId: cancelled.appointmentId });
      return { body: `Appointment ${cancelled.appointmentId} has been cancelled.` };
    }
    if (action === "HYBRID_KEEP_APPOINTMENT") {
      await save(session, "HYBRID_IDLE", {});
      return { body: "Your appointment has been kept unchanged." };
    }
    if (action === "HYBRID_CONFIRM_RESCHEDULE" && session.state === "HYBRID_RESCHEDULE_CONFIRM") {
      const changed = await d.tools.execute("reschedule_appointment", {
        appointmentId: context.appointmentId, locationId: context.locationId, date: context.date, time: context.time, explicitConfirmation: true
      }, { phoneE164: phone, session });
      await save(session, "HYBRID_COMPLETE", { lastAppointmentId: changed.appointmentId });
      return buttons(`✅ Appointment changed\n${changed.date}, ${displayTime(changed.time)}\n${changed.clinicName}`, [
        { id: "HYBRID_DIRECTIONS", title: "Directions" }, { id: "HYBRID_TALK_RECEPTION", title: "Talk to Reception" }
      ]);
    }
    if (action === "HYBRID_DIRECTIONS") {
      const info = await d.tools.execute("get_clinic_information", {});
      return { body: info.locations.filter((location) => location.status === "Active").map((location) => `${location.clinicName}, ${location.city}\n${location.address}`).join("\n\n") };
    }
    if (action === "HYBRID_CHANGE_APPOINTMENT") {
      await save(session, "HYBRID_RESCHEDULE_ID", { intent: "reschedule", appointmentId: context.lastAppointmentId });
      return continueReschedule(session, phone, { ...fallbackInterpret(""), appointment_id: context.lastAppointmentId }, "");
    }
    if (action === "HYBRID_TALK_RECEPTION") return handoff(session, "patient_request");
    return null;
  }

  async function handleMedia({ phoneE164, media, messageId }) {
    const { session, phone } = await getSession(phoneE164);
    if (session.aiPaused) return { body: "Staff is currently assisting you." };
    if (session.state !== "HYBRID_REPORT_UPLOAD") return { body: "Please tell me what you need. Medical reports can be attached when I ask during booking." };
    const context = { ...(session.context || {}) };
    const stored = await d.storeWhatsAppReport({
      phoneE164: phone,
      fullName: context.fullName,
      age: context.age,
      isFamilyMember: context.relationship !== "self",
      buffer: media.buffer,
      filename: media.filename,
      mimeType: media.mimeType
    });
    context.reportIds = [...(context.reportIds || []), stored.id];
    await save(session, "HYBRID_REPORT_UPLOAD", context);
    return buttons(`Report received securely (${context.reportIds.length}).`, [
      { id: "HYBRID_ADD_REPORT", title: "Add Another" }, { id: "HYBRID_REPORT_DONE", title: "Continue" }
    ]);
  }

  async function handle({ phoneE164, text = "", language = "en", replyId = "", messageId }) {
    const { session, phone } = await getSession(phoneE164, language);
    const input = String(text || "").trim().slice(0, 2000);
    const action = String(replyId || "").trim();
    if (session.aiPaused && !/^(menu|start)$/i.test(input)) return { body: "You are currently connected with the clinic receptionist." };
    if (action) {
      const reply = await handleAction(session, phone, action, messageId);
      if (reply) return reply;
    }
    if (/^(hi|hello|hey|salam|assalam(?:-o-alaikum)?|aoa|start)$/i.test(input) || /السلام|سلام/i.test(input)) return greeting(session);
    if (/^(menu|start over)$/i.test(input)) return greeting(session);

    const localSafety = fallbackInterpret(input);
    const facts = await d.interpret({ text: input, rateLimitKey: phone });
    if (localSafety.intent === "emergency" || facts.intent === "emergency" || facts.safety === "emergency") {
      await d.models.EmergencyAlert.create({
        phoneE164: phone, patient: session.patient || undefined, conversation: session._id,
        alertMessage: "Possible emergency language detected in patient message.", priority: "critical", status: "open"
      });
      await d.tools.execute("request_staff_handoff", { reason: "medical_safety" }, { session });
      return { body: config.emergencyGuidance };
    }
    if (facts.safety !== "none" || facts.intent === "medical_advice") {
      await d.tools.execute("request_staff_handoff", { reason: "medical_safety" }, { session });
      return { body: `I can’t diagnose, prescribe medicine, or interpret reports. ${HANDOFF}` };
    }
    if (facts.intent === "handoff") return handoff(session, "patient_request");
    if (facts.intent === "greeting") return greeting(session);
    if (facts.confidence < 0.4) return handoff(session, "low_confidence");

    const stateIntent = String(session.context?.intent || "");
    if (stateIntent === "booking" || facts.intent === "booking" || session.state.startsWith("HYBRID_BOOKING") || session.state === "HYBRID_SUMMARY_CHANGE") return continueBooking(session, phone, facts, input);
    if (stateIntent === "cancel" || facts.intent === "cancel" || session.state.startsWith("HYBRID_CANCEL")) return continueCancellation(session, phone, facts, input);
    if (stateIntent === "reschedule" || facts.intent === "reschedule" || session.state.startsWith("HYBRID_RESCHEDULE")) return continueReschedule(session, phone, facts, input);
    if (facts.intent === "clinic_info") {
      const info = await d.tools.execute("get_clinic_information", {});
      return { body: info.locations.map((location) => `${location.clinicName}, ${location.city}\n${location.address}\nStatus: ${location.status}`).join("\n\n") };
    }
    if (facts.intent === "visit_status") {
      const context = mergeFacts(session.context || {}, facts);
      if (!context.appointmentId) {
        await save(session, "HYBRID_VISIT_ID", { intent: "visit_status" });
        return { body: "Please send the appointment ID so I can verify the visit securely." };
      }
      try {
        const status = await d.tools.execute("get_visit_status", { appointmentId: context.appointmentId }, { phoneE164: phone, session });
        return { body: `Appointment ${status.appointmentId}: ${status.status}. Please plan to arrive around ${displayTime(status.suggestedArrivalTime)}.${status.delayMinutes !== null ? ` Dr. Sohaib is approximately ${status.delayMinutes} minutes behind schedule.` : ""}` };
      } catch {
        return { body: "I couldn’t verify that appointment with this WhatsApp number." };
      }
    }
    if (session.state === "HYBRID_VISIT_ID") {
      try {
        const status = await d.tools.execute("get_visit_status", { appointmentId: input.toUpperCase() }, { phoneE164: phone, session });
        return { body: `Appointment ${status.appointmentId}: ${status.status}. Please plan to arrive around ${displayTime(status.suggestedArrivalTime)}.${status.delayMinutes !== null ? ` Dr. Sohaib is approximately ${status.delayMinutes} minutes behind schedule.` : ""}` };
      } catch {
        return { body: "I couldn’t verify that appointment with this WhatsApp number. Please check the ID." };
      }
    }
    return { body: "Please tell me in one message if you want to book, change, or cancel an appointment, get clinic directions, or talk to reception." };
  }

  handle.handleMedia = handleMedia;
  return handle;
}

const handleHybridMessage = createHybridOrchestrator();

module.exports = { WELCOME, HANDOFF, createHybridOrchestrator, handleHybridMessage };
