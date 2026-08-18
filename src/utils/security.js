const crypto = require("crypto");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function randomToken(bytes = 48) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function maskPhone(phone = "") {
  const cleaned = String(phone).replace(/[^\d+]/g, "");
  if (cleaned.length <= 6) return "***";
  return `${cleaned.slice(0, 4)}****${cleaned.slice(-3)}`;
}

function normalizePhone(input) {
  let value = String(input || "").trim();
  value = value.replace(/[^\d+]/g, "");
  if (!value) return "";
  if (value.startsWith("00")) value = `+${value.slice(2)}`;
  if (value.startsWith("0")) value = `+92${value.slice(1)}`;
  if (!value.startsWith("+")) value = `+${value}`;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return "";
  return `+${digits}`;
}

function safePublicAppointment(appointment) {
  return {
    appointmentId: appointment.appointmentId,
    tokenNumber: appointment.tokenNumber,
    appointmentType: appointment.appointmentType || "in_person",
    patientName: appointment.patientSnapshot?.fullName || "",
    phoneMasked: appointment.patientSnapshot?.phoneMasked || maskPhone(appointment.phoneE164),
    age: appointment.patientSnapshot?.age,
    gender: appointment.patientSnapshot?.gender,
    date: appointment.date,
    time: appointment.time,
    status: appointment.status,
    reminderStatus: appointment.reminderStatus,
    clinic: appointment.locationSnapshot ? {
      name: appointment.locationSnapshot.clinicName,
      city: appointment.locationSnapshot.city,
      address: appointment.locationSnapshot.address,
      contactNumber: appointment.locationSnapshot.contactNumber
    } : {
      name: "Configured clinic",
      city: "",
      address: "",
      contactNumber: ""
    }
  };
}

module.exports = { sha256, randomToken, maskPhone, normalizePhone, safePublicAppointment };
