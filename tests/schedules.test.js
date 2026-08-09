const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { DateTime } = require("luxon");
const { MongoMemoryServer } = require("mongodb-memory-server");

process.env.NODE_ENV = "test";

const { createApp } = require("../src/app");
const { createStaffUser } = require("../src/services/authService");
const { ensureInitialLocations } = require("../src/services/locationService");
const { createAppointment, cancelAppointment, rescheduleAppointment } = require("../src/services/appointmentService");
const { defaultWeeklyHours } = require("../src/utils/time");
const { Appointment, Patient, PatientConsent, BookingRequest, Counter, ClinicLocation, ClinicSettings, AuditLog } = require("../src/models");
const { migrateClinicSchedules } = require("../scripts/migrate-clinic-schedules");

let mongod;
let server;
let baseUrl;
let bwp;
const tokens = {};

function futureWeekday(weekday, extraWeeks = 2) {
  let date = DateTime.now().setZone("Asia/Karachi").plus({ weeks: extraWeeks }).startOf("day");
  while (date.weekday !== weekday) date = date.plus({ days: 1 });
  return date.toISODate();
}

function booking(overrides = {}) {
  return {
    fullName: "Schedule Test Patient",
    phone: "03001234001",
    reason: "Schedule test",
    date: futureWeekday(1),
    time: "16:30",
    locationId: "BWP",
    consentGiven: true,
    consentTextVersion: "appointment-consent-v1",
    ...overrides
  };
}

async function request(path, { method = "GET", token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  let payload;
  if (body !== undefined) {
    payload = JSON.stringify(body);
    headers["content-type"] = "application/json";
  }
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: payload });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { response, data };
}

async function login(email, password) {
  const result = await request("/api/auth/login", { method: "POST", body: { email, password } });
  assert.equal(result.response.status, 200);
  return result.data.accessToken;
}

async function startServer() {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { autoIndex: true });
  await ensureInitialLocations();
  bwp = await ClinicLocation.findOne({ code: "BWP" });
  await Promise.all([
    createStaffUser({ name: "Admin", email: "schedule-admin@test.local", password: "Admin@Test123", role: "super_admin" }),
    createStaffUser({ name: "Reception", email: "schedule-reception@test.local", password: "Reception@Test123", role: "receptionist" }),
    createStaffUser({ name: "Doctor", email: "schedule-doctor@test.local", password: "Doctor@Test123", role: "doctor" }),
    createStaffUser({ name: "Staff", email: "schedule-staff@test.local", password: "Staff@Test123", role: "clinic_staff" })
  ]);
  await startServer();
  tokens.admin = await login("schedule-admin@test.local", "Admin@Test123");
  tokens.receptionist = await login("schedule-reception@test.local", "Reception@Test123");
  tokens.doctor = await login("schedule-doctor@test.local", "Doctor@Test123");
  tokens.staff = await login("schedule-staff@test.local", "Staff@Test123");
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

test.beforeEach(async () => {
  await Promise.all([
    Appointment.deleteMany({}), Patient.deleteMany({}), PatientConsent.deleteMany({}), BookingRequest.deleteMany({}), Counter.deleteMany({}), AuditLog.deleteMany({})
  ]);
  await ClinicLocation.updateOne({ _id: bwp._id }, { $set: {
    status: "Active", timezone: "Asia/Karachi", weeklyHours: defaultWeeklyHours(), slotDurationMinutes: 15,
    sameDayBookingCutoffMinutes: 0, blockedDates: [], blockedSlots: []
  } });
});

test("weekly hours persist through an application restart and remain authoritative", async () => {
  const changed = defaultWeeklyHours().map((entry) => entry.day === 2 ? { ...entry, isOpen: true, start: "17:00", end: "19:00" } : entry);
  const saved = await request("/api/availability/schedule", {
    method: "PUT", token: tokens.receptionist,
    body: { locationId: "BWP", timezone: "Asia/Karachi", slotDurationMinutes: 30, sameDayBookingCutoffMinutes: 45, weeklyHours: changed }
  });
  assert.equal(saved.response.status, 200);
  await new Promise((resolve) => server.close(resolve));
  await startServer();
  const reloaded = await request("/api/availability/manage/BWP", { token: tokens.receptionist });
  assert.equal(reloaded.response.status, 200);
  assert.equal(reloaded.data.location.slotDurationMinutes, 30);
  assert.equal(reloaded.data.location.sameDayBookingCutoffMinutes, 45);
  assert.deepEqual(reloaded.data.location.weeklyHours.find((entry) => entry.day === 2), { day: 2, isOpen: true, start: "17:00", end: "19:00" });
  assert.ok(await AuditLog.findOne({ action: "availability.schedule_updated", actorRole: "receptionist" }));
});

