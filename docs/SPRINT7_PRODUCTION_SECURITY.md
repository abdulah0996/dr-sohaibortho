# Sprint 7 production security and Hostinger deployment

## Required production environment

Store values in Hostinger's environment-variable manager. Do not upload a production `.env` into the public application directory or commit it.

- Runtime: `NODE_ENV`, `PORT`, `TRUST_PROXY`
- Database: `MONGODB_URI` with an authenticated least-privilege database user
- Authentication: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `COOKIE_SECRET`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL_DAYS`
- Public URLs: `FRONTEND_URL`, `CORS_ORIGINS`, `ADMIN_PANEL_URL`
- Clinic: `CLINIC_TIMEZONE`, `CLINIC_CONTACT_NUMBER`, `DEFAULT_CLINIC_LOCATION_CODE`, `PUBLIC_WHATSAPP_NUMBER`
- Consent: `APPOINTMENT_CONSENT_TEXT`, `APPOINTMENT_CONSENT_VERSION`
- Meta: `WHATSAPP_GRAPH_VERSION`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_VERIFY_TOKEN`, `META_APP_SECRET` and all four WhatsApp template name/language pairs
- Email: `EMAIL_ENABLED=true`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USER`, `EMAIL_PASSWORD`, `EMAIL_FROM`, `EMAIL_FROM_NAME`, `OWNER_EMAIL`
- Private storage: `STORAGE_PROVIDER=s3`, `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_MAX_UPLOAD_BYTES`, `STORAGE_SIGNED_URL_EXPIRY_SECONDS`

Production validation requires HTTPS URLs, authenticated MongoDB, distinct strong application secrets, verified phone formats and HTTPS private storage. `TRUST_PROXY=1` is the expected starting value behind one Hostinger reverse proxy; confirm the actual proxy chain with Hostinger and change only to the verified hop count.

## Values the clinic administrator must verify

The application does not invent production replacements. Confirm these database/environment values before enabling bookings:

- Official clinic name, address, contact number and WhatsApp number
- Dr. Sohaib's exact display name, qualifications, specialty, experience, services, biography and approved profile image
- The BWP clinic record and its real contact details
- Whether Bahawalnagar and Rahim Yar Khan should remain Coming Soon, plus their final names, addresses and contacts
- Public website URL, admin URL and exact allowed CORS origins
- Owner notification recipient, sender name and sender address
- Meta number IDs, approved template names/languages and clinic consent wording/version

Doctor branding is stored in `DoctorProfile`; clinic identity, status and schedule are stored in `ClinicLocation`; service URLs, contacts and provider configuration are environment-controlled. Existing production database records are not overwritten by Sprint 7.

## Deployment

1. Record the current release identifier and take a verified MongoDB snapshot. Keep the previous application archive available outside the public web root.
2. Audit existing legacy demo accounts with `npm run audit:demo-accounts`. This command is read-only. Disable/remove only accounts confirmed as demo; do not bulk-delete staff.
3. Configure all required production variables in Hostinger. Generate three different authentication secrets using a cryptographically secure password manager.
4. Upload the release. Preserve private storage and do not upload `.env`, tests, `.git`, logs or database exports.
5. Run `npm ci --omit=dev` so the lock file controls production dependencies.
6. Start/restart the Node application. Startup must connect to MongoDB before it listens. Verify `/api/health/ready` over HTTPS.
7. If the staff collection is empty, temporarily set `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`, run `npm run bootstrap:admin`, then remove those three temporary variables immediately. The command cannot be reused after staff/bootstrap creation.
8. Verify HTTPS redirects/denials, allowed and denied CORS origins, secure refresh cookies, staff login, appointment booking, Meta callbacks, reminders, owner email and private-file download using test records only.
9. Confirm Hostinger restarts the process after a deliberate staging-process stop and that readiness becomes healthy only after MongoDB reconnects.

Hostinger normally provides the reverse proxy and process manager; Docker is not required. The included Docker configuration runs the application as a non-root user, binds its port to loopback and expects an external authenticated MongoDB URI. It contains no MongoDB service or published database port.

## Manual credential rotation

Sprint 7 does not rotate external credentials automatically. Rotate any credential that was previously committed, pasted into tickets/chats, shared with a developer, used by a demo deployment or exposed in logs:

- MongoDB database-user password
- JWT access secret, JWT refresh secret and cookie secret (this signs out active staff sessions)
- Meta permanent access token, app secret and webhook verification token
- SMTP password/API credential
- S3-compatible storage access key and secret
- Any previous bootstrap/setup token

Update Hostinger first according to each provider's safe overlap procedure, restart, verify, then revoke the old provider credential. Never place rotated values in a report or Git commit.

## Rollback

1. Stop the failed release from receiving traffic.
2. Restore the previous application archive and its matching lock file.
3. Keep the hardened secrets unless an older release requires a documented variable-name compatibility adjustment; never restore compromised credentials.
4. Restore the pre-deployment database snapshot only if a verified data migration caused corruption. Sprint 7 itself has no destructive migration.
5. Restart and verify HTTPS readiness, login, booking and private files before reopening traffic.

The one-time bootstrap lock is intentional production data. Do not remove it merely to retry bootstrap; investigate why the first staff record is missing and restore from backup or perform an authorized database recovery.
