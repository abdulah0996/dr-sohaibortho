const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

process.env.NODE_ENV = "test";
process.env.STORAGE_PROVIDER = "local";
process.env.STORAGE_MAX_UPLOAD_BYTES = "1024";

const { createApp } = require("../src/app");
const { createStaffUser } = require("../src/services/authService");
const { Patient, Appointment, ClinicLocation, MedicalReport, AuditLog } = require("../src/models");
const { createLocalStorage, setMedicalFileStorageForTests } = require("../src/services/medicalFileStorage");

const samples = {
  pdf: { type: "application/pdf", bytes: Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF") },
  jpg: { type: "image/jpeg", bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]) },
  png: { type: "image/png", bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00]) }
};

let mongod;
let server;
let baseUrl;
let tempStorageRoot;
let localStorage;
let appointment;
const tokens = {};
const uploaded = {};

async function request(urlPath, { method = "GET", token, body, headers = {} } = {}) {
  const requestHeaders = { ...headers };
  if (token) requestHeaders.authorization = `Bearer ${token}`;
  let payload = body;
  if (body !== undefined && !(body instanceof FormData)) {
    payload = JSON.stringify(body);
    requestHeaders["content-type"] = "application/json";
  }
  const response = await fetch(`${baseUrl}${urlPath}`, { method, headers: requestHeaders, body: payload });
  const bytes = Buffer.from(await response.arrayBuffer());
  let data = bytes;
  if ((response.headers.get("content-type") || "").includes("application/json")) {
    try { data = JSON.parse(bytes.toString("utf8")); } catch {}
  }
  return { response, data, bytes };
}

function uploadForm(filename, sample, extra = {}) {
  const form = new FormData();
  form.set("phone", extra.phone || "03001234567");
  form.set("appointmentId", extra.appointmentId || appointment.appointmentId);
  form.set("reportTitle", extra.reportTitle || "Test medical report");
  form.set("documentType", "lab");
  form.set("reportFile", new Blob([sample.bytes], { type: sample.type }), filename);
  for (const [key, value] of Object.entries(extra.fields || {})) form.set(key, value);
  return form;
}

async function login(email, password) {
  const result = await request("/api/auth/login", { method: "POST", body: { email, password } });
  assert.equal(result.response.status, 200);
  return result.data.accessToken;
}

test.before(async () => {
  tempStorageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "dr-sohaib-medical-test-"));
  localStorage = createLocalStorage({ rootDir: tempStorageRoot });
  setMedicalFileStorageForTests(localStorage);
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { autoIndex: true });
  await Promise.all([
    createStaffUser({ name: "Admin", email: "med-admin@test.local", password: "Admin@Test123", role: "super_admin" }),
    createStaffUser({ name: "Doctor", email: "med-doctor@test.local", password: "Doctor@Test123", role: "doctor" }),
    createStaffUser({ name: "Reception", email: "med-reception@test.local", password: "Reception@Test123", role: "receptionist" }),
    createStaffUser({ name: "Clinic Staff", email: "med-staff@test.local", password: "Staff@Test123", role: "clinic_staff" })
  ]);
  const location = await ClinicLocation.create({
    clinicName: "Medical Test Clinic", city: "Bahawalpur", code: "MED", fullAddress: "Test address",
    isActive: true, bookingEnabled: true, status: "Active"
  });
  const patient = await Patient.create({ fullName: "Medical Test Patient", phoneE164: "+923001234567" });
  appointment = await Appointment.create({
    appointmentId: "DS-MEDICAL-001", tokenNumber: "MED-001", patient: patient._id,
    patientSnapshot: { fullName: patient.fullName, phoneMasked: "+92******4567" },
    phoneE164: patient.phoneE164, location: location._id,
    locationSnapshot: { clinicName: location.clinicName, code: location.code, timezone: "Asia/Karachi" },
    reason: "Medical report test", date: "2030-01-02", time: "16:30", status: "confirmed"
  });
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  tokens.admin = await login("med-admin@test.local", "Admin@Test123");
  tokens.doctor = await login("med-doctor@test.local", "Doctor@Test123");
  tokens.receptionist = await login("med-reception@test.local", "Reception@Test123");
  tokens.clinicStaff = await login("med-staff@test.local", "Staff@Test123");
});

test.after(async () => {
  setMedicalFileStorageForTests(null);
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
  const resolved = path.resolve(tempStorageRoot || "");
  if (tempStorageRoot && resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)) await fs.rm(resolved, { recursive: true, force: true });
});

test("real PDF, JPEG and PNG bytes are privately stored and authorized downloads return exact content", async () => {
  for (const extension of ["pdf", "jpg", "png"]) {
    const result = await request("/api/reports/upload", { method: "POST", body: uploadForm(`report.${extension}`, samples[extension]) });
    assert.equal(result.response.status, 201);
    assert.equal(result.data.report.fileSize, samples[extension].bytes.length);
    assert.equal("storageKey" in result.data.report, false);
    assert.equal("fileUrl" in result.data.report, false);
    uploaded[extension] = result.data.report;
    const record = await MedicalReport.findOne({ reportId: result.data.report.reportId }).select("+storageKey").lean();
    const storedBytes = await fs.readFile(path.join(tempStorageRoot, ...record.storageKey.split("/")));
    assert.deepEqual(storedBytes, samples[extension].bytes);
    const download = await request(`/api/reports/${record.reportId}/download`, { token: tokens.doctor });
    assert.equal(download.response.status, 200);
    assert.equal(download.response.headers.get("cache-control"), "private, no-store, max-age=0");
    assert.deepEqual(download.bytes, samples[extension].bytes);
  }
});

