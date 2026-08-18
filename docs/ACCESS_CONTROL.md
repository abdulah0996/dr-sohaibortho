# API access-control matrix

`super_admin`, `doctor`, `receptionist`, and `clinic_staff` are the only staff roles defined by the application. Public patient actions require the appointment ID and matching normalized phone number; an appointment ID alone is never authorization.

| API area | Public | Super Admin | Doctor | Receptionist | Clinic Staff |
|---|---|---|---|---|---|
| Health/readiness | Read non-sensitive state | Read | Read | Read | Read |
| Auth login/refresh/logout | Yes | Yes | Yes | Yes | Yes |
| Initial setup | No public endpoint; one-time server CLI only | N/A | No | No | No |
| Staff users | No | Manage | No | No | No |
| Public doctor/clinic profile | Read | Read | Read | Read | Read |
| Doctor/clinic configuration | No | Manage | No | No | No |
| Locations and availability | Read | Manage | Read | Manage availability | Read |
| Appointment create | Create; accepted public fields only | Create | Create | Create | No |
| Appointment self-service | Lookup/cancel/reschedule/request/confirm with ID + phone | Full | Full read; clinical statuses | Full read; reception statuses | Read; arrival/in-consultation statuses |
| Patients | No | Full | Clinical view and notes | Basic view and notes | Basic view |
| Medical reports | Submit metadata only; no listing | Read/review | Read/review | Read | No |
| Consultations | Submit | Read/review | Read/review | Read/schedule | No |
| Conversations | Submit handover request | Read/manage | Read/manage | Read/manage | Read/manage |
| Dashboard | No | Read | Read | Read | Read |
| Emergencies | Submit | Read/resolve | Read/resolve | Read/resolve | Read |
| Reminders | No | Read/manage | Read/manage | Read/manage | Read |
| Audit logs | No | Read | No | No | No |
| Meta webhook | Verification and signed callbacks only | N/A | N/A | N/A | N/A |

All access is enforced by server middleware in `src/middleware/permissions.js`. Frontend visibility is not treated as authorization.

## Endpoint-level matrix

`Verified patient` means a matching normalized appointment ID/token and phone number under the strict verification rate limiter. `Authenticated` means any active staff account, followed by the listed permission check.

| Method and path | Access |
|---|---|
| `GET /api/health`, `/api/health/ready`, `/api/health/email` | Public; non-sensitive health state only |
| `POST /api/auth/login`, `/api/auth/refresh`, `/api/auth/logout` | Public authentication flow |
| `GET /api/auth/me` | Authenticated |
| `GET,POST /api/auth/users`, `PATCH /api/auth/users/:id` | Super Admin |
| `GET /api/clinic-locations/public`, `/api/clinic-locations/bookable`, `/api/clinics/public`, `/api/clinics/bookable` | Public filtered location data |
| `GET /api/clinic-locations`, `/api/clinics` | Authenticated roles with `locations.read` |
| `POST /api/clinic-locations`, `/api/clinics`; `PUT /api/clinic-locations/:id`, `/api/clinics/:id` | Super Admin |
| `GET /api/availability/cities`, `/dates`, `/slots` | Public validated availability data |
| `POST /api/availability/block-date`, `/unblock-date`, `/block-slot`, `/unblock-slot` | Super Admin or Receptionist |
| `GET /api/doctors/dr-sohaib` | Public filtered doctor profile |
| `PUT /api/doctors/dr-sohaib` | Super Admin |
| `POST /api/appointments` | Public booking with consent and allowlisted fields |
| `POST /api/appointments/lookup`, `/search`, `/reschedule`, `/cancel`, `/earlier-slot` | Verified patient |
| `POST /api/appointments/:id/confirm`, `/:id/reschedule`, `/:id/cancel`, `/:id/request-earlier` | Verified patient |
| `GET /api/appointments`, `/api/appointments/:id` | Super Admin, Doctor, Receptionist, or Clinic Staff; Clinic Staff receives filtered fields |
| `POST /api/appointments/manual` | Super Admin, Doctor, or Receptionist |
| `PATCH /api/appointments/:id/reschedule` | Super Admin, Doctor, or Receptionist; atomic appointment engine |
| `PATCH /api/appointments/:id/status` | Role-specific status allowlist |
| `GET /api/dashboard/summary` | All staff roles |
| `GET /api/dashboard/recent-appointments` | Staff with appointment read access |
| `GET /api/dashboard/recent-reports` | Super Admin, Doctor, or Receptionist |
| `GET /api/dashboard/recent-consultations` | Super Admin, Doctor, or Receptionist |
| `GET /api/dashboard/emergency-alerts` | All staff roles |
| `POST /api/reports/upload` | Verified patient |
| `GET /api/reports`, `/api/reports/:id`, `/api/reports/appointment/:appointmentId` | Super Admin, Doctor, or Receptionist |
| `PUT,PATCH /api/reports/:id/status` | Super Admin or Doctor |
| `POST /api/consultations`, `/api/consultations/request` and online-consultation aliases | Public submission with allowlisted fields and filtered response |
| `GET /api/consultations`, `/api/consultations/:id` and aliases | Super Admin, Doctor, or Receptionist; receptionist receives filtered fields |
| `PUT,PATCH /api/consultations/:id`, `/:id/status` and aliases | Super Admin/Doctor review; Receptionist scheduling-only status subset |
| `POST /api/conversations` | Public rate-limited handover submission; does not pause an existing WhatsApp session |
| `GET /api/conversations`, `/api/conversations/:id` | All staff roles |
| `POST /api/conversations/:id/messages`, `/:id/takeover`, `/:id/reactivate-ai` | All staff roles with conversation-management permission |
| `GET /api/whatsapp/webhook` | Public Meta verification token flow |
| `POST /api/whatsapp/webhook` | Public only with valid Meta signature; duplicate messages/statuses are idempotent |
| `POST /api/whatsapp/simulate-message` | Authenticated conversation managers only |
| `GET /api/whatsapp/conversations`, `/conversations/:phone/messages` | All staff roles |
| `POST /api/whatsapp/conversations/:phone/takeover`, `/reactivate-ai`, `/send` | All staff roles with conversation-management permission |
| `GET /api/patients`, `/api/patients/:id` | Super Admin/Doctor clinical view; Receptionist/Clinic Staff filtered basic view |
| `POST /api/patients/:id/notes` | Super Admin, Doctor, or Receptionist |
| `POST /api/emergencies`, `/api/emergency-alerts` | Public rate-limited submission with filtered response |
| `GET /api/emergencies`, `/api/emergency-alerts` | All staff roles |
| `PATCH /api/emergencies/:id/resolve`, `/api/emergency-alerts/:id/resolve` | Super Admin, Doctor, or Receptionist |
| `GET /api/reminders` | All staff roles |
| `POST /api/reminders/follow-up`, `PATCH /api/reminders/:id/status` | Super Admin, Doctor, or Receptionist |
| `GET,PUT /api/settings/clinic`, `GET,PUT /api/settings/doctor-profile` | Super Admin |
| `GET /api/settings/audit-logs` | Super Admin |
