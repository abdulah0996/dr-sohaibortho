const { ROLE_PERMISSIONS } = require("../middleware/permissions");

const STAFF_ROLES = Object.freeze(Object.keys(ROLE_PERMISSIONS));

function route(method, path, access, permissions = [], notes = "", permissionMode = "any") {
  return Object.freeze({ method, path, access, permissions: Object.freeze(permissions), notes, permissionMode });
}

const GROUPS = Object.freeze([
  {
    mounts: ["/api/auth"], module: "auth", routes: [
      route("POST", "/login", "public_limited", [], "Staff credentials; returns short-lived access token."),
      route("POST", "/refresh", "session_cookie", [], "Requires the signed HttpOnly refresh cookie."),
      route("POST", "/logout", "session_cookie", [], "Clears/revokes the refresh session when present."),
      route("GET", "/me", "staff_authenticated"),
      route("GET", "/users", "staff_permission", ["users.manage"]),
      route("POST", "/users", "staff_permission", ["users.manage"]),
      route("PATCH", "/users/:id", "staff_permission", ["users.manage"])
    ]
  },
  {
    mounts: ["/api/appointments"], module: "appointments", routes: [
      route("GET", "/consent", "public_read", [], "Published consent text and version only."),
      route("POST", "/consent/decision", "public_limited", [], "Records an explicit declined consent decision."),
      route("POST", "/", "public_limited", [], "Booking requires active consent and server-side availability."),
      route("POST", "/lookup", "patient_verified"), route("POST", "/search", "patient_verified"),
      route("POST", "/reschedule", "patient_verified"), route("POST", "/cancel", "patient_verified"),
      route("POST", "/earlier-slot", "patient_verified"), route("POST", "/:id/confirm", "patient_verified"),
      route("POST", "/:id/reschedule", "patient_verified"), route("POST", "/:id/cancel", "patient_verified"),
      route("POST", "/:id/request-earlier", "patient_verified"),
      route("GET", "/", "staff_permission", ["appointments.read"]),
      route("POST", "/manual", "staff_permission", ["appointments.create"]),
      route("POST", "/:id/owner-email/retry", "staff_permission", ["appointments.create"]),
      route("PATCH", "/:id/reschedule", "staff_permission", ["appointments.create"]),
      route("GET", "/:id", "staff_permission", ["appointments.read"]),
      route("PATCH", "/:id/status", "staff_permission", ["appointments.status.clinical", "appointments.status.reception", "appointments.status.operational"])
    ]
  },
  {
    mounts: ["/api/availability"], module: "availability", routes: [
      route("GET", "/cities", "public_read"), route("GET", "/dates", "public_read"), route("GET", "/slots", "public_read"),
      route("GET", "/manage/:locationId", "staff_permission", ["availability.manage"]),
      route("PUT", "/schedule", "staff_permission", ["availability.manage"]),
      route("POST", "/block-date", "staff_permission", ["availability.manage"]),
      route("POST", "/unblock-date", "staff_permission", ["availability.manage"]),
      route("POST", "/block-slot", "staff_permission", ["availability.manage"]),
      route("POST", "/unblock-slot", "staff_permission", ["availability.manage"])
    ]
  },
  {
    mounts: ["/api/whatsapp"], module: "whatsapp", routes: [
      route("GET", "/webhook", "meta_verification"), route("POST", "/webhook", "meta_signed"),
      route("POST", "/simulate-message", "staff_permission", ["conversations.manage"]),
      route("GET", "/conversations", "staff_permission", ["conversations.read"]),
      route("GET", "/conversations/:phone/messages", "staff_permission", ["conversations.read"]),
      route("POST", "/conversations/:phone/takeover", "staff_permission", ["conversations.manage"]),
      route("POST", "/conversations/:phone/reactivate-ai", "staff_permission", ["conversations.manage"]),
      route("POST", "/conversations/:phone/send", "staff_permission", ["conversations.manage"])
    ]
  },
  {
    mounts: ["/api/settings"], module: "settings", routes: [
      route("GET", "/clinic", "staff_permission", ["settings.read"]), route("PUT", "/clinic", "staff_permission", ["settings.manage"]),
      route("GET", "/doctor-profile", "staff_permission", ["settings.read"]), route("PUT", "/doctor-profile", "staff_permission", ["doctor_profile.manage"]),
      route("GET", "/audit-logs", "staff_permission", ["audit.read"])
    ]
  },
  {
    mounts: ["/api/clinic-locations", "/api/clinics"], module: "locations", routes: [
      route("GET", "/public", "public_read"), route("GET", "/bookable", "public_read"),
      route("GET", "/", "staff_permission", ["locations.read"]), route("POST", "/", "staff_permission", ["locations.manage"]),
      route("PUT", "/:id", "staff_permission", ["locations.manage"])
    ]
  },
  {
    mounts: ["/api/doctors"], module: "doctors", routes: [
      route("GET", "/dr-sohaib", "public_read"), route("PUT", "/dr-sohaib", "staff_permission", ["doctor_profile.manage"])
    ]
  },
  {
    mounts: ["/api/health"], module: "health", routes: [
      route("GET", "/", "public_health", [], "Connectivity status only; no credentials."),
      route("GET", "/email", "public_health", [], "Boolean configuration status only."),
      route("GET", "/ready", "public_health", [], "Load-balancer readiness; returns 503 without database.")
    ]
  },
  {
    mounts: ["/api/dashboard"], module: "dashboard", routes: [
      route("GET", "/summary", "staff_permission", ["dashboard.read"]),
      route("GET", "/recent-appointments", "staff_permission", ["dashboard.read", "appointments.read"], "", "all"),
      route("GET", "/recent-reports", "staff_permission", ["dashboard.read", "reports.read"], "", "all"),
      route("GET", "/recent-consultations", "staff_permission", ["dashboard.read", "consultations.read"], "", "all"),
      route("GET", "/emergency-alerts", "staff_permission", ["dashboard.read", "emergencies.read"], "", "all")
    ]
  },
  {
    mounts: ["/api/reports"], module: "reports", routes: [
      route("POST", "/upload", "patient_verified", [], "Multipart file plus appointment/phone ownership verification."),
      route("GET", "/", "staff_permission", ["reports.read"]), route("GET", "/appointment/:appointmentId", "staff_permission", ["reports.read"]),
      route("GET", "/:id/download", "staff_permission", ["reports.download"]), route("DELETE", "/:id", "staff_permission", ["reports.delete"]),
      route("GET", "/:id", "staff_permission", ["reports.read"]), route("PUT", "/:id/status", "staff_permission", ["reports.review"]),
      route("PATCH", "/:id/status", "staff_permission", ["reports.review"]),
      route("PUT", "/:id/notes", "staff_permission", ["reports.review"]),
      route("PATCH", "/:id/notes", "staff_permission", ["reports.review"])
    ]
  },
  {
    mounts: ["/api/consultations", "/api/online-consultations"], module: "consultations", routes: [
      route("POST", "/", "public_limited"), route("POST", "/request", "public_limited"),
      route("GET", "/", "staff_permission", ["consultations.read"]), route("GET", "/:id", "staff_permission", ["consultations.read"]),
      route("PUT", "/:id/status", "staff_permission", ["consultations.review", "consultations.schedule"]),
      route("PATCH", "/:id/status", "staff_permission", ["consultations.review", "consultations.schedule"]),
      route("PATCH", "/:id", "staff_permission", ["consultations.review", "consultations.schedule"])
    ]
  },
  {
    mounts: ["/api/emergencies", "/api/emergency-alerts"], module: "emergencies", routes: [
      route("POST", "/", "public_limited"), route("GET", "/", "staff_permission", ["emergencies.read"]),
      route("PATCH", "/:id/resolve", "staff_permission", ["emergencies.resolve"])
    ]
  },
  {
    mounts: ["/api/conversations"], module: "conversations", routes: [
      route("POST", "/", "public_limited"), route("GET", "/", "staff_permission", ["conversations.read"]),
      route("GET", "/:id", "staff_permission", ["conversations.read"]), route("POST", "/:id/messages", "staff_permission", ["conversations.read", "conversations.manage"], "", "all"),
      route("POST", "/:id/takeover", "staff_permission", ["conversations.read", "conversations.manage"], "", "all"),
      route("POST", "/:id/reactivate-ai", "staff_permission", ["conversations.read", "conversations.manage"], "", "all")
    ]
  },
  {
    mounts: ["/api/patients"], module: "patients", routes: [
      route("GET", "/", "staff_permission", ["patients.read.clinical", "patients.read.basic"]),
      route("GET", "/:id", "staff_permission", ["patients.read.clinical", "patients.read.basic"]),
      route("POST", "/:id/notes", "staff_permission", ["patients.notes.write"])
    ]
  },
  {
    mounts: ["/api/reminders"], module: "reminders", routes: [
      route("GET", "/", "staff_permission", ["reminders.read"]), route("POST", "/follow-up", "staff_permission", ["reminders.manage"]),
      route("PATCH", "/:id/status", "staff_permission", ["reminders.manage"]), route("POST", "/:id/retry", "staff_permission", ["reminders.manage"])
    ]
  }
]);

function normalizePath(value) {
  const normalized = value.replace(/\/{2,}/g, "/");
  return normalized.length > 1 ? normalized.replace(/\/$/, "") : normalized;
}

function rolesForPolicy(policy) {
  if (policy.access === "staff_authenticated") return [...STAFF_ROLES];
  if (policy.access !== "staff_permission") return [];
  return STAFF_ROLES.filter((role) => {
    const granted = ROLE_PERMISSIONS[role] || [];
    if (granted.includes("*")) return true;
    const method = policy.permissionMode === "all" ? "every" : "some";
    return policy.permissions[method]((permission) => granted.includes(permission));
  });
}

function expandEndpointPolicies() {
  return GROUPS.flatMap((group) => group.mounts.flatMap((mount) => group.routes.map((definition) => {
    const policy = { ...definition, module: group.module, path: normalizePath(`${mount}${definition.path}`) };
    return Object.freeze({ ...policy, roles: Object.freeze(rolesForPolicy(policy)) });
  })));
}

module.exports = { GROUPS, STAFF_ROLES, expandEndpointPolicies, normalizePath, rolesForPolicy };
