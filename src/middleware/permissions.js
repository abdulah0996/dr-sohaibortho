const { unauthorized, forbidden } = require("../utils/errors");

const ROLE_PERMISSIONS = Object.freeze({
  super_admin: ["*"],
  doctor: [
    "dashboard.read",
    "appointments.read",
    "appointments.create",
    "appointments.status.clinical",
    "patients.read.clinical",
    "patients.notes.write",
    "reports.read",
    "reports.download",
    "reports.review",
    "consultations.read",
    "consultations.review",
    "conversations.read",
    "conversations.manage",
    "emergencies.read",
    "emergencies.resolve",
    "reminders.read",
    "reminders.manage",
    "locations.read"
  ],
  receptionist: [
    "dashboard.read",
    "appointments.read",
    "appointments.create",
    "appointments.status.reception",
    "patients.read.basic",
    "patients.notes.write",
    "reports.read",
    "consultations.read",
    "consultations.schedule",
    "conversations.read",
    "conversations.manage",
    "emergencies.read",
    "emergencies.resolve",
    "reminders.read",
    "reminders.manage",
    "availability.manage",
    "locations.read"
  ],
  clinic_staff: [
    "dashboard.read",
    "appointments.read",
    "appointments.status.operational",
    "patients.read.basic",
    "conversations.read",
    "conversations.manage",
    "emergencies.read",
    "reminders.read",
    "locations.read"
  ]
});

const APPOINTMENT_STATUS_BY_ROLE = Object.freeze({
  super_admin: [
    "pending", "scheduled", "confirmed", "patient_confirmed", "arrived", "in_consultation",
    "completed", "cancelled", "no_show", "waiting_for_earlier_slot"
  ],
  doctor: ["confirmed", "patient_confirmed", "arrived", "in_consultation", "completed", "no_show"],
  receptionist: ["pending", "confirmed", "patient_confirmed", "arrived", "cancelled", "no_show", "waiting_for_earlier_slot"],
  clinic_staff: ["arrived", "in_consultation"]
});

function hasPermission(user, permission) {
  if (!user?.role) return false;
  const permissions = ROLE_PERMISSIONS[user.role] || [];
  return permissions.includes("*") || permissions.includes(permission);
}

function hasAnyPermission(user, ...permissions) {
  return permissions.some((permission) => hasPermission(user, permission));
}

function requirePermission(...permissions) {
  return (req, res, next) => {
    if (!req.user) return next(unauthorized());
    if (!hasAnyPermission(req.user, ...permissions)) {
      require("../services/auditService").audit({
        actorType: "staff",
        actorStaff: req.user._id,
        action: "permission.denied",
        entityType: "permission",
        entityId: permissions.join(","),
        metadata: { requiredPermissions: permissions },
        req
      }).catch(() => undefined);
      return next(forbidden());
    }
    return next();
  };
}

function canSetAppointmentStatus(user, status) {
  return (APPOINTMENT_STATUS_BY_ROLE[user?.role] || []).includes(status);
}

module.exports = {
  ROLE_PERMISSIONS,
  APPOINTMENT_STATUS_BY_ROLE,
  hasPermission,
  hasAnyPermission,
  requirePermission,
  canSetAppointmentStatus
};
