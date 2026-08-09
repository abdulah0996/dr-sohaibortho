# Endpoint permission report

Generated from the executable endpoint policy and checked against every Express router by the integration suite. Aliased mounts are listed separately because they are independently reachable URLs.

| Method | Endpoint | Required access | Authorized staff roles |
|---|---|---|---|
| POST | `/api/auth/login` | Public, rate-limited | None |
| POST | `/api/auth/refresh` | Signed refresh cookie | None |
| POST | `/api/auth/logout` | Signed refresh cookie | None |
| GET | `/api/auth/me` | Any active staff account | super admin, doctor, receptionist, clinic staff |
| GET | `/api/auth/users` | users.manage | super admin |
| POST | `/api/auth/users` | users.manage | super admin |
| PATCH | `/api/auth/users/:id` | users.manage | super admin |
| GET | `/api/appointments/consent` | Public read-only | None |
| POST | `/api/appointments/consent/decision` | Public, rate-limited | None |
| POST | `/api/appointments` | Public, rate-limited | None |
| POST | `/api/appointments/lookup` | Patient phone + appointment ownership | None |
| POST | `/api/appointments/search` | Patient phone + appointment ownership | None |
| POST | `/api/appointments/reschedule` | Patient phone + appointment ownership | None |
| POST | `/api/appointments/cancel` | Patient phone + appointment ownership | None |
| POST | `/api/appointments/earlier-slot` | Patient phone + appointment ownership | None |
| POST | `/api/appointments/:id/confirm` | Patient phone + appointment ownership | None |
| POST | `/api/appointments/:id/reschedule` | Patient phone + appointment ownership | None |
| POST | `/api/appointments/:id/cancel` | Patient phone + appointment ownership | None |
| POST | `/api/appointments/:id/request-earlier` | Patient phone + appointment ownership | None |
| GET | `/api/appointments` | appointments.read | super admin, doctor, receptionist, clinic staff |
| POST | `/api/appointments/manual` | appointments.create | super admin, doctor, receptionist |
| POST | `/api/appointments/:id/owner-email/retry` | appointments.create | super admin, doctor, receptionist |
| PATCH | `/api/appointments/:id/reschedule` | appointments.create | super admin, doctor, receptionist |
| GET | `/api/appointments/:id` | appointments.read | super admin, doctor, receptionist, clinic staff |
| PATCH | `/api/appointments/:id/status` | appointments.status.clinical OR appointments.status.reception OR appointments.status.operational | super admin, doctor, receptionist, clinic staff |
| GET | `/api/availability/cities` | Public read-only | None |
| GET | `/api/availability/dates` | Public read-only | None |
| GET | `/api/availability/slots` | Public read-only | None |
| GET | `/api/availability/manage/:locationId` | availability.manage | super admin, receptionist |
| PUT | `/api/availability/schedule` | availability.manage | super admin, receptionist |
| POST | `/api/availability/block-date` | availability.manage | super admin, receptionist |
| POST | `/api/availability/unblock-date` | availability.manage | super admin, receptionist |
| POST | `/api/availability/block-slot` | availability.manage | super admin, receptionist |
| POST | `/api/availability/unblock-slot` | availability.manage | super admin, receptionist |
| GET | `/api/whatsapp/webhook` | Meta verify token | None |
| POST | `/api/whatsapp/webhook` | Meta HMAC signature | None |
| POST | `/api/whatsapp/simulate-message` | conversations.manage | super admin, doctor, receptionist, clinic staff |
| GET | `/api/whatsapp/conversations` | conversations.read | super admin, doctor, receptionist, clinic staff |
| GET | `/api/whatsapp/conversations/:phone/messages` | conversations.read | super admin, doctor, receptionist, clinic staff |
| POST | `/api/whatsapp/conversations/:phone/takeover` | conversations.manage | super admin, doctor, receptionist, clinic staff |
| POST | `/api/whatsapp/conversations/:phone/reactivate-ai` | conversations.manage | super admin, doctor, receptionist, clinic staff |
| POST | `/api/whatsapp/conversations/:phone/send` | conversations.manage | super admin, doctor, receptionist, clinic staff |
| GET | `/api/settings/clinic` | settings.read | super admin |
| PUT | `/api/settings/clinic` | settings.manage | super admin |
| GET | `/api/settings/doctor-profile` | settings.read | super admin |
| PUT | `/api/settings/doctor-profile` | doctor_profile.manage | super admin |
| GET | `/api/settings/audit-logs` | audit.read | super admin |
| GET | `/api/clinic-locations/public` | Public read-only | None |
| GET | `/api/clinic-locations/bookable` | Public read-only | None |
| GET | `/api/clinic-locations` | locations.read | super admin, doctor, receptionist, clinic staff |
| POST | `/api/clinic-locations` | locations.manage | super admin |
| PUT | `/api/clinic-locations/:id` | locations.manage | super admin |
| GET | `/api/clinics/public` | Public read-only | None |
| GET | `/api/clinics/bookable` | Public read-only | None |
| GET | `/api/clinics` | locations.read | super admin, doctor, receptionist, clinic staff |
| POST | `/api/clinics` | locations.manage | super admin |
| PUT | `/api/clinics/:id` | locations.manage | super admin |
| GET | `/api/doctors/dr-sohaib` | Public read-only | None |
| PUT | `/api/doctors/dr-sohaib` | doctor_profile.manage | super admin |
| GET | `/api/health` | Public health check | None |
| GET | `/api/health/email` | Public health check | None |
| GET | `/api/health/ready` | Public health check | None |
| GET | `/api/dashboard/summary` | dashboard.read | super admin, doctor, receptionist, clinic staff |
| GET | `/api/dashboard/recent-appointments` | dashboard.read + appointments.read | super admin, doctor, receptionist, clinic staff |
| GET | `/api/dashboard/recent-reports` | dashboard.read + reports.read | super admin, doctor, receptionist |
| GET | `/api/dashboard/recent-consultations` | dashboard.read + consultations.read | super admin, doctor, receptionist |
| GET | `/api/dashboard/emergency-alerts` | dashboard.read + emergencies.read | super admin, doctor, receptionist, clinic staff |
| POST | `/api/reports/upload` | Patient phone + appointment ownership | None |
| GET | `/api/reports` | reports.read | super admin, doctor, receptionist |
| GET | `/api/reports/appointment/:appointmentId` | reports.read | super admin, doctor, receptionist |
| GET | `/api/reports/:id/download` | reports.download | super admin, doctor |
| DELETE | `/api/reports/:id` | reports.delete | super admin |
| GET | `/api/reports/:id` | reports.read | super admin, doctor, receptionist |
| PUT | `/api/reports/:id/status` | reports.review | super admin, doctor |
| PATCH | `/api/reports/:id/status` | reports.review | super admin, doctor |
| POST | `/api/consultations` | Public, rate-limited | None |
| POST | `/api/consultations/request` | Public, rate-limited | None |
| GET | `/api/consultations` | consultations.read | super admin, doctor, receptionist |
| GET | `/api/consultations/:id` | consultations.read | super admin, doctor, receptionist |
| PUT | `/api/consultations/:id/status` | consultations.review OR consultations.schedule | super admin, doctor, receptionist |
| PATCH | `/api/consultations/:id/status` | consultations.review OR consultations.schedule | super admin, doctor, receptionist |
| PATCH | `/api/consultations/:id` | consultations.review OR consultations.schedule | super admin, doctor, receptionist |
| POST | `/api/online-consultations` | Public, rate-limited | None |
| POST | `/api/online-consultations/request` | Public, rate-limited | None |
| GET | `/api/online-consultations` | consultations.read | super admin, doctor, receptionist |
| GET | `/api/online-consultations/:id` | consultations.read | super admin, doctor, receptionist |
| PUT | `/api/online-consultations/:id/status` | consultations.review OR consultations.schedule | super admin, doctor, receptionist |
| PATCH | `/api/online-consultations/:id/status` | consultations.review OR consultations.schedule | super admin, doctor, receptionist |
| PATCH | `/api/online-consultations/:id` | consultations.review OR consultations.schedule | super admin, doctor, receptionist |
| POST | `/api/emergencies` | Public, rate-limited | None |
| GET | `/api/emergencies` | emergencies.read | super admin, doctor, receptionist, clinic staff |
| PATCH | `/api/emergencies/:id/resolve` | emergencies.resolve | super admin, doctor, receptionist |
| POST | `/api/emergency-alerts` | Public, rate-limited | None |
| GET | `/api/emergency-alerts` | emergencies.read | super admin, doctor, receptionist, clinic staff |
| PATCH | `/api/emergency-alerts/:id/resolve` | emergencies.resolve | super admin, doctor, receptionist |
| POST | `/api/conversations` | Public, rate-limited | None |
| GET | `/api/conversations` | conversations.read | super admin, doctor, receptionist, clinic staff |
| GET | `/api/conversations/:id` | conversations.read | super admin, doctor, receptionist, clinic staff |
| POST | `/api/conversations/:id/messages` | conversations.read + conversations.manage | super admin, doctor, receptionist, clinic staff |
| POST | `/api/conversations/:id/takeover` | conversations.read + conversations.manage | super admin, doctor, receptionist, clinic staff |
| POST | `/api/conversations/:id/reactivate-ai` | conversations.read + conversations.manage | super admin, doctor, receptionist, clinic staff |
| GET | `/api/patients` | patients.read.clinical OR patients.read.basic | super admin, doctor, receptionist, clinic staff |
| GET | `/api/patients/:id` | patients.read.clinical OR patients.read.basic | super admin, doctor, receptionist, clinic staff |
| POST | `/api/patients/:id/notes` | patients.notes.write | super admin, doctor, receptionist |
| GET | `/api/reminders` | reminders.read | super admin, doctor, receptionist, clinic staff |
| POST | `/api/reminders/follow-up` | reminders.manage | super admin, doctor, receptionist |
| PATCH | `/api/reminders/:id/status` | reminders.manage | super admin, doctor, receptionist |
| POST | `/api/reminders/:id/retry` | reminders.manage | super admin, doctor, receptionist |

## Enforcement notes

- An appointment ID alone never authorizes lookup, confirmation, cancellation, rescheduling, or report upload. Patient self-service routes require the matching phone number and appointment ownership.
- Medical download and report APIs are staff-only; private storage keys and permanent URLs are not returned.
- The WhatsApp callback is public only at Meta's required webhook paths: verification uses the verify token, while events require the raw-body HMAC signature.
- Public submission routes are rate-limited and return deliberately restricted response DTOs.
- The Super Admin wildcard is intentional. Other roles are evaluated against the permission names in the table, including combined dashboard/router requirements.
