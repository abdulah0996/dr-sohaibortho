# Dr. Sohaib WhatsApp Appointment System

Node.js, Express, MongoDB and Meta WhatsApp Cloud API appointment and clinic-management system. Website and WhatsApp bookings share the same database-backed availability and appointment engine.

## Local development

Requirements: Node.js 18+, npm and MongoDB.

```powershell
Copy-Item .env.example .env
npm ci
npm test
npm start
```

The local application and health endpoint are available at `http://localhost:3000` and `http://localhost:3000/api/health`.

The destructive fictional-data seed is never run by startup and is restricted to development/test. To run it deliberately, set `NODE_ENV=development`, a strong `DEMO_SEED_PASSWORD`, and `DEMO_SEED_CONFIRM=ERASE_LOCAL_DEMO_DATA`, then run `npm run seed:demo`. Never point this command at production.

## First production administrator

Application startup never creates staff accounts. With the complete production environment configured, temporarily set `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL`, and a unique strong `BOOTSTRAP_ADMIN_PASSWORD`, then run:

```text
npm run bootstrap:admin
```

The command works only while the staff collection is empty and records a one-time database lock. Remove the temporary `BOOTSTRAP_ADMIN_*` values immediately afterward.

To identify known legacy demo accounts without modifying them, run `npm run audit:demo-accounts`. Review the result and disable or remove only confirmed demo accounts through an authorized administrative process.

## Production

Production requires authenticated MongoDB, HTTPS frontend/CORS/admin URLs, three distinct authentication secrets, Hostinger proxy configuration, verified clinic contact values, Meta template credentials, SMTP settings and private S3-compatible storage. See `.env.example` for variable names and [the Sprint 7 deployment guide](docs/SPRINT7_PRODUCTION_SECURITY.md) for deployment and rollback.

Clinic locations, schedules and doctor branding are database-controlled. Verify every clinic, contact number, doctor credential, email identity and Coming Soon location before launch.
