const test = require("node:test");
const assert = require("node:assert/strict");
const {
  OCCUPYING_APPOINTMENT_STATUSES,
  NON_OCCUPYING_APPOINTMENT_STATUSES,
  appointmentOccupiesSlot,
  canTransitionAppointmentStatus,
  activeSlotKey
} = require("../../src/domain/appointmentRules");

test("one shared status rule defines active and released appointment slots", () => {
  for (const status of ["pending", "scheduled", "confirmed", "patient_confirmed", "arrived", "in_consultation", "rescheduled", "waiting_for_earlier_slot"]) {
    assert.equal(OCCUPYING_APPOINTMENT_STATUSES.includes(status), true);
    assert.equal(appointmentOccupiesSlot(status), true);
  }
  for (const status of ["completed", "cancelled", "no_show"]) {
    assert.equal(NON_OCCUPYING_APPOINTMENT_STATUSES.includes(status), true);
    assert.equal(appointmentOccupiesSlot(status), false);
  }
});

test("terminal appointment statuses cannot be reactivated", () => {
  assert.equal(canTransitionAppointmentStatus("cancelled", "confirmed"), false);
  assert.equal(canTransitionAppointmentStatus("completed", "confirmed"), false);
  assert.equal(canTransitionAppointmentStatus("no_show", "arrived"), false);
  assert.equal(canTransitionAppointmentStatus("confirmed", "arrived"), true);
  assert.equal(canTransitionAppointmentStatus("in_consultation", "completed"), true);
});

test("active slot identity includes clinic, local date and normalized time", () => {
  assert.equal(activeSlotKey("clinic-a", "2027-01-04", "16:30"), "clinic-a|2027-01-04|16:30");
  assert.notEqual(activeSlotKey("clinic-a", "2027-01-04", "16:30"), activeSlotKey("clinic-b", "2027-01-04", "16:30"));
});