test("a storage failure creates no report record", async () => {
  const before = await MedicalReport.countDocuments();
  setMedicalFileStorageForTests({ async putObject() { throw new Error("simulated storage outage"); } });
  const result = await request("/api/reports/upload", { method: "POST", body: uploadForm("failure.pdf", samples.pdf) });
  assert.equal(result.response.status, 503);
  assert.equal(result.data.error.code, "PRIVATE_STORAGE_UNAVAILABLE");
  assert.equal(await MedicalReport.countDocuments(), before);
  setMedicalFileStorageForTests(localStorage);
});

test("download requires authentication and a specifically authorized clinical role", async () => {
  const url = `/api/reports/${uploaded.pdf.reportId}/download`;
  assert.equal((await request(url)).response.status, 401);
  assert.equal((await request(url, { token: tokens.receptionist })).response.status, 403);
  assert.equal((await request(url, { token: tokens.clinicStaff })).response.status, 403);
  assert.equal((await request("/api/reports/RPT-DOES-NOT-EXIST/download", { token: tokens.doctor })).response.status, 404);
  assert.equal((await request(url, { token: tokens.doctor })).response.status, 200);
});

test("renamed executables, fake and double extensions, empty, oversized and client paths are rejected", async () => {
  const cases = [
    uploadForm("malware.pdf", { type: "application/pdf", bytes: Buffer.from("MZ executable") }),
    uploadForm("report.pdf.exe", { type: "application/pdf", bytes: samples.pdf.bytes }),
    uploadForm("empty.pdf", { type: "application/pdf", bytes: Buffer.alloc(0) }),
    uploadForm("oversized.pdf", { type: "application/pdf", bytes: Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(1020)]) }),
    uploadForm("wrong.png", { type: "image/png", bytes: samples.jpg.bytes }),
    uploadForm("path.pdf", samples.pdf, { fields: { fileUrl: "https://evil.example/patient.pdf" } })
  ];
  const before = await MedicalReport.countDocuments();
  for (const form of cases) {
    const result = await request("/api/reports/upload", { method: "POST", body: form });
    assert.equal(result.response.status, 400);
  }
  assert.equal(await MedicalReport.countDocuments(), before);
  const jsonPath = await request("/api/reports/upload", { method: "POST", body: {
    phone: "03001234567", appointmentId: appointment.appointmentId, reportTitle: "Bad URL", fileUrl: "/uploads/fake.pdf"
  } });
  assert.equal(jsonPath.response.status, 400);
});

test("metadata and protected download routes never expose permanent storage locations", async () => {
  const list = await request("/api/reports", { token: tokens.doctor });
  assert.equal(list.response.status, 200);
  assert.ok(list.data.reports.length >= 3);
  for (const report of list.data.reports) {
    assert.equal("storageKey" in report, false);
    assert.equal("fileUrl" in report, false);
    assert.match(report.downloadPath, /^\/api\/reports\/[A-Za-z0-9-]+\/download$/);
  }
  for (const publicPath of ["/uploads/report.pdf", "/private-storage/report.pdf", "/medical-reports/2030/01/report.pdf", "/src/services/medicalFileStorage.js"]) {
    assert.equal((await request(publicPath)).response.status, 404);
  }
});

test("upload/download/deletion are audited and deletion removes only the selected private object", async () => {
  assert.ok(await AuditLog.findOne({ action: "report.uploaded", entityId: { $exists: true } }));
  assert.ok(await AuditLog.findOne({ action: "report.downloaded", actorRole: "doctor" }));
  const target = await MedicalReport.findOne({ reportId: uploaded.jpg.reportId }).select("+storageKey");
  const preserved = await MedicalReport.findOne({ reportId: uploaded.png.reportId }).select("+storageKey");
  const targetPath = path.join(tempStorageRoot, ...target.storageKey.split("/"));
  const preservedPath = path.join(tempStorageRoot, ...preserved.storageKey.split("/"));
  const denied = await request(`/api/reports/${target.reportId}`, { method: "DELETE", token: tokens.doctor });
  assert.equal(denied.response.status, 403);
  const removed = await request(`/api/reports/${target.reportId}`, { method: "DELETE", token: tokens.admin });
  assert.equal(removed.response.status, 200);
  await assert.rejects(fs.access(targetPath));
  await fs.access(preservedPath);
  assert.equal((await request(`/api/reports/${target.reportId}/download`, { token: tokens.doctor })).response.status, 404);
  assert.equal((await request(`/api/reports/${preserved.reportId}/download`, { token: tokens.doctor })).response.status, 200);
  const archived = await MedicalReport.findById(target._id).select("+storageKey").lean();
  assert.equal(archived.fileStatus, "deleted");
  assert.equal(archived.storageKey, undefined);
  assert.ok(await AuditLog.findOne({ action: "report.deleted", actorRole: "super_admin", entityId: String(target._id) }));
});
