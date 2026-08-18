const { z } = require("zod");
const models = require("../models");
const appointmentService = require("../services/appointmentService");
const availabilityService = require("../services/availabilityService");
const locationService = require("../services/locationService");
const settingsService = require("../services/settingsService");
const { OCCUPYING_APPOINTMENT_STATUSES } = require("../domain/appointmentRules");

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^\d{2}:\d{2}$/);
const appointmentId = z.string().regex(/^DS-20\d{2}-\d{4,}$/i);

const TOOL_SCHEMAS = Object.freeze({
  get_available_slots: {
    input: z.object({ locationId: z.string().min(2).max(80), date }).strict(),
    output: z.object({ location: z.object({ code: z.string(), clinicName: z.string(), city: z.string() }), date, slots: z.array(z.object({ time, available: z.boolean() })) }).strict()
  },
  create_appointment: {
    input: z.object({
      fullName: z.string().min(2).max(160), age: z.number().int().min(0).max(130).optional(),
      reason: z.string().min(2).max(1000), locationId: z.string().min(2).max(80), date, time,
      language: z.enum(["en", "ur"]).default("en"), relationship: z.string().min(2).max(40).default("self"),
      consentGiven: z.literal(true), explicitConfirmation: z.literal(true), summaryApproved: z.literal(true),
      reportsAttached: z.number().int().min(0).max(50).default(0), existingCondition: z.string().max(500).optional()
    }).strict(),
    output: z.object({ appointmentId: z.string(), tokenNumber: z.string(), fullName: z.string(), date, time, clinicName: z.string(), city: z.string(), reportsAttached: z.number().int() }).strict()
  },
  lookup_verified_appointment: {
    input: z.object({ appointmentId }).strict(),
    output: z.object({ appointmentId: z.string(), date, time, status: z.string(), clinicCode: z.string(), clinicName: z.string() }).strict()
  },
  reschedule_appointment: {
    input: z.object({ appointmentId, locationId: z.string().min(2).max(80), date, time, explicitConfirmation: z.literal(true) }).strict(),
    output: z.object({ appointmentId: z.string(), date, time, status: z.string(), clinicName: z.string() }).strict()
  },
  cancel_appointment: {
    input: z.object({ appointmentId, explicitConfirmation: z.literal(true) }).strict(),
    output: z.object({ appointmentId: z.string(), status: z.literal("cancelled") }).strict()
  },
  get_clinic_information: {
    input: z.object({ locationId: z.string().min(2).max(80).optional() }).strict(),
    output: z.object({ locations: z.array(z.object({ code: z.string(), clinicName: z.string(), city: z.string(), address: z.string(), contactNumber: z.string(), status: z.string() })) }).strict()
  },
  get_visit_status: {
    input: z.object({ appointmentId }).strict(),
    output: z.object({ appointmentId: z.string(), status: z.string(), date, time, tokenNumber: z.string(), appointmentsAhead: z.number().int().min(0), delayMinutes: z.number().int().min(0).nullable(), suggestedArrivalTime: time }).strict()
  },
  request_staff_handoff: {
    input: z.object({ reason: z.enum(["patient_request", "low_confidence", "unsupported", "medical_safety", "provider_failure"]) }).strict(),
    output: z.object({ paused: z.literal(true) }).strict()
  }
});

function publicLocation(location) {
  return {
    code: location.code,
    clinicName: location.clinicName,
    city: location.city,
    address: location.fullAddress,
    contactNumber: location.contactNumber || "",
    status: location.status
  };
}