test("blocking persists atomically, prevents duplicate records and unblocking restores availability", async () => {
  const date = futureWeekday(1);
  const block = await request("/api/availability/block-slot", { method: "POST", token: tokens.receptionist, body: { locationId: "BWP", date, time: "16:30", reason: "Doctor meeting" } });
  assert.equal(block.response.status, 201);
  const persisted = await ClinicLocation.findById(bwp._id).lean();
  assert.equal(persisted.blockedSlots.length, 1);
  assert.equal(persisted.blockedSlots[0].time, "16:30");
  assert.equal(String(persisted.blockedSlots[0].createdBy), String((await mongoose.model("StaffUser").findOne({ email: "schedule-reception@test.local" }))._id));
  assert.ok(persisted.blockedSlots[0].createdAt);
  const duplicate = await request("/api/availability/block-slot", { method: "POST", token: tokens.receptionist, body: { locationId: "BWP", date, time: "16:30", reason: "Duplicate" } });
  assert.equal(duplicate.response.status, 409);
  const blockedSlots = await request(`/api/availability/slots?locationId=BWP&date=${date}`);
  assert.deepEqual(blockedSlots.data.slots.find((slot) => slot.time === "16:30"), { time: "16:30", available: false, blocked: true, booked: false });
  assert.equal((await request("/api/appointments", { method: "POST", body: booking({ date }) })).response.status, 409);
  const unblocked = await request("/api/availability/unblock-slot", { method: "POST", token: tokens.receptionist, body: { locationId: "BWP", date, time: "16:30" } });
  assert.equal(unblocked.response.status, 200);
  const available = await request(`/api/availability/slots?locationId=BWP&date=${date}`);
  assert.equal(available.data.slots.find((slot) => slot.time === "16:30").available, true);
  assert.equal((await request("/api/appointments", { method: "POST", body: booking({ date }) })).response.status, 201);
});

test("blocked dates, closed weekdays, Coming Soon and inactive clinics reject bookings", async () => {
  const monday = futureWeekday(1);
  const friday = futureWeekday(5);
  assert.equal((await request("/api/availability/block-date", { method: "POST", token: tokens.receptionist, body: { locationId: "BWP", date: monday, reason: "Public holiday" } })).response.status, 201);
  for (const input of [booking({ date: monday }), booking({ date: friday, phone: "03001234002" }), booking({ date: monday, phone: "03001234003", locationId: "BWN" })]) {
    assert.ok([400, 409].includes((await request("/api/appointments", { method: "POST", body: input })).response.status));
  }
  const inactive = await ClinicLocation.create({ clinicName: "Inactive Clinic", city: "Test", code: "INA", fullAddress: "Test", status: "Inactive", timezone: "Asia/Karachi", weeklyHours: defaultWeeklyHours(), slotDurationMinutes: 15 });
  assert.equal((await request("/api/appointments", { method: "POST", body: booking({ date: futureWeekday(1, 3), phone: "03001234004", locationId: inactive.code }) })).response.status, 400);
});

test("website, WhatsApp, staff and rescheduling use the same blocked-slot decision", async () => {
  const date = futureWeekday(2);
  await request("/api/availability/block-slot", { method: "POST", token: tokens.receptionist, body: { locationId: "BWP", date, time: "17:00", reason: "Unavailable" } });
  assert.equal((await request("/api/appointments", { method: "POST", body: booking({ date, time: "17:00" }) })).response.status, 409);
  for (const [source, phone] of [["whatsapp", "03001234005"], ["staff", "03001234006"]]) {
    await assert.rejects(createAppointment(booking({ date, time: "17:00", phone }), { source }), (error) => error.statusCode === 409);
  }
  const original = await createAppointment(booking({ date: futureWeekday(1, 3), time: "16:30", phone: "03001234007" }), { source: "website" });
  await assert.rejects(rescheduleAppointment({ appointmentId: original.appointmentId, phone: original.phoneE164, locationId: "BWP", date, time: "17:00" }), (error) => error.statusCode === 409);
});

test("public users and unauthorized staff cannot modify schedules", async () => {
  const body = { locationId: "BWP", date: futureWeekday(1), time: "18:00", reason: "Unauthorized" };
  assert.equal((await request("/api/availability/block-slot", { method: "POST", body })).response.status, 401);
  assert.equal((await request("/api/availability/block-slot", { method: "POST", token: tokens.doctor, body })).response.status, 403);
  assert.equal((await request("/api/availability/block-slot", { method: "POST", token: tokens.staff, body })).response.status, 403);
  assert.equal((await request("/api/availability/block-slot", { method: "POST", token: tokens.receptionist, body })).response.status, 201);
});

