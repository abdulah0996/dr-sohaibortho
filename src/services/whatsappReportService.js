const { MedicalReport } = require("../models");
const { findOrCreatePatient } = require("./appointmentService");
const { getMedicalFileStorage } = require("./medicalFileStorage");
const { validateMedicalFile, createReportId } = require("./medicalFileService");
const { logError } = require("../utils/safeLogger");

async function storeWhatsAppReport({ phoneE164, fullName, age, isFamilyMember, buffer, filename, mimeType }) {
  const fileMetadata = validateMedicalFile({
    buffer,
    originalname: filename,
    mimetype: mimeType
  });
  const patient = await findOrCreatePatient({
    phone: phoneE164,
    fullName,
    age,
    isFamilyMember,
    preferredLanguage: "en"
  });
  const storage = getMedicalFileStorage();
  let stored = false;
  try {
    await storage.putObject({ key: fileMetadata.storageKey, body: buffer, contentType: fileMetadata.mimeType });
    stored = true;
    const report = await MedicalReport.create({
      reportId: createReportId(),
      patient: patient._id,
      patientPhone: phoneE164,
      reportTitle: "Previous medical report",
      documentType: "other",
      ...fileMetadata,
      uploadedByType: "patient",
      uploadedAt: new Date(),
      fileStatus: "active",
      status: "New"
    });
    return { reportId: report.reportId, id: String(report._id) };
  } catch (error) {
    if (stored) await storage.deleteObject({ key: fileMetadata.storageKey }).catch((cleanupError) => logError("Private WhatsApp upload cleanup failed", cleanupError));
    throw error;
  }
}

async function linkReportsToAppointment({ reportIds, phoneE164, appointment }) {
  const ids = Array.from(new Set((reportIds || []).map(String))).slice(0, 50);
  if (!ids.length) return 0;
  const result = await MedicalReport.updateMany(
    { _id: { $in: ids }, patientPhone: phoneE164, appointment: { $exists: false }, fileStatus: "active" },
    { $set: { appointment: appointment._id, appointmentId: appointment.appointmentId, tokenNumber: appointment.tokenNumber } }
  );
  return result.modifiedCount;
}

module.exports = { storeWhatsAppReport, linkReportsToAppointment };
