# Sprint 9 QA report

## Decision

Sprint 9 automated QA is complete. The repository is ready for final live acceptance testing, but it is not approved for client launch until Sprint 10 verifies the deployed Hostinger environment and registered Meta number. No critical or high-severity defect remains in the tested code paths.

## Results

- Passed: 101
- Failed: 0
- Skipped: 1 optional external-Mongo connection test (`MONGODB_INTEGRATION_URI` was not supplied)
- Endpoint inventory: 108 reachable method/path combinations, including aliases
- Concurrency: 50 simultaneous claims for one slot produced 1 active appointment and 49 clean conflicts
- Browser: Chromium passed public portal, staff login/dashboard, and control containment at 390x844, 768x1024, and 1440x900; a complete mobile website booking also passed
- Dependency audits: 0 production vulnerabilities; 0 full-tree vulnerabilities
- Secret and legacy/demo scans: passed
- Syntax: 86 JavaScript files passed parsing
- Recovery: readiness returned 503 without MongoDB; a synthetic backup restored documents, references, and indexes into a separate empty database; overwrite protection passed

The complete route matrix is in `docs/ENDPOINT_PERMISSION_REPORT.md`.

## Defects found and fixed

1. Direct staff deep links such as `/admin/login` were blank because CSS and JavaScript used relative asset URLs. Assets are now root-relative.
2. The staff layout had no mobile breakpoint. Dashboard columns, filters, controls, tables, navigation, and toasts are now contained and touch-usable.
3. The website offered hardcoded August 3-6, 2026 appointment dates and hardcoded time buttons. Website booking and patient rescheduling now request current database-backed dates and available slots.
4. The async consent statement completed without re-rendering the booking review. The review now renders when consent has loaded.
5. The existing private-route test was an example list rather than a complete inventory. A checked endpoint policy now covers every mounted Express route and all four staff roles.
6. WhatsApp invalid/expired conversation selections and email retry deduplication lacked explicit proof. Tests now cover them.

## Sprint 9 files

- `.github/workflows/ci.yml`
- `.gitignore`
- `index.html`, `script.js`, `style.css`
- `package.json`, `package-lock.json`, `playwright.config.js`
- `src/security/endpointPolicy.js`
- `src/services/recoveryVerificationService.js`
- `scripts/generate-endpoint-permission-report.js`
- `tests/security.integration.test.js`
- `tests/whatsapp.test.js`
- `tests/notifications-consent-audit.test.js`
- `tests/recovery-readiness.test.js`
- `tests/browser/responsive.spec.js`
- `tests/support/browser-server.js`
- `docs/ENDPOINT_PERMISSION_REPORT.md`

## Repeat commands

```text
npm ci
npm run check:syntax
npm run scan:secrets
npm run scan:dummy
npm audit --omit=dev --audit-level=high
npm test
npm run test:integration
npm run test:appointment-engine
npm run test:appointment-migration
npm run test:whatsapp
npm run test:medical-files
npm run test:schedules
npm run test:notifications
npm run test:production-security
npm run test:recovery
npx playwright install chromium
npm run test:browser
```

To run the skipped external database check, provide a non-production disposable database through `MONGODB_INTEGRATION_URI` and rerun `npm run test:integration`. Never use the live patient database for automated tests.

## Sprint 10 live acceptance gates

1. Run the external database test against an isolated Hostinger-compatible test database.
2. Deploy the exact release, run all migrations and verify production startup/readiness over HTTPS.
3. Send and receive real WhatsApp text, buttons, lists, approved templates, reminders, delivery/read/failure callbacks, cancellation, and rescheduling through the registered number.
4. Verify the actual Meta app, phone-number ID, WABA, webhook URL/token/signature, and approved template languages without exposing credentials.
5. Upload/download/delete synthetic files through the production private S3-compatible bucket and confirm anonymous access is denied.
6. Verify real SMTP owner-email delivery/retry and the production scheduler/process-restart behavior.
7. Perform and document a provider backup plus restore into a separate non-production database.
8. Run mobile acceptance on physical iOS/Android devices and supported browsers.
9. Confirm the new CI workflow passes on the remote repository and review the Hostinger logs for redaction.
10. Remove synthetic acceptance records, record sign-off, and only then open client traffic.