function addMinutes(value, minutes) {
  const [hour, minute] = value.split(":").map(Number);
  const total = (hour * 60 + minute + minutes + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function createConversationTools(deps = {}) {
  const d = { models, appointmentService, availabilityService, locationService, settingsService, ...deps };

  const handlers = {
    async get_available_slots(input) {
      const location = await d.locationService.getBookableLocation(input.locationId);
      const slots = await d.availabilityService.getAvailableSlots(location._id, input.date);
      return { location: { code: location.code, clinicName: location.clinicName, city: location.city }, date: input.date, slots: slots.map(({ time: slotTime, available }) => ({ time: slotTime, available })) };
    },

    async create_appointment(input, context) {
      const appointment = await d.appointmentService.createAppointment({
        fullName: input.fullName,
        age: input.age,
        phone: context.phoneE164,
        reason: input.reason,
        locationId: input.locationId,
        date: input.date,
        time: input.time,
        preferredLanguage: input.language,
        isFamilyMember: input.relationship !== "self",
        consentGiven: true,
        visitSummary: {
          patientName: input.fullName,
          age: input.age,
          concern: input.reason,
          existingCondition: input.existingCondition,
          reportsAttached: input.reportsAttached,
          approvedAt: new Date()
        }
      }, { source: "whatsapp", idempotencyKey: context.idempotencyKey, skipNotification: true });

      if (input.relationship !== "self") {
        await d.models.FamilyProfile.findOneAndUpdate(
          { contactPatient: appointment.patient, normalizedName: input.fullName.trim().toLowerCase() },
          { $set: { relationship: input.relationship, fullName: input.fullName, age: input.age, verifiedAt: new Date() } },
          { upsert: true, new: true, runValidators: true }
        );
      }
      return {
        appointmentId: appointment.appointmentId,
        tokenNumber: appointment.tokenNumber,
        fullName: appointment.patientSnapshot.fullName,
        date: appointment.date,
        time: appointment.time,
        clinicName: appointment.locationSnapshot.clinicName,
        city: appointment.locationSnapshot.city || "",
        reportsAttached: input.reportsAttached
      };
    },

    async lookup_verified_appointment(input, context) {
      const appointment = await d.appointmentService.lookupAppointment({ appointmentId: input.appointmentId, phone: context.phoneE164 });
      if (context.session) {
        context.session.identityVerifiedAt = new Date();
        context.session.patient = appointment.patient?._id || appointment.patient;
        await context.session.save();
      }
      return {
        appointmentId: appointment.appointmentId,
        date: appointment.date,
        time: appointment.time,
        status: appointment.status,
        clinicCode: appointment.locationSnapshot?.code || "",
        clinicName: appointment.locationSnapshot?.clinicName || "Dr. Sohaib Clinic"
      };
    },

    async reschedule_appointment(input, context) {
      const appointment = await d.appointmentService.rescheduleAppointment({
        appointmentId: input.appointmentId, phone: context.phoneE164, locationId: input.locationId,
        date: input.date, time: input.time, reason: "Patient-confirmed WhatsApp reschedule"
      }, { source: "whatsapp", skipNotification: true });
      return { appointmentId: appointment.appointmentId, date: appointment.date, time: appointment.time, status: appointment.status, clinicName: appointment.locationSnapshot.clinicName };
    },

    async cancel_appointment(input, context) {
      const appointment = await d.appointmentService.cancelAppointment({
        appointmentId: input.appointmentId, phone: context.phoneE164, reason: "Patient-confirmed WhatsApp cancellation"
      }, { source: "whatsapp", skipNotification: true });
      return { appointmentId: appointment.appointmentId, status: appointment.status };
    },

    async get_clinic_information(input) {
      const locations = input.locationId
        ? [await d.locationService.getLocation(input.locationId)]
        : await d.locationService.listLocations();
      return { locations: locations.map(publicLocation) };
    },

    async get_visit_status(input, context) {
      const appointment = await d.appointmentService.lookupAppointment({ appointmentId: input.appointmentId, phone: context.phoneE164 });
      const settings = await d.settingsService.getClinicSettings();
      const appointmentsAhead = await d.models.Appointment.countDocuments({
        location: appointment.location,
        date: appointment.date,
        time: { $lt: appointment.time },
        status: { $in: OCCUPYING_APPOINTMENT_STATUSES }
      });
      const delayMinutes = settings.delayEffectiveDate === appointment.date && Number.isInteger(settings.currentDelayMinutes)
        ? settings.currentDelayMinutes
        : null;
      const lead = Number(settings.arrivalLeadMinutes ?? 15);
      return {
        appointmentId: appointment.appointmentId,
        status: appointment.status,
        date: appointment.date,
        time: appointment.time,
        tokenNumber: appointment.tokenNumber,
        appointmentsAhead,
        delayMinutes,
        suggestedArrivalTime: addMinutes(appointment.time, (delayMinutes || 0) - lead)
      };
    },

    async request_staff_handoff(input, context) {
      if (!context.session) throw new Error("Conversation session is required for handoff.");
      context.session.aiPaused = true;
      context.session.humanRequired = true;
      context.session.state = "STAFF_HANDOVER";
      context.session.context = { handoffReason: input.reason };
      context.session.lastMessageAt = new Date();
      await context.session.save();
      return { paused: true };
    }
  };

  return {
    schemas: TOOL_SCHEMAS,
    async execute(name, input, context = {}) {
      const contract = TOOL_SCHEMAS[name];
      const handler = handlers[name];
      if (!contract || !handler) throw new Error("Unsupported conversation tool.");
      const validatedInput = contract.input.parse(input);
      return contract.output.parse(await handler(validatedInput, context));
    }
  };
}

module.exports = { TOOL_SCHEMAS, createConversationTools };
