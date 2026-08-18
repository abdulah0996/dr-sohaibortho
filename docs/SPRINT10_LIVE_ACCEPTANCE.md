# Sprint 10 live production acceptance

## Decision

**NO-GO — pre-deployment stop conditions are active.**

Assessment time: 2026-08-09 20:17 PKT

Production acceptance readiness: **35%**. This percentage describes verified Sprint 10 production acceptance, not local code completion. The Sprint 9 release candidate remains fully green locally.

## Release and production identity

- Production URL: `https://mediumpurple-alpaca-357282.hostingersite.com`
- Current Hostinger deployment UUID: `019fd20e-65ad-7092-af3d-75da9cfb72ed`
- Current deployment completed: 2026-08-05 13:13:54 UTC
- Current GitHub `main` and local committed HEAD: `551d33a`
- Registered WhatsApp number: not exposed by available production tooling; live number test not started
- Sprint 1-9 release candidate: present locally but intentionally not deployed because backup/configuration gates failed

## Automated release-candidate evidence

- Passed: 101
- Failed: 0
- Skipped: 1 optional external-Mongo test because `MONGODB_INTEGRATION_URI` was not available
- 50-way concurrency: one active booking, 49 conflicts
- Dependency audit: zero production and zero full dependency vulnerabilities
- Secret/demo/source scans: passed locally
- Browser automation: 7/7 passed at mobile, tablet and desktop sizes

## Direct live findings

| Check | Result |
|---|---|
| Production frontend over HTTPS | Pass, HTTP 200 |
| HTTP to HTTPS | Pass, HTTP 301 |
| HSTS and nosniff | Pass |
| Readiness | **Fail, HTTP 503** |
| Database state | **Fail, `not_connected`** |
| Public `/src/config/env.js` | **Fail, source returned with HTTP 200** |
| Public `/server.js` | **Fail, source returned with HTTP 200** |
| Private appointment endpoint without authentication | Pass, HTTP 401 |
| Unknown CORS origin | Pass, HTTP 403 |
| Invalid Meta webhook signature | **Fail, HTTP 200 accepted** |
| Current deployment dependency audit | **Fail, build log reports one high-severity vulnerability** |
| Public page horizontal overflow | Pass at 390x844, 768x1024 and 1440x900 |

The current live deployment predates the hardened release candidate. The local release contains fixes for source exposure, webhook signatures, strict production configuration and current dependencies, but deploying it with incomplete environment variables would cause startup failure.

## Unverified mandatory gates

- Required Hostinger environment-variable names and valid production configuration
- Fresh production MongoDB backup
- Restore into a separate non-production database
- Production read-only account and duplicate-slot audits
- Approved migrations against production data
- All live registered-number WhatsApp tests
- Live role logins and permissions
- Production S3, SMTP, reminders, audit logs and monitoring
- Synthetic acceptance-data cleanup

## Required unblock actions

1. Restore production MongoDB connectivity and make `/api/health/ready` return 200 on the current release.
2. In Hostinger hPanel, verify every production variable name listed in `.env.example`; do not send values through chat.
3. Create a fresh database-provider snapshot and record its backup ID and UTC timestamp.
4. Restore that backup into a separate test database and provide safe access through `MONGODB_INTEGRATION_URI`, or provide evidence of the provider restore.
5. Confirm a test patient WhatsApp number is available for live acceptance after deployment.

## Rollback baseline

The pre-deployment rollback baseline is Hostinger deployment `019fd20e-65ad-7092-af3d-75da9cfb72ed` and Git commit `551d33a`. Do not restore a database over production. If the new release later fails, stop acceptance traffic, redeploy commit `551d33a`/the recorded Hostinger baseline, retain the new database backup, restart, and verify HTTPS plus readiness before reopening traffic.
