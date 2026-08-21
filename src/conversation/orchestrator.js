const { DateTime } = require("luxon");
const models = require("../models");
const { config } = require("../config/env");
const { normalizePhone } = require("../utils/security");
const { normalizeTime } = require("../utils/time");
const { createConciergeTools } = require("../services/conciergeTools");
const { understandPatientMessage, emergencyPattern, unsafeMedicalPattern } = require("../services/conciergeUnderstandingService");
const { sendMediaById } = require("../services/whatsappService");
const { tr } = require("./translations");
const {
  buttons,
  list,
  text: replyText,
  languageMessage,
  mainMenu,
  doctorProfileCard,
  clinicInfoCard,
  servicesCard
} = require("./messages");

const reply = {
  text: (body) => ({ kind: "text", body }),
  buttons: (body, btnList) => ({ kind: "buttons", body, buttons: btnList }),
  list: (body, rows, btnText, title) => ({
    kind: "list",
    body,
    buttonText: btnText,
    sections: [{ title: title || "Options", rows }]
  })
};

function normalizeLang(value) {
  return value === "ur" ? "ur" : "en";
}

function resolveDate(value, timezone = config.clinicTimezone) {
  const input = String(value || "").trim().toLowerCase();
  const today = DateTime.now().setZone(timezone).startOf("day");
  const iso = DateTime.fromISO(input, { zone: timezone });
  if (/^\d{4}-\d{2}-\d{2}$/.test(input) && iso.isValid && iso >= today) return iso.toISODate();
  if (/^(today|aaj|aj|آج)$/i.test(input)) return today.toISODate();
  if (/^(tomorrow|kal|کل)$/i.test(input)) return today.plus({ days: 1 }).toISODate();
  const weekdays = {
    monday: 1, mon: 1, پیر: 1,
    tuesday: 2, tue: 2, منگل: 2,
    wednesday: 3, wed: 3, بدھ: 3,
    thursday: 4, thu: 4, جمعرات: 4,
    friday: 5, fri: 5, جمعہ: 5,
    saturday: 6, sat: 6, ہفتہ: 6,
    sunday: 7, sun: 7, اتوار: 7
  };
  if (weekdays[input]) {
    let date = today;
    while (date.weekday !== weekdays[input]) date = date.plus({ days: 1 });
    return date.toISODate();
  }
  return "";
}

function mergeFacts(context, facts) {
  const next = { ...context };
  const fields = {
    patientName: "fullName",
    age: "age",
    concern: "reason",
    clinic: "clinic",
    preferredDate: "preferredDate",
    preferredTime: "preferredTime",
    appointmentId: "appointmentId",
    reportsAvailable: "reportsAvailable",
    patientFor: "patientFor"
  };
  for (const [source, target] of Object.entries(fields)) {
    if (facts[source] !== null && facts[source] !== undefined && facts[source] !== "unknown") {
      next[target] = facts[source];
    }
  }
  if (facts.language) next.language = normalizeLang(facts.language);
  return next;
}

function visitSummaryText(context, lang = "en") {
  const ageStr = Number.isInteger(context.age) ? `, ${context.age} yrs` : "";
  const reportsStr = context.wantsReports ? tr(lang, "summaryReportsYes") : tr(lang, "summaryReportsNo");
  return `*${tr(lang, "summaryTitle")}*\n\n${tr(lang, "summaryPatient")} ${context.fullName}${ageStr}\n${tr(lang, "summaryClinic")} ${context.locationName || "Iqbal Hospital, Bahawalpur"}\n${tr(lang, "summaryDate")} ${context.date}\n${tr(lang, "summaryTime")} ${context.time}\n${tr(lang, "summaryDuration")}\n${tr(lang, "summaryReports")} ${reportsStr}\n\n${tr(lang, "summaryDisclaimer")}`;
}

