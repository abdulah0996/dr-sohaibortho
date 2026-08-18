const express = require("express");
const { logError } = require("../utils/safeLogger");
const mongoose = require("mongoose");
const multer = require("multer");
const { z } = require("zod");
const { MedicalReport } = require("../models");
const { publicFormLimiter, patientVerificationLimiter } = require("../middleware/security");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");
const { asyncHandler } = require("../utils/asyncHandler");
const { AppError, badRequest, notFound } = require("../utils/errors");
const { normalizePhone } = require("../utils/security");
const { audit } = require("../services/auditService");
const { lookupAppointment, findOrCreatePatient } = require("../services/appointmentService");
const { getMedicalFileStorage } = require("../services/medicalFileStorage");
const { validateMedicalFile, createReportId, reportDto } = require("../services/medicalFileService");
const { config } = require("../config/env");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: config.storage.maxUploadBytes }
});

function multipartUpload(req, res, next) {
  upload.single("reportFile")(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return next(badRequest("The medical document exceeds the configured upload limit."));
    }
    return next(badRequest("The medical document upload could not be accepted."));
  });
}

function reportConditions(id) {
  const conditions = [{ reportId: id }];
  if (mongoose.Types.ObjectId.isValid(id)) conditions.push({ _id: id });
  return conditions;
}

const uploadFieldsSchema = z.object({
  phone: z.string().min(7).max(40),
  reportTitle: z.string().min(2).max(200),
  appointmentId: z.string().max(50).optional().or(z.literal("")),
  documentType: z.enum(["mri", "xray", "prescription", "lab", "discharge", "other", "blood_test"]).optional(),
  notes: z.string().max(1000).optional().or(z.literal(""))
}).strict();

router.post("/upload", publicFormLimiter, patientVerificationLimiter, multipartUpload, asyncHandler(async (req, res) => {
  const parsed = uploadFieldsSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest("Invalid report upload data.", parsed.error.flatten());
  const input = parsed.data;
  const phoneE164 = normalizePhone(input.phone);
  if (!phoneE164) throw badRequest("Invalid report upload data.");

  const fileMetadata = validateMedicalFile(req.file);

  let appt = null;
  let patient = null;

  if (input.appointmentId && input.appointmentId.trim()) {
    appt = await lookupAppointment({ reference: input.appointmentId, phone: phoneE164 });
    patient = appt.patient;
  } else {
    patient = await findOrCreatePatient({ phone: phoneE164 });
  }

  const storage = getMedicalFileStorage();
  let stored = false;
  let report;
  try {
    await storage.putObject({ key: fileMetadata.storageKey, body: req.file.buffer, contentType: fileMetadata.mimeType });
    stored = true;
    report = await MedicalReport.create({
      reportId: createReportId(),
      patient: patient._id || patient,
      patientPhone: phoneE164,
      appointmentId: appt ? appt.appointmentId : "",
      tokenNumber: appt ? appt.tokenNumber : "",
      appointment: appt ? appt._id : undefined,
      reportTitle: input.reportTitle,
      documentType: input.documentType || "other",
      ...fileMetadata,
      uploadedByType: "patient",
      uploadedAt: new Date(),
      fileStatus: "active",
      notes: input.notes || "",
      status: "New"
    });
  } catch (error) {
    if (stored) {
      try { await storage.deleteObject({ key: fileMetadata.storageKey }); }
      catch (cleanupError) { logError("Private upload cleanup failed", cleanupError); }
    }
    throw new AppError(503, "PRIVATE_STORAGE_UNAVAILABLE", "The medical document could not be stored securely. Please try again later.");
  }

  await audit({ actorType: "patient", actorPatient: patient._id || patient, actorPhone: phoneE164, action: "report.uploaded", entityType: "report", entityId: String(report._id), metadata: { mimeType: report.mimeType, fileSize: report.fileSize }, req });
  const responseReport = reportDto(report);
  delete responseReport.patient;
  delete responseReport.patientPhone;
  delete responseReport.appointment;
  delete responseReport.notes;
  res.status(201).json({
    success: true,
    report: responseReport,
    message: "Your medical document has been uploaded successfully and linked with your record."
  });
}));

router.use(requireAuth);

router.get("/", requirePermission("reports.read"), asyncHandler(async (req, res) => {
  const filter = { fileStatus: { $ne: "deleted" } };
  const allowedStatuses = new Set(["New", "Uploaded", "Received", "Under Review", "Reviewed", "More Information Required", "pending", "archived"]);
  if (allowedStatuses.has(req.query.status)) filter.status = req.query.status;
  if (req.query.phone) {
    const phone = normalizePhone(String(req.query.phone).slice(0, 40));
    if (phone) filter.patientPhone = phone;
  }
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 100));
  const page = Math.max(1, Number(req.query.page) || 1);
  const reports = await MedicalReport.find(filter).select("-storageKey -fileUrl")
    .populate("patient", "patientId fullName phoneE164 preferredLanguage city")
    .populate("appointment", "appointmentId tokenNumber date time status")
    .populate("reviewedBy", "name role").sort({ createdAt: -1 })
    .skip((page - 1) * limit).limit(limit).lean();
  await audit({ actorType: "staff", action: "reports.list_viewed", entityType: "report", metadata: { resultCount: reports.length }, req });
  res.json({ success: true, reports: reports.map(reportDto) });
}));

