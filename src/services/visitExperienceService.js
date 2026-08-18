const { Appointment, Patient } = require("../models");
const { config } = require("../config/env");
const { OCCUPYING_APPOINTMENT_STATUSES } = require("../domain/appointmentRules");
const { getClinicSettings } = require("./settingsService");
const { sendMedia, sendTemplate } = require("./whatsappService");

function shiftTime(value, minutes) {
  const [hour, minute] = String(value).split(":").map(Number);
  const total = (hour * 60 + minute + minutes + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

async function buildSmartArrival(appointment) {
  const settings = await getClinicSettings();
  const appointmentsAhead = await Appointment.countDocuments({
    location: appointment.location,
    date: appointment.date,
    time: { $lt: appointment.time },
    status: { $in: OCCUPYING_APPOINTMENT_STATUSES }
  });
  const delayMinutes = settings.delayEffectiveDate === appointment.date && Number.isInteger(settings.currentDelayMinutes)
    ? settings.currentDelayMinutes
    : null;
  const suggestedArrivalTime = shiftTime(appointment.time, (delayMinutes || 0) - Number(settings.arrivalLeadMinutes ?? 15));
  const message = delayMinutes
    ? `Dr. Sohaib is approximately ${delayMinutes} minutes behind schedule. You may arrive around ${suggestedArrivalTime} instead of waiting at the clinic.`
    : `Your appointment is approaching. Please plan to arrive around ${suggestedArrivalTime}.`;
  return { message, appointmentsAhead, delayMinutes, suggestedArrivalTime };
}

async function sendSmartArrival(appointment) {
  if (!config.whatsapp.templates.smartArrival) return { status: "not_configured" };
  const arrival = await buildSmartArrival(appointment);
  return sendTemplate(
    appointment.phoneE164,
    config.whatsapp.templates.smartArrival,
    config.whatsapp.templates.smartArrivalLanguage,
    [arrival.message],
    { expectedParameterCount: 1 }
  );
}

async function sendApprovedDoctorWelcome(appointment) {
  const settings = await getClinicSettings();
  const welcome = settings.approvedDoctorWelcome;
  if (!welcome?.enabled || !welcome.mediaId || !welcome.mediaType || !welcome.approvedAt) return { status: "skipped" };
  const claimed = await Patient.findOneAndUpdate(
    { _id: appointment.patient, doctorWelcomeSentAt: { $exists: false } },
    { $set: { doctorWelcomeSentAt: new Date() } },
    { new: true }
  );
  if (!claimed) return { status: "already_sent" };
  try {
    const result = await sendMedia(appointment.phoneE164, welcome.mediaType, welcome.mediaId);
    if (result.status !== "queued") await Patient.updateOne({ _id: claimed._id }, { $unset: { doctorWelcomeSentAt: "" } });
    return result;
  } catch (error) {
    await Patient.updateOne({ _id: claimed._id }, { $unset: { doctorWelcomeSentAt: "" } });
    return { status: "failed" };
  }
}

module.exports = { buildSmartArrival, sendSmartArrival, sendApprovedDoctorWelcome, shiftTime };