function createConversationOrchestrator(deps = {}) {
  const d = {
    models: deps.models || models,
    tools: deps.tools || createConciergeTools(deps),
    understand: deps.understand || understandPatientMessage,
    sendMedia: deps.sendMedia || sendMediaById
  };

  async function saveSession(session, state, context = session.context || {}) {
    session.state = state;
    session.context = context;
    session.lastMessageAt = new Date();
    await session.save();
  }

  async function handoff(session, phone, reason, lang = "en") {
    await d.tools.request_staff_handoff({ phone, reason });
    session.aiPaused = true;
    session.humanRequired = true;
    await saveSession(session, "STAFF_HANDOFF", session.context || {});
    return reply.text(tr(lang, "staffHandoffMessage"));
  }

  async function chooseClinic(session, context, lang = "en") {
    const locations = await d.tools.get_clinic_information({});
    const active = locations.filter((item) => item.status === "Active" || item.status === "active" || (item.isActive && item.bookingEnabled));
    const wanted = String(context.clinic || "").toLowerCase();
    const selected = wanted
      ? active.find((item) => [item.code, item.city, item.clinicName].some((val) => String(val || "").toLowerCase().includes(wanted)))
      : active.length === 1 ? active[0] : null;

    if (selected) {
      return {
        ...context,
        locationId: String(selected._id || selected.code),
        locationName: `${selected.clinicName}, ${selected.city}`
      };
    }
    if (!active.length) return null;
    await saveSession(session, "BOOKING_CLINIC", context);
    return reply.buttons(
      tr(lang, "bookStep4Clinic"),
      active.slice(0, 3).map((item) => ({ id: `AI_CLINIC_${item.code}`, title: String(item.clinicName || item.city).slice(0, 20) }))
    );
  }

  async function continueBooking(session, phone, context, messageId, lang = "en") {
    let next = { ...context, phone, language: lang };

    // Step 1: Patient Full Name
    if (!next.fullName) {
      await saveSession(session, "BOOKING_NAME", next);
      return reply.text(tr(lang, "bookStep1Name"));
    }

    // Step 2: Patient Age / Reason
    if (!next.reason) {
      await saveSession(session, "BOOKING_CONCERN", next);
      return reply.text(tr(lang, "bookStep3Concern"));
    }

    // Step 3: Choose Clinic
    const clinic = await chooseClinic(session, next, lang);
    if (!clinic) return handoff(session, phone, "No bookable clinic available", lang);
    if (clinic.body) return clinic;
    next = clinic;

    // Step 4: Choose Date
    next.date = resolveDate(next.preferredDate || next.date);
    if (!next.date) {
      await saveSession(session, "BOOKING_DATE", next);
      const availableDates = await d.tools.get_available_slots ? [] : [];
      return reply.text(tr(lang, "bookStep5Date"));
    }

    // Step 5: Choose Time Slot (20-min slots)
    const slots = await d.tools.get_available_slots({ locationId: next.locationId, date: next.date });
    if (!slots.length) {
      delete next.date;
      delete next.preferredDate;
      await saveSession(session, "BOOKING_DATE", next);
      return reply.text(tr(lang, "noTimesAvailable", { date: context.preferredDate || context.date || "" }) + "\n\n" + tr(lang, "bookStep5Date"));
    }

    const wantedTime = normalizeTime(next.preferredTime || next.time);
    if (wantedTime && slots.some((slot) => slot.time === wantedTime)) {
      return askReports(session, { ...next, time: wantedTime }, lang);
    }

    await saveSession(session, "BOOKING_TIME", { ...next, availableTimes: slots.slice(0, 3).map((slot) => slot.time), messageId });
    return reply.buttons(
      tr(lang, "bookStep6Time", { date: next.date }),
      slots.slice(0, 3).map((slot) => ({ id: `AI_TIME_${slot.time}`, title: `🕒 ${slot.time}` }))
    );
  }

  async function askReports(session, context, lang = "en") {
    await saveSession(session, "BOOKING_REPORTS", context);
    return reply.buttons(tr(lang, "askReportsPrompt"), [
      { id: "AI_REPORTS_YES", title: tr(lang, "btnUploadReports").slice(0, 20) },
      { id: "AI_REPORTS_NO", title: tr(lang, "btnSkipReports").slice(0, 20) }
    ]);
  }

  async function findActiveClinic() {
    const locations = await d.tools.get_clinic_information({});
    return locations.find((item) => item.status === "Active" || item.status === "active" || (item.isActive && item.bookingEnabled));
  }

  return async function handle({ phoneE164, text: rawText = "", language: requestedLanguage = "en", replyId = "", messageId = "", source = "text" }) {
    const phone = normalizePhone(phoneE164) || phoneE164;
    let session = await d.models.ConversationSession.findOne({ phoneE164: phone });
    if (!session) {
      session = await d.models.ConversationSession.create({
        phoneE164: phone,
        language: normalizeLang(requestedLanguage),
        state: "IDLE",
        context: {},
        lastMessageAt: new Date()
      });
    }

    let lang = normalizeLang(session.language || requestedLanguage || "en");

    if (session.aiPaused) {
      return reply.text(tr(lang, "staffHandoffMessage"));
    }

    const input = String(rawText || "").trim();
    const action = String(replyId || input).trim();
    const upper = action.toUpperCase();

    // 1. Language Toggle Actions
    if (upper === "LANG_EN" || upper === "SET_LANG_EN") {
      lang = "en";
      session.language = "en";
      await saveSession(session, "IDLE", { ...session.context, language: "en" });
      return mainMenu("en");
    }
    if (upper === "LANG_UR" || upper === "SET_LANG_UR") {
      lang = "ur";
      session.language = "ur";
      await saveSession(session, "IDLE", { ...session.context, language: "ur" });
      return mainMenu("ur");
    }
    if (upper === "MENU_LANG" || upper === "AI_CHANGE_LANG") {
      return languageMessage();
    }

    // 2. Navigation Actions
    if (upper === "NAV_MAIN_MENU" || upper === "MENU" || upper === "MAIN_MENU" || upper === "HOME") {
      await saveSession(session, "IDLE", { language: lang });
      return mainMenu(lang);
    }

    // 3. NLU Understanding & Safety
    const facts = await d.understand(input || action, { context: session.context || {}, phone });
    if (facts.language && !session.context?.language) {
      lang = normalizeLang(facts.language);
      session.language = lang;
    }
    session.lastAiIntent = facts.intent;
    session.lastAiConfidence = facts.confidence;

    // Safety: Emergency Detection
    if (emergencyPattern.test(input) || facts.intent === "emergency") {
      await saveSession(session, "EMERGENCY_STOP", { language: lang });
      if (d.models.EmergencyAlert) {
        await d.models.EmergencyAlert.create({
          phoneE164: phone,
          conversation: session._id,
          alertMessage: "Emergency language detected; automated clinical conversation stopped.",
          priority: "critical",
          status: "open"
        }).catch(() => undefined);
      }
      return reply.text(tr(lang, "emergencyNotice"));
    }

    // Safety: Unsafe Medical Advice / Diagnosis Interception
    if (unsafeMedicalPattern.test(input)) {
      return handoff(session, phone, "Medical advice or report interpretation request", lang);
    }

    // Greetings
    const greetingOnly = /^(hi|hello|hey|salam|assalam(?:-o-alaikum)?|aoa|start|menu)[!.\s]*$/i.test(input);
    if (greetingOnly || (facts.intent === "greeting" && input.split(/\s+/).length <= 3 && session.state === "IDLE")) {
      await saveSession(session, "IDLE", { language: lang });
      return mainMenu(lang);
    }

    // Prototype Menu Item Actions
    if (upper === "MENU_ABOUT" || facts.intent === "about_doctor") {
      return doctorProfileCard(lang);
    }
    if (upper === "MENU_CLINIC" || facts.intent === "clinic_info" || upper === "AI_DIRECTIONS") {
      return clinicInfoCard(lang);
    }
    if (upper === "MENU_SERVICES" || facts.intent === "services") {
      return servicesCard(lang);
    }
    if (upper === "MENU_ASSESS") {
      await saveSession(session, "BOOKING_CONCERN", { language: lang });
      return reply.text(tr(lang, "assessmentPrompt"));
    }
    if (upper === "MENU_UPLOAD") {
      return reply.text(tr(lang, "attachReportInstruction"));
    }
    if (upper === "MENU_STAFF" || facts.intent === "staff_handoff" || upper === "AI_TALK_RECEPTION") {
      return handoff(session, phone, "Patient requested reception team", lang);
    }

    // Report Handshake
    if (upper === "AI_REPORTS_ADD" && session.state === "AWAITING_REPORT") {
      return reply.text(tr(lang, "attachReportInstruction"));
    }
    if (upper === "AI_REPORTS_DONE" && session.state === "AWAITING_REPORT") {
      await saveSession(session, "IDLE", { language: lang, appointmentId: session.context.appointmentId });
      return reply.buttons(tr(lang, "reportAttachedSuccess"), [
        { id: "NAV_MAIN_MENU", title: tr(lang, "btnMainMenu").slice(0, 20) },
        { id: "MENU_STAFF", title: tr(lang, "menuStaff").slice(0, 20) }
      ]);
    }

    // Booking Flow State Machine
    if (upper === "MENU_BOOK" || upper === "START_BOOKING") {
      const freshContext = { phone, language: lang };
      await saveSession(session, "BOOKING_NAME", freshContext);
      return reply.text(tr(lang, "bookStep1Name"));
    }

    if (upper.startsWith("AI_CLINIC_") && session.state === "BOOKING_CLINIC") {
      const locations = await d.tools.get_clinic_information({});
      const selected = locations.find((item) => item.code === action.slice("AI_CLINIC_".length));
      if (!selected) return reply.text(tr(lang, "bookStep4Clinic"));
      return continueBooking(session, phone, { ...session.context, locationId: String(selected._id || selected.code), locationName: `${selected.clinicName}, ${selected.city}` }, messageId, lang);
    }

    if (upper.startsWith("AI_TIME_") && session.state === "BOOKING_TIME") {
      const time = action.slice("AI_TIME_".length).replace(/^🕒\s*/, "").trim();
      if (!(session.context.availableTimes || []).includes(time)) {
        return reply.text(tr(lang, "bookStep6Time", { date: session.context.date }));
      }
      const context = { ...session.context, time };
      delete context.availableTimes;
      return askReports(session, context, lang);
    }

    if (["AI_REPORTS_YES", "AI_REPORTS_NO"].includes(upper) && session.state === "BOOKING_REPORTS") {
      const context = {
        ...session.context,
        wantsReports: upper === "AI_REPORTS_YES",
        summarySource: source === "voice" ? "whatsapp_voice" : "whatsapp_text"
      };
      await saveSession(session, "BOOKING_SUMMARY", context);
      return reply.buttons(
        `${visitSummaryText(context, lang)}\n\n${tr(lang, "summaryConfirmPrompt")}`,
        [
          { id: "AI_SUMMARY_OK", title: tr(lang, "btnSummaryOk").slice(0, 20) },
          { id: "AI_SUMMARY_CHANGE", title: tr(lang, "btnSummaryChange").slice(0, 20) }
        ]
      );
    }

    if (upper === "AI_SUMMARY_CHANGE" && session.state === "BOOKING_SUMMARY") {
      await saveSession(session, "BOOKING_CHANGE", session.context);
      return reply.text(tr(lang, "bookStep3Concern"));
    }

    if (upper === "AI_SUMMARY_OK" && session.state === "BOOKING_SUMMARY") {
      await saveSession(session, "BOOKING_CONSENT", { ...session.context, summaryApprovedAt: new Date().toISOString() });
      return reply.buttons(
        tr(lang, "consentPrompt", { consentText: config.appointmentConsent.text }),
        [
          { id: "AI_CONSENT_YES", title: tr(lang, "btnConsentYes").slice(0, 20) },
          { id: "AI_CONSENT_NO", title: tr(lang, "btnConsentNo").slice(0, 20) }
        ]
      );
    }

    if (upper === "AI_CONSENT_NO" && session.state === "BOOKING_CONSENT") {
      await saveSession(session, "IDLE", { language: lang });
      return reply.buttons(tr(lang, "consentDeclined"), [
        { id: "NAV_MAIN_MENU", title: tr(lang, "btnMainMenu").slice(0, 20) },
        { id: "MENU_BOOK", title: tr(lang, "menuBook").slice(0, 20) }
      ]);
    }

    if (upper === "AI_CONSENT_YES" && session.state === "BOOKING_CONSENT") {
      await saveSession(session, "BOOKING_CONFIRM", { ...session.context, consentGiven: true });
      return reply.buttons(
        `Please confirm ${session.context.fullName} on ${session.context.date} at ${session.context.time}, ${session.context.locationName || "Iqbal Hospital, Bahawalpur"}.`,
        [
          { id: "AI_BOOK_CONFIRM", title: tr(lang, "btnSummaryOk").slice(0, 20) },
          { id: "AI_BOOK_TIME", title: tr(lang, "btnSummaryChange").slice(0, 20) }
        ]
      );
    }

    if (upper === "AI_BOOK_TIME" && session.state === "BOOKING_CONFIRM") {
      const context = { ...session.context };
      delete context.time;
      delete context.preferredTime;
      return continueBooking(session, phone, context, messageId, lang);
    }

    if (upper === "AI_BOOK_CONFIRM" && session.state === "BOOKING_CONFIRM") {
      const context = session.context;
      try {
        const appointment = await d.tools.create_appointment({
          confirmed: true,
          fullName: context.fullName,
          phone,
          ...(Number.isInteger(context.age) ? { age: context.age } : {}),
          patientFor: context.patientFor || "unknown",
          reason: context.reason || "General Consultation",
          locationId: context.locationId || "BWP",
          date: context.date,
          time: context.time,
          consentGiven: true,
          preferredLanguage: lang === "ur" ? "ur" : "en",
          idempotencyKey: messageId || `wa:${phone}:${context.date}:${context.time}`
        });

        appointment.patientProvidedVisitSummary = {
          patientName: context.fullName,
          ...(Number.isInteger(context.age) ? { age: context.age } : {}),
          concern: context.reason,
          reportsAttached: 0,
          disclaimer: "Patient-provided information only — formal clinical evaluation during in-person visit.",
          approvedAt: new Date(context.summaryApprovedAt || Date.now()),
          source: context.summarySource || "whatsapp_text"
        };
        await appointment.save();

        // Optional welcome video/audio
        if (config.aiConcierge.doctorWelcomeMediaId && d.models.Appointment?.countDocuments) {
          const patientAppointments = await d.models.Appointment.countDocuments({ patient: appointment.patient });
          if (patientAppointments === 1) {
            const mediaType = config.aiConcierge.doctorWelcomeMediaId.startsWith("video:") ? "video" : "audio";
            const mediaId = config.aiConcierge.doctorWelcomeMediaId.replace(/^(?:audio|video):/, "");
            const sent = await d.sendMedia(phone, mediaType, mediaId, "Welcome from Dr. Shoaib").catch(() => null);
            if (["accepted", "queued", "sent"].includes(sent?.status)) {
              appointment.doctorWelcomeSentAt = new Date();
              await appointment.save();
            }
          }
        }

        await saveSession(session, context.wantsReports ? "AWAITING_REPORT" : "IDLE", {
          language: lang,
          appointmentId: appointment.appointmentId,
          wantsReports: context.wantsReports
        });

        const confirmMsg = tr(lang, "confirmedBody", {
          name: context.fullName,
          date: context.date,
          time: context.time,
          token: appointment.tokenNumber,
          id: appointment.appointmentId
        }) + (context.wantsReports ? `\n\n${tr(lang, "attachReportInstruction")}` : "");

        return reply.buttons(confirmMsg, [
          { id: "MENU_CLINIC", title: tr(lang, "btnDirections").slice(0, 20) },
          { id: "MENU_CHECK", title: tr(lang, "btnChangeAppointment").slice(0, 20) },
          { id: "MENU_STAFF", title: tr(lang, "btnContactStaff").slice(0, 20) }
        ]);
      } catch (error) {
        return reply.buttons(
          error?.statusCode ? `${error.message}` : tr(lang, "errorGeneric"),
          [
            { id: "MENU_BOOK", title: tr(lang, "menuBook").slice(0, 20) },
            { id: "MENU_STAFF", title: tr(lang, "menuStaff").slice(0, 20) }
          ]
        );
      }
    }

    // Reschedule Flow
    if (upper === "MENU_RESCHEDULE" || facts.intent === "reschedule" || session.state.startsWith("RESCHEDULE_")) {
      let context = mergeFacts(session.context || {}, facts);
      if (session.state === "RESCHEDULE_ID" && !context.appointmentId) {
        context.appointmentId = input.toUpperCase();
      }
      if (!context.appointmentId) {
        await saveSession(session, "RESCHEDULE_ID", context);
        return reply.text(tr(lang, "reschedulePrompt"));
      }

      let appt;
      try {
        appt = await d.tools.lookup_verified_appointment({ appointmentId: context.appointmentId, phone });
      } catch {
        return reply.buttons(tr(lang, "lookupNotFound"), [
          { id: "NAV_MAIN_MENU", title: tr(lang, "btnMainMenu").slice(0, 20) },
          { id: "MENU_STAFF", title: tr(lang, "menuStaff").slice(0, 20) }
        ]);
      }

      context.date = resolveDate(context.preferredDate || context.date);
      if (!context.date) {
        await saveSession(session, "RESCHEDULE_DATE", context);
        return reply.text(tr(lang, "rescheduleDatePrompt"));
      }

      const location = await findActiveClinic();
      if (!location) return handoff(session, phone, "No clinic available for rescheduling", lang);
      context.locationId = String(location._id || location.code);

      const slots = await d.tools.get_available_slots({ locationId: context.locationId, date: context.date });
      const wanted = normalizeTime(context.preferredTime || context.time);

      if (upper.startsWith("AI_RESCHEDULE_TIME_") && session.state === "RESCHEDULE_TIME") {
        const selectedTime = action.slice("AI_RESCHEDULE_TIME_".length).replace(/^🕒\s*/, "").trim();
        context.time = selectedTime;
        delete context.availableTimes;
        await saveSession(session, "RESCHEDULE_CONFIRM", context);
        return reply.buttons(
          tr(lang, "rescheduleConfirmPrompt", { id: context.appointmentId, date: context.date, time: selectedTime }),
          [
            { id: "AI_RESCHEDULE_CONFIRM", title: tr(lang, "btnRescheduleConfirm").slice(0, 20) },
            { id: "AI_RESCHEDULE_STOP", title: tr(lang, "btnRescheduleKeep").slice(0, 20) }
          ]
        );
      }

      if (upper === "AI_RESCHEDULE_STOP" && session.state === "RESCHEDULE_CONFIRM") {
        await saveSession(session, "IDLE", { language: lang });
        return reply.text(tr(lang, "rescheduleKept"));
      }

      if (upper === "AI_RESCHEDULE_CONFIRM" && session.state === "RESCHEDULE_CONFIRM") {
        const appointment = await d.tools.reschedule_appointment({
          confirmed: true,
          appointmentId: context.appointmentId,
          phone,
          locationId: context.locationId,
          date: context.date,
          time: context.time
        });
        await saveSession(session, "IDLE", { language: lang });
        return reply.buttons(
          tr(lang, "rescheduleSuccess", { id: appointment.appointmentId, date: appointment.date, time: appointment.time, token: appointment.tokenNumber }),
          [
            { id: "NAV_MAIN_MENU", title: tr(lang, "btnMainMenu").slice(0, 20) },
            { id: "MENU_CLINIC", title: tr(lang, "btnDirections").slice(0, 20) }
          ]
        );
      }

      if (!wanted || !slots.some((slot) => slot.time === wanted)) {
        await saveSession(session, "RESCHEDULE_TIME", { ...context, availableTimes: slots.slice(0, 3).map((slot) => slot.time) });
        if (!slots.length) return reply.text(tr(lang, "noTimesAvailable", { date: context.date }));
        return reply.buttons(
          tr(lang, "rescheduleTimePrompt", { date: context.date }),
          slots.slice(0, 3).map((slot) => ({ id: `AI_RESCHEDULE_TIME_${slot.time}`, title: `🕒 ${slot.time}` }))
        );
      }

      context.time = wanted;
      await saveSession(session, "RESCHEDULE_CONFIRM", context);
      return reply.buttons(
        tr(lang, "rescheduleConfirmPrompt", { id: context.appointmentId, date: context.date, time: wanted }),
        [
          { id: "AI_RESCHEDULE_CONFIRM", title: tr(lang, "btnRescheduleConfirm").slice(0, 20) },
          { id: "AI_RESCHEDULE_STOP", title: tr(lang, "btnRescheduleKeep").slice(0, 20) }
        ]
      );
    }

    // Cancel Flow
    if (upper === "MENU_CANCEL" || facts.intent === "cancel" || session.state.startsWith("CANCEL_")) {
      const appointmentId = facts.appointmentId || (session.state === "CANCEL_ID" ? input.toUpperCase() : null);
      if (!appointmentId) {
        await saveSession(session, "CANCEL_ID", { language: lang });
        return reply.text(tr(lang, "cancelPrompt"));
      }

      let appt;
      try {
        appt = await d.tools.lookup_verified_appointment({ appointmentId, phone });
      } catch {
        return reply.buttons(tr(lang, "lookupNotFound"), [
          { id: "NAV_MAIN_MENU", title: tr(lang, "btnMainMenu").slice(0, 20) },
          { id: "MENU_STAFF", title: tr(lang, "menuStaff").slice(0, 20) }
        ]);
      }

      if (upper === "AI_CANCEL_KEEP" && session.state === "CANCEL_CONFIRM") {
        await saveSession(session, "IDLE", { language: lang });
        return reply.text(tr(lang, "cancelKept"));
      }

      if (upper === "AI_CANCEL_CONFIRM" && session.state === "CANCEL_CONFIRM") {
        const appointment = await d.tools.cancel_appointment({ confirmed: true, appointmentId: session.context.appointmentId, phone });
        await saveSession(session, "IDLE", { language: lang });
        return reply.buttons(
          tr(lang, "cancelSuccess", { id: appointment.appointmentId }),
          [
            { id: "NAV_MAIN_MENU", title: tr(lang, "btnMainMenu").slice(0, 20) },
            { id: "MENU_BOOK", title: tr(lang, "menuBook").slice(0, 20) }
          ]
        );
      }

      await saveSession(session, "CANCEL_CONFIRM", { language: lang, appointmentId });
      return reply.buttons(
        tr(lang, "cancelConfirmPrompt", { id: appointmentId, date: appt.date, time: appt.time }),
        [
          { id: "AI_CANCEL_CONFIRM", title: tr(lang, "btnCancelConfirm").slice(0, 20) },
          { id: "AI_CANCEL_KEEP", title: tr(lang, "btnCancelKeep").slice(0, 20) }
        ]
      );
    }

    // Lookup / Check Appointment Flow
    if (upper === "MENU_CHECK" || session.state === "STATUS_ID" || facts.intent === "visit_status" || facts.intent === "lookup") {
      const appointmentId = facts.appointmentId || (session.state === "STATUS_ID" ? input.toUpperCase() : null);
      if (!appointmentId) {
        await saveSession(session, "STATUS_ID", { language: lang });
        return reply.text(tr(lang, "lookupPrompt"));
      }
      try {
        const status = await d.tools.get_visit_status({ appointmentId, phone });
        await saveSession(session, "IDLE", { language: lang });
        return reply.buttons(
          tr(lang, "lookupSuccess", {
            id: status.appointmentId,
            token: status.tokenNumber,
            name: session.context.fullName || "Patient",
            date: status.date,
            time: status.time,
            clinic: "Iqbal Hospital, Bahawalpur",
            status: status.status
          }),
          [
            { id: "MENU_RESCHEDULE", title: tr(lang, "menuReschedule").slice(0, 20) },
            { id: "MENU_CANCEL", title: tr(lang, "menuCancel").slice(0, 20) },
            { id: "NAV_MAIN_MENU", title: tr(lang, "btnMainMenu").slice(0, 20) }
          ]
        );
      } catch {
        return reply.buttons(tr(lang, "lookupNotFound"), [
          { id: "NAV_MAIN_MENU", title: tr(lang, "btnMainMenu").slice(0, 20) },
          { id: "MENU_STAFF", title: tr(lang, "menuStaff").slice(0, 20) }
        ]);
      }
    }

    // Active Booking Sub-states (Handling typed inputs)
    const bookingState = session.state.startsWith("BOOKING_");
    if (facts.intent === "book" || bookingState) {
      let context = mergeFacts(session.context || { language: lang }, facts);
      if (session.state === "BOOKING_NAME" && !context.fullName && input.length >= 2) {
        context.fullName = input.slice(0, 160);
      }
      if (session.state === "BOOKING_CONCERN" && !context.reason && input.length >= 2) {
        context.reason = input.slice(0, 500);
      }
      if (session.state === "BOOKING_DATE" && !context.preferredDate) {
        context.preferredDate = input;
      }
      return continueBooking(session, phone, context, messageId, lang);
    }

    // Smart Fallback
    return reply.buttons(tr(lang, "fallbackText"), [
      { id: "NAV_MAIN_MENU", title: tr(lang, "btnMainMenu").slice(0, 20) },
      { id: "MENU_BOOK", title: tr(lang, "menuBook").slice(0, 20) },
      { id: "MENU_STAFF", title: tr(lang, "menuStaff").slice(0, 20) }
    ]);
  };
}

module.exports = {
  createConversationOrchestrator,
  handleIncomingMessage: createConversationOrchestrator(),
  resolveDate,
  mergeFacts,
  visitSummaryText
};
