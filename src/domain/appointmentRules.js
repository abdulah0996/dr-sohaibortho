const OCCUPYING_APPOINTMENT_STATUSES = Object.freeze([
  "pending",
  "scheduled",
  "confirmed",
  "patient_confirmed",
  "arrived",
  "in_consultation",
  "rescheduled",
  "waiting_for_earlier_slot"
]);

const NON_OCCUPYING_APPOINTMENT_STATUSES = Object.freeze([
  "completed",
  "cancelled",
  "no_show"
]);

const OCCUPYING_STATUS_SET = new Set(OCCUPYING_APPOINTMENT_STATUSES);

const STATUS_TRANSITIONS = Object.freeze({
  pending: ["scheduled", "confirmed", "patient_confirmed", "cancelled"],
  scheduled: ["confirmed", "patient_confirmed", "arrived", "rescheduled", "cancelled", "no_show", "waiting_for_earlier_slot"],
  confirmed: ["patient_confirmed", "arrived", "rescheduled", "cancelled", "no_show", "waiting_for_earlier_slot"],
  patient_confirmed: ["arrived", "rescheduled", "cancelled", "no_show", "waiting_for_earlier_slot"],
  arrived: ["in_consultation", "cancelled", "no_show"],
  in_consultation: ["completed"],
  rescheduled: ["confirmed", "patient_confirmed", "arrived", "cancelled", "no_show", "waiting_for_earlier_slot"],
  waiting_for_earlier_slot: ["confirmed", "patient_confirmed", "arrived", "rescheduled", "cancelled", "no_show"],
  completed: [],
  cancelled: [],
  no_show: []
});

function appointmentOccupiesSlot(status) {
  return OCCUPYING_STATUS_SET.has(String(status || ""));
}

function canTransitionAppointmentStatus(from, to) {
  if (from === to) return true;
  return (STATUS_TRANSITIONS[from] || []).includes(to);
}

function activeSlotKey(locationId, date, time) {
  return `${String(locationId)}|${String(date)}|${String(time)}`;
}

module.exports = {
  OCCUPYING_APPOINTMENT_STATUSES,
  NON_OCCUPYING_APPOINTMENT_STATUSES,
  STATUS_TRANSITIONS,
  appointmentOccupiesSlot,
  canTransitionAppointmentStatus,
  activeSlotKey
};
