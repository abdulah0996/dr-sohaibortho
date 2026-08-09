# Sprint 5 clinic schedule deployment

`ClinicLocation` is the only authoritative schedule and availability record. Each location stores its status, timezone, seven weekly day records, slot duration, same-day cutoff, blocked dates, and blocked slots. `ClinicSettings` retains non-schedule settings only; its legacy clinic endpoint reads and writes the BWP `ClinicLocation` for compatibility.

## Controlled Hostinger deployment

1. Temporarily pause schedule administration and new bookings.
2. Back up MongoDB, the deployed application, and Hostinger environment variables.
3. Deploy the Sprint 5 application files and run `npm ci --omit=dev`.
4. Before restarting the public application, run `npm run migrate:clinic-schedules` against the production database.
5. Confirm the migration reports a verified BWP schedule, two Coming Soon clinics, and the schedule index.
6. Restart the Node application and verify `/api/health/ready` returns HTTP 200.
7. Sign in as an authorized administrator and complete the manual checks below.

The migration:

- retains a valid existing location schedule;
- supplies the Monday–Thursday 16:30–20:30, 15-minute default when BWP schedule data is missing or invalid;
- keeps BWN and RYK as `Coming Soon`;
- converts legacy disabled flags to `Inactive`;
- normalizes and deduplicates blocked dates and slots;
- removes schedule fields from `ClinicSettings` and obsolete location flags; and
- creates the authoritative status/display-order index.

It does not delete or cancel appointments.

## Manual verification

Use a future test week and synthetic patients only.

1. Open Weekly Schedule as super admin or receptionist. Change one day's hours, save, restart the application, and confirm the same values remain.
2. Restore BWP to Monday–Thursday, 16:30–20:30 with 15-minute slots.
3. Block an empty future slot. Confirm it is marked blocked in the public availability API and absent from website and WhatsApp choices.
4. Attempt website, WhatsApp, staff, and reschedule bookings for that slot; each must be rejected.
5. Unblock it and confirm it becomes available immediately.
6. Block a full future date and confirm no slots or bookings are allowed for that date.
7. Confirm Friday–Sunday remain closed.
8. Confirm BWN and RYK are visible as Coming Soon but cannot be booked.
9. Mark a test location Inactive and confirm it cannot be booked.
10. Create a synthetic appointment, then try to block its slot. Confirm the first request returns a conflict requiring confirmation and the patient appointment remains unchanged.
11. Confirm explicitly, then verify the block is stored while the appointment remains booked and is not cancelled or deleted.
12. Select BWP and the test date on the dashboard. Compare total, booked, available, blocked, and cancelled counts with the schedule and appointment list.
13. Review audit logs for `availability.schedule_updated`, `availability.slot_blocked`, `availability.slot_unblocked`, `availability.date_blocked`, and `availability.date_unblocked` with the correct staff actor.

## Rollback

Pause schedule writes before rollback. Restore the database backup if the old application requires removed legacy flags. Do not run old and new schedule writers against the same database simultaneously.
