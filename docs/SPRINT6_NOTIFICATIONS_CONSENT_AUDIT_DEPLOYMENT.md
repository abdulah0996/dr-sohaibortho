# Sprint 6 deployment and verification

## Required configuration

Set these in Hostinger's environment configuration. Never commit their real values.

```dotenv
CLINIC_TIMEZONE=Asia/Karachi
APPOINTMENT_CONSENT_TEXT=The clinic will use your information for appointment management, reminders, rescheduling, and clinic communications.
APPOINTMENT_CONSENT_VERSION=appointment-consent-v1
WHATSAPP_TEMPLATE_APPOINTMENT_REMINDER=approved_meta_template_name
WHATSAPP_TEMPLATE_APPOINTMENT_REMINDER_LANGUAGE=en_US

EMAIL_ENABLED=true
EMAIL_HOST=smtp.provider.example
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=
EMAIL_PASSWORD=
EMAIL_FROM=notifications@example.com
EMAIL_FROM_NAME=Dr. Sohaib Clinic
OWNER_EMAIL=owner@example.com
```

If owner emails are not ready, set `EMAIL_ENABLED=false`. Booking remains available and the health endpoint reports email as disabled.

## Deployment order

1. Take a MongoDB provider snapshot/backup and record the current deployed release identifier.
2. Upload the Sprint 6 release without replacing the production `.env` or private medical-file storage.
3. Run `npm ci --omit=dev`.
4. Run `npm run migrate:notifications-consent-audit` once. Review only the non-sensitive counts it prints.
5. Restart the Node.js application and confirm `GET /api/health` and `GET /api/health/email`.
6. Confirm the application log reports that background schedulers started. It must not print credentials.

## Manual verification with test records only

1. In settings, enable reminders and save two short future test intervals. Reload the page and confirm they persist.
2. Book a test appointment far enough in the future. Confirm its reminder jobs are `pending`, then `queued` after Meta accepts them, and `sent` only after the Meta status callback.
3. Reschedule the test appointment. Confirm old jobs are cancelled and only the new-time jobs remain pending.
4. Cancel the test appointment and confirm no reminder is delivered.
5. On the website and WhatsApp, decline consent once. Confirm no appointment exists and a versioned false consent decision is stored. Then explicitly accept and confirm the accepted record uses the same displayed version.
6. Book one test appointment and confirm exactly one owner-email outbox item and one owner email. Temporarily use a safe invalid SMTP test configuration to verify booking still succeeds and the job records a retry/failure.
7. Inspect the audit entry for the test booking, reminder retry, schedule update and login. Confirm actor/target, IP, user agent and safe summaries exist without tokens, passwords or message/file content.

After testing, restore the clinic's intended reminder intervals and remove only the test appointments through the normal authorized workflow.
