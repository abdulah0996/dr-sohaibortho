const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ROLE_PERMISSIONS,
  hasPermission,
  canSetAppointmentStatus
} = require("../../src/middleware/permissions");
const { isDemoAccountEmail } = require("../../src/services/authService");

test("only defined staff roles exist in the permission matrix", () => {
  assert.deepEqual(Object.keys(ROLE_PERMISSIONS).sort(), ["clinic_staff", "doctor", "receptionist", "super_admin"]);
});

test("super admin has full permission while other roles cannot manage users or settings", () => {
  assert.equal(hasPermission({ role: "super_admin" }, "users.manage"), true);
  for (const role of ["doctor", "receptionist", "clinic_staff"]) {
    assert.equal(hasPermission({ role }, "users.manage"), false);
    assert.equal(hasPermission({ role }, "settings.manage"), false);
    assert.equal(hasPermission({ role }, "doctor_profile.manage"), false);
  }
});

test("doctor, receptionist and clinic staff permissions follow least privilege", () => {
  assert.equal(hasPermission({ role: "doctor" }, "reports.review"), true);
  assert.equal(hasPermission({ role: "doctor" }, "reports.download"), true);
  assert.equal(hasPermission({ role: "receptionist" }, "reports.download"), false);
  assert.equal(hasPermission({ role: "doctor" }, "availability.manage"), false);
  assert.equal(hasPermission({ role: "receptionist" }, "availability.manage"), true);
  assert.equal(hasPermission({ role: "receptionist" }, "reports.review"), false);
  assert.equal(hasPermission({ role: "clinic_staff" }, "conversations.manage"), true);
  assert.equal(hasPermission({ role: "clinic_staff" }, "patients.notes.write"), false);
  assert.equal(hasPermission({ role: "clinic_staff" }, "reminders.manage"), false);
});

test("appointment status permissions are role-specific", () => {
  assert.equal(canSetAppointmentStatus({ role: "clinic_staff" }, "arrived"), true);
  assert.equal(canSetAppointmentStatus({ role: "clinic_staff" }, "completed"), false);
  assert.equal(canSetAppointmentStatus({ role: "doctor" }, "completed"), true);
  assert.equal(canSetAppointmentStatus({ role: "doctor" }, "cancelled"), false);
  assert.equal(canSetAppointmentStatus({ role: "receptionist" }, "cancelled"), true);
  assert.equal(canSetAppointmentStatus({ role: "receptionist" }, "in_consultation"), false);
});

test("known demo accounts are identifiable for production login denial", () => {
  assert.equal(isDemoAccountEmail("ADMIN@DRSOHAIBDEMO.COM"), true);
  assert.equal(isDemoAccountEmail("real.admin@clinic.example"), false);
});
