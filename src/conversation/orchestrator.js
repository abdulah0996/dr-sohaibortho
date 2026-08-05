const { DateTime } = require("luxon");
const models = require("../models");
const appointmentService = require("../services/appointmentService");
const availabilityService = require("../services/availabilityService");
const locationService = require("../services/locationService");
const { normalizePhone } = require("../utils/security");
const { tr } = require("./translations");
const msg = require("./messages");

const ACTIVE_STATUSES = [
  "pending",
  "confirmed",
  "patient_confirmed",
  "arrived",
  "in_consultation",
  "rescheduled",
  "waiting_for_earlier_slot",
  "scheduled"
];

const consultationReasons = [
  "General Consultation",
  "Joint & Bone Pain",
  "Knee Joint Assessment",
  "Back / Spine Pain",
  "Shoulder Stiffness & Pain",
  "Sports Injury & Ligament Strain",
  "Trauma / Fracture Check",
  "Post-Operation Follow-up",
  "Medical Report Review",
  "Prefer not to say"
];

function createConversationOrchestrator(deps = {}) {
  const d = { models, appointmentService, availabilityService, locationService, ...deps };

  async function save(session, state, context = session.context || {}) {
    session.state = state;
    session.context = context;
    await session.save();
  }

  async function activeAppointmentsFor(phone) {
    return d.models.Appointment.find({
      phoneE164: phone,
      status: { $in: ACTIVE_STATUSES }
    }).sort({ date: 1, time: 1 });
  }

  return async function handle({ phoneE164, text = "", language = "en" }) {
    const phone = normalizePhone(phoneE164) || phoneE164;
    let session = await d.models.ConversationSession.findOne({ phoneE164: phone });

    if (!session) {
      session = await d.models.ConversationSession.create({
        phoneE164: phone,
        language: language || "en",
        state: "MAIN_MENU",
        lastMessageAt: new Date()
      });
    }

    if (session.aiPaused) {
      return { body: "You are currently connected with Dr. Sohaib's clinic staff. An assistant will reply shortly." };
    }

    const input = String(text).trim();
    const lang = session.language || "en";

    // Emergency check
    if (/\b(emergency|urgent|accident|severe pain|bleeding|injury|ایمرجنسی|ہنگامی)\b/i.test(input)) {
      await d.models.EmergencyAlert.create({
        phoneE164: phone,
        patient: session.patient || null,
        conversation: session._id,
        alertMessage: input,
        priority: "critical",
        status: "open"
      });

      return {
        body: tr(lang, "emergency") + "\n\nDr. Sohaib Clinic Hotline: +92 300 1234567"
      };
    }

    // Command matching
    if (/^(1|book|اپوائنٹمنٹ|بوک)$/i.test(input)) {
      await save(session, "BOOKING_NAME", {});
      return { body: tr(lang, "name") };
    }

    if (/^(2|manage|مینیج)$/i.test(input)) {
      const appointments = await activeAppointmentsFor(phone);
      if (!appointments.length) {
        return { body: tr(lang, "noAppointment") };
      }
      const appt = appointments[0];
      return {
        body: `Dr. Sohaib Active Appointment:\n\nID: ${appt.appointmentId}\nToken: ${appt.tokenNumber}\nDate: ${appt.date}\nTime: ${appt.time}\nStatus: ${appt.status}\nLocation: ${appt.locationSnapshot.clinicName}, ${appt.locationSnapshot.city}\n\nOptions:\n- Type "Cancel" to cancel\n- Type "Reschedule" to change date/time`
      };
    }

    if (/^(3|clinic|location|ہسپتال|مقام)$/i.test(input)) {
      return {
        body: "Dr. Sohaib Clinic Locations:\n\n1. Active Clinic: Iqbal Hospital, Noor Mahal Road, Bahawalpur\nConsultation Days: Monday to Thursday (4:30 PM to 8:30 PM)\nPhone: +92 300 1234567\n\n2. Bahawalnagar — Coming Soon\n3. Rahim Yar Khan — Coming Soon"
      };
    }

    if (/^(4|doctor|profile|ڈاکٹر)$/i.test(input)) {
      return {
        body: "Dr. Sohaib Profile:\n\nSpecialist Physician & Surgeon\nLocation: Iqbal Hospital, Noor Mahal Road, Bahawalpur\nConsultation Hours: Monday to Thursday, 4:30 PM to 8:30 PM\nDedicated to comprehensive patient care."
      };
    }

    if (/^(5|report|upload|رپورٹ)$/i.test(input)) {
      return {
        body: "Medical Report Upload:\n\nYou can upload X-Rays, MRIs, Blood Tests, or Prescriptions directly through our patient portal interface for Dr. Sohaib to review."
      };
    }

    if (/^(6|staff|human|انسان|عملہ)$/i.test(input)) {
      session.humanRequired = true;
      session.aiPaused = true;
      await save(session, "STAFF_HANDOVER", {});
      return { body: tr(lang, "staff") };
    }

    // Step-by-step booking state handler
    if (session.state === "BOOKING_NAME") {
      if (input.length < 2) return { body: tr(lang, "invalidName") };
      await save(session, "BOOKING_REASON", { fullName: input });
      return {
        body: tr(lang, "reason") + "\n\n1. Joint & Bone Pain\n2. Knee Joint Assessment\n3. Back / Spine Pain\n4. Shoulder Stiffness\n5. Sports Injury\n6. Follow-up\n\nReply with a number (1-6) or type your reason."
      };
    }

    if (session.state === "BOOKING_REASON") {
      let reason = input;
      const idx = parseInt(input);
      if (!isNaN(idx) && consultationReasons[idx - 1]) {
        reason = consultationReasons[idx - 1];
      }
      await save(session, "BOOKING_DATE", { ...session.context, reason });
      return {
        body: tr(lang, "date") + "\n\nAvailable Days: Monday to Thursday\nPlease type your preferred date in YYYY-MM-DD format (e.g., 2026-08-03)."
      };
    }

    if (session.state === "BOOKING_DATE") {
      const dateMatch = input.match(/^\d{4}-\d{2}-\d{2}$/);
      if (!dateMatch) {
        return { body: "Please enter a valid date in YYYY-MM-DD format (e.g. 2026-08-03)." };
      }
      await save(session, "BOOKING_TIME", { ...session.context, date: input });
      return {
        body: tr(lang, "time") + "\n\nAvailable Hours: 16:30 to 20:30 (4:30 PM to 8:30 PM)\nExamples: 16:30, 17:00, 17:30, 18:00, 18:30, 19:00, 19:30, 20:00"
      };
    }

    if (session.state === "BOOKING_TIME") {
      const time = input;
      try {
        const appointment = await d.appointmentService.createAppointment({
          fullName: session.context.fullName,
          phone: phone,
          reason: session.context.reason || "General Consultation",
          date: session.context.date,
          time: time,
          locationId: "BWP",
          consentGiven: true,
          preferredLanguage: lang
        }, { source: "whatsapp" });

        await save(session, "MAIN_MENU", {});

        return {
          body: `Appointment Confirmed!\n\nPatient: ${appointment.patientSnapshot.fullName}\nDoctor: Dr. Sohaib\nHospital: Iqbal Hospital, Noor Mahal Road, Bahawalpur\nAppointment ID: ${appointment.appointmentId}\nToken: ${appointment.tokenNumber}\nDate: ${appointment.date}\nTime: ${appointment.time}\nStatus: ${appointment.status}\n\nThank you for choosing Dr. Sohaib's Clinic!`
        };
      } catch (err) {
        return { body: `Booking error: ${err.message}. Please try again or select another time.` };
      }
    }

    // Default welcome message response
    await save(session, "MAIN_MENU", {});
    return {
      body: tr(lang, "welcome") + "\n\n1. Book Appointment\n2. Manage Appointment\n3. Clinic Locations\n4. Dr. Sohaib Profile\n5. Upload Medical Report\n6. Speak to Staff / Emergency\n\nReply with a number (1-6) or type your request."
    };
  };
}

module.exports = { createConversationOrchestrator, handleIncomingMessage: createConversationOrchestrator() };
