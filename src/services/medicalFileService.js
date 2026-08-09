const path = require("path");
const { randomBytes, randomUUID } = require("crypto");
const { config } = require("../config/env");
const { badRequest } = require("../utils/errors");

const FILE_TYPES = Object.freeze({
  pdf: { mimeType: "application/pdf", signature: (b) => b.length >= 5 && b.subarray(0, 5).equals(Buffer.from("%PDF-")) },
  jpg: { mimeType: "image/jpeg", signature: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  png: { mimeType: "image/png", signature: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) }
});

function validateMedicalFile(file) {
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) throw badRequest("Please select a non-empty medical document.");
  if (file.buffer.length > config.storage.maxUploadBytes) throw badRequest("The medical document exceeds the configured upload limit.");

  const originalFilename = String(file.originalname || "").normalize("NFKC");
  if (!originalFilename || originalFilename.length > 255 || path.basename(originalFilename) !== originalFilename || /[\0\r\n]/.test(originalFilename)) {
    throw badRequest("The medical document filename is invalid.");
  }
  const filenameParts = originalFilename.split(".");
  if (filenameParts.length !== 2 || !filenameParts[0]) throw badRequest("Double-extension filenames are not accepted.");
  let extension = filenameParts[1].toLowerCase();
  if (extension === "jpeg") extension = "jpg";
  const expected = FILE_TYPES[extension];
  if (!expected || !expected.signature(file.buffer)) throw badRequest("The medical document content does not match an allowed PDF, JPEG or PNG file.");
  if (String(file.mimetype || "").toLowerCase() !== expected.mimeType) throw badRequest("The medical document MIME type does not match its content.");

  const now = new Date();
  const storageKey = `medical-reports/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${extension}`;
  return { originalFilename, mimeType: expected.mimeType, fileSize: file.buffer.length, storageKey };
}

function createReportId() {
  return `RPT-${randomBytes(6).toString("hex").toUpperCase()}`;
}

function reportDto(report) {
  const value = report?.toObject ? report.toObject() : { ...report };
  delete value.storageKey;
  delete value.fileUrl;
  delete value.__v;
  value.fileName = value.originalFilename;
  value.fileType = value.mimeType;
  value.downloadPath = value.fileStatus === "active" ? `/api/reports/${value.reportId || value._id}/download` : null;
  return value;
}

module.exports = { FILE_TYPES, validateMedicalFile, createReportId, reportDto };
