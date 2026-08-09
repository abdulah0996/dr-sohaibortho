# Sprint 4 private medical-file deployment

Medical document bytes are stored outside the application and MongoDB. MongoDB contains only the report relationship and required metadata. Staff downloads are streamed by the authenticated API; the bucket and object keys must never be public.

## Provider requirements

Use a private S3-compatible bucket reachable from the Hostinger Node process. Create a dedicated application credential limited to `GetObject`, `PutObject`, and `DeleteObject` for the bucket's `medical-reports/` prefix. Disable public access, anonymous access, website hosting, and public bucket policies. Enable provider-side encryption, versioning, lifecycle/retention rules, access logging, and backups where available.

Local storage is development/test-only. Production startup rejects `STORAGE_PROVIDER=local`.

## Hostinger variables

Set these in Hostinger's protected environment configuration; do not commit their values:

```env
STORAGE_PROVIDER=s3
STORAGE_ENDPOINT=https://YOUR-S3-COMPATIBLE-ENDPOINT
STORAGE_REGION=YOUR-REGION
STORAGE_BUCKET=YOUR-PRIVATE-BUCKET
STORAGE_ACCESS_KEY_ID=your_storage_access_key
STORAGE_SECRET_ACCESS_KEY=your_storage_secret_key
STORAGE_MAX_UPLOAD_BYTES=10485760
STORAGE_SIGNED_URL_EXPIRY_SECONDS=300
```

`STORAGE_SIGNED_URL_EXPIRY_SECONDS` is reserved for a future signed-link mode. Sprint 4 uses authenticated backend streaming, so no signed object URL is exposed.

## Controlled deployment

1. Put report upload/review operations into maintenance mode.
2. Back up MongoDB, the deployed application, and existing Hostinger variables.
3. Create the private bucket and restricted application credential. Verify anonymous object access is denied.
4. Deploy the new code and run `npm ci --omit=dev`.
5. Add the storage variables above while preserving every Sprint 1–3 variable.
6. Run `npm run migrate:medical-files`. This quarantines legacy fake-URL records, removes their fake URL metadata, and creates the private-storage indexes. It does not pretend legacy files exist.
7. Restart the Node application and confirm `/api/health/ready` is healthy.
8. Complete the live checks below with synthetic clinic test files only.
9. Remove the synthetic reports through the admin interface and confirm the objects are gone.

## Manual verification

Use a newly created test patient and test appointment. Do not use a real patient's document.

1. Upload a small test PDF and watch the progress indicator reach completion.
2. Confirm the report appears in the staff directory without an object key or public URL.
3. In a private/incognito browser without authentication, request `/api/reports/REPORT-ID/download`; expect `401`.
4. Sign in as receptionist or clinic staff and request the same path; expect `403`.
5. Sign in as the doctor and download it; verify the bytes and filename are correct.
6. Try an EXE renamed to `.pdf`, a double-extension file, an empty file, and a file over the configured limit; each must be rejected without a report record.
7. Copy the underlying object URL from the provider console and request it anonymously; access must be denied.
8. Review the audit log for `report.uploaded` and `report.downloaded` without file contents or storage credentials.
9. As super admin, delete the report. Confirm the record is archived, the exact object is removed, another test report remains available, and `report.deleted` is audited.

## Rollback

Rollback application code and environment variables only after stopping uploads. Do not restore fake `fileUrl` values. If a rollback is unavoidable, keep the bucket private and retain the database backup so storage keys remain recoverable.