test("invalid schedule values are rejected and the authoritative Inactive status disables booking", async () => {
  const invalidHours = defaultWeeklyHours();
  invalidHours[0] = { ...invalidHours[0], start: "25:00" };
  const invalidSchedule = await request("/api/availability/schedule", {
    method: "PUT", token: tokens.receptionist,
    body: { locationId: "BWP", weeklyHours: invalidHours }
  });
  assert.equal(invalidSchedule.response.status, 400);
  const invalidDate = await request("/api/availability/block-date", {
    method: "POST", token: tokens.receptionist,
    body: { locationId: "BWP", date: "2030-02-30", reason: "Invalid calendar date" }
  });
  assert.equal(invalidDate.response.status, 400);
  const inactive = await request(`/api/clinic-locations/${bwp._id}`, { method: "PUT", token: tokens.admin, body: { status: "Inactive" } });
  assert.equal(inactive.response.status, 200);
  assert.equal(inactive.data.location.status, "Inactive");
  assert.equal((await request("/api/appointments", { method: "POST", body: booking() })).response.status, 400);
});

test("blocking an occupied slot requires explicit confirmation and never cancels the appointment", async () => {
  const date = futureWeekday(1);
  const appointment = await createAppointment(booking({ date }), { source: "website" });
  const payload = { locationId: "BWP", date, time: "16:30", reason: "Emergency schedule change" };
  const denied = await request("/api/availability/block-slot", { method: "POST", token: tokens.receptionist, body: payload });
  assert.equal(denied.response.status, 409);
  assert.equal(denied.data.error.details.requiresConfirmation, true);
  assert.equal((await ClinicLocation.findById(bwp._id)).blockedSlots.length, 0);
  assert.equal((await Appointment.findById(appointment._id)).status, "confirmed");
  const confirmed = await request("/api/availability/block-slot", { method: "POST", token: tokens.receptionist, body: { ...payload, confirmExistingAppointments: true } });
  assert.equal(confirmed.response.status, 201);
  assert.equal(confirmed.data.blockedSlot.conflictingAppointmentsPreserved, 1);
  assert.equal((await Appointment.findById(appointment._id)).status, "confirmed");
  assert.equal(await Appointment.countDocuments({ _id: appointment._id }), 1);
});

test("dashboard totals come from the selected clinic schedule and date", async () => {
  const date = futureWeekday(1);
  await createAppointment(booking({ date, time: "16:30" }), { source: "website" });
  const cancelled = await createAppointment(booking({ date, time: "16:45", phone: "03001234008" }), { source: "website" });
  await cancelAppointment({ appointmentId: cancelled.appointmentId, phone: cancelled.phoneE164 });
  await request("/api/availability/block-slot", { method: "POST", token: tokens.receptionist, body: { locationId: "BWP", date, time: "17:00", reason: "Dashboard test" } });
  const dashboard = await request(`/api/dashboard/summary?locationId=BWP&date=${date}`, { token: tokens.receptionist });
  assert.equal(dashboard.response.status, 200);
  assert.deepEqual({
    totalPossibleSlots: dashboard.data.summary.totalPossibleSlots,
    bookedSlots: dashboard.data.summary.bookedSlots,
    availableSlots: dashboard.data.summary.availableSlots,
    blockedSlots: dashboard.data.summary.blockedSlots,
    cancelledAppointments: dashboard.data.summary.cancelledAppointments
  }, { totalPossibleSlots: 16, bookedSlots: 1, availableSlots: 14, blockedSlots: 1, cancelledAppointments: 1 });
});

test("schedule migration consolidates legacy settings and preserves Coming Soon clinics", async () => {
  await ClinicLocation.collection.updateOne({ code: "BWP" }, { $unset: { weeklyHours: "", sameDayBookingCutoffMinutes: "" }, $set: { isActive: true, bookingEnabled: true } });
  await ClinicLocation.collection.updateOne({ code: "BWN" }, { $set: { status: "Active", isActive: false, bookingEnabled: false } });
  await ClinicSettings.collection.updateOne({ key: "default" }, { $set: { timezone: "Asia/Karachi", slotDurationMinutes: 15 } }, { upsert: true });
  const report = await migrateClinicSchedules();
  assert.equal(report.bwpSchedule, "verified");
  assert.equal(report.comingSoonClinics, 2);
  const migratedBwp = await ClinicLocation.collection.findOne({ code: "BWP" });
  assert.equal(migratedBwp.weeklyHours.length, 7);
  assert.equal(migratedBwp.sameDayBookingCutoffMinutes, 0);
  assert.equal("isActive" in migratedBwp, false);
  assert.equal("bookingEnabled" in migratedBwp, false);
  assert.equal((await ClinicLocation.collection.findOne({ code: "BWN" })).status, "Coming Soon");
  const settings = await ClinicSettings.collection.findOne({ key: "default" });
  assert.equal("timezone" in settings, false);
  assert.equal("slotDurationMinutes" in settings, false);
});