router.get("/appointment/:appointmentId", requirePermission("reports.read"), asyncHandler(async (req, res) => {
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 100));
  const reports = await MedicalReport.find({ appointmentId: req.params.appointmentId, fileStatus: { $ne: "deleted" } }).select("-storageKey -fileUrl")
    .populate("patient", "patientId fullName phoneE164 preferredLanguage city")
    .populate("appointment", "appointmentId tokenNumber date time status")
    .populate("reviewedBy", "name role").sort({ createdAt: -1 }).limit(limit).lean();
  await audit({ actorType: "staff", action: "appointment.reports_viewed", entityType: "appointment", entityId: req.params.appointmentId, metadata: { resultCount: reports.length }, req });
  res.json({ success: true, reports: reports.map(reportDto) });
}));

router.get("/:id/download", requirePermission("reports.download"), asyncHandler(async (req, res) => {
  const report = await MedicalReport.findOne({ $or: reportConditions(req.params.id), fileStatus: "active" }).select("+storageKey");
  if (!report?.storageKey) throw notFound("Medical report not found");
  let stream;
  try { stream = await getMedicalFileStorage().getObject({ key: report.storageKey }); }
  catch { throw notFound("Medical report not found"); }
  await audit({ actorType: "staff", action: "report.downloaded", entityType: "report", entityId: String(report._id), metadata: { fileSize: report.fileSize, mimeType: report.mimeType }, req });
  const safeAsciiName = report.originalFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const isInline = req.query.inline === "true" || req.query.disposition === "inline";
  const dispositionType = isInline ? "inline" : "attachment";
  res.set({
    "Content-Type": report.mimeType,
    "Content-Length": String(report.fileSize),
    "Content-Disposition": `${dispositionType}; filename="${safeAsciiName}"; filename*=UTF-8''${encodeURIComponent(report.originalFilename)}`,
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff"
  });
  stream.on?.("error", () => res.destroy());
  stream.pipe(res);
}));

router.delete("/:id", requirePermission("reports.delete"), asyncHandler(async (req, res) => {
  const report = await MedicalReport.findOne({ $or: reportConditions(req.params.id), fileStatus: { $in: ["active", "deleting"] } }).select("+storageKey");
  if (!report?.storageKey) throw notFound("Medical report not found");
  report.fileStatus = "deleting";
  await report.save();
  try { await getMedicalFileStorage().deleteObject({ key: report.storageKey }); }
  catch (error) {
    report.fileStatus = "active";
    await report.save();
    throw new AppError(503, "PRIVATE_STORAGE_UNAVAILABLE", "The medical document could not be deleted securely. Please try again later.");
  }
  report.fileStatus = "deleted";
  report.status = "archived";
  report.deletedAt = new Date();
  report.deletedBy = req.user._id;
  report.storageKey = undefined;
  await report.save({ validateBeforeSave: false });
  await audit({ actorType: "staff", action: "report.deleted", entityType: "report", entityId: String(report._id), req });
  res.json({ success: true, message: "Medical report deleted securely." });
}));

router.get("/:id", requirePermission("reports.read"), asyncHandler(async (req, res) => {
  const report = await MedicalReport.findOne({ $or: reportConditions(req.params.id), fileStatus: { $ne: "deleted" } }).select("-storageKey -fileUrl")
    .populate("patient", "patientId fullName phoneE164 preferredLanguage city")
    .populate("appointment", "appointmentId tokenNumber date time status")
    .populate("reviewedBy", "name role").lean();
  if (!report) throw notFound("Medical report not found");
  await audit({ actorType: "staff", action: "report.viewed", entityType: "report", entityId: String(report._id), req });
  res.json({ success: true, report: reportDto(report) });
}));

const updateStatusHandler = asyncHandler(async (req, res) => {
  const parsed = z.object({ status: z.enum(["New", "Uploaded", "Received", "Under Review", "Reviewed", "More Information Required", "pending", "archived"]) }).strict().safeParse(req.body);
  if (!parsed.success) throw badRequest("Invalid report status.");
  const report = await MedicalReport.findOne({ $or: reportConditions(req.params.id), fileStatus: "active" });
  if (!report) throw notFound("Report not found");
  report.status = parsed.data.status;
  report.reviewedBy = req.user._id;
  report.reviewedAt = new Date();
  await report.save();
  await audit({ actorType: "staff", action: "report.status_updated", entityType: "report", entityId: String(report._id), metadata: { status: report.status }, req });
  res.json({ success: true, report: reportDto(report), message: "Report status updated successfully." });
});

router.put("/:id/status", requirePermission("reports.review"), updateStatusHandler);
router.patch("/:id/status", requirePermission("reports.review"), updateStatusHandler);

const updateNotesHandler = asyncHandler(async (req, res) => {
  const parsed = z.object({ notes: z.string().max(1000) }).strict().safeParse(req.body);
  if (!parsed.success) throw badRequest("Invalid report note.");
  const report = await MedicalReport.findOne({ $or: reportConditions(req.params.id), fileStatus: "active" });
  if (!report) throw notFound("Report not found");
  report.notes = parsed.data.notes;
  await report.save();
  await audit({ actorType: "staff", action: "report.note_added", entityType: "report", entityId: String(report._id), req });
  res.json({ success: true, report: reportDto(report), message: "Report note updated successfully." });
});

router.put("/:id/notes", requirePermission("reports.review"), updateNotesHandler);
router.patch("/:id/notes", requirePermission("reports.review"), updateNotesHandler);

module.exports = router;
