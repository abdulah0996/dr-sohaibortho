# Sprint 2 appointment-engine migration

The application uses `activeSlotKey = <clinic ObjectId>|<local YYYY-MM-DD>|<HH:mm>` only while an appointment has an occupying status. MongoDB uniquely indexes this sparse field, so cancelled, completed and no-show history remains intact while no two active records can claim the same clinic slot.

## Required production order

1. Stop booking writes or place the application in maintenance mode.
2. Take a verified MongoDB backup.
3. Run `npm run audit:appointment-slots`. This command is read-only and exits non-zero for duplicate or invalid active records.
4. If duplicates are reported, have clinic staff choose the genuine appointment to retain. Reconcile exactly one reported group at a time with:

   `npm run reconcile:appointment-slots -- --keep=DS-2026-0001 --cancel=DS-2026-0002 --confirm=RECONCILE_DUPLICATE_SLOT`

   The command refuses partial groups, preserves every record, marks only the explicitly listed records cancelled, records why, cancels reminders, recalculates queue tokens and writes audit events.
5. Rerun `npm run audit:appointment-slots` until it reports zero duplicates and zero invalid records.
6. Run `npm run migrate:appointment-engine`. It backfills normalized active-slot fields and creates/verifies:

   - `uniq_active_appointment_slot` on `appointments.activeSlotKey` (`unique`, `sparse`)
   - `uniq_appointment_idempotency` on `appointments.idempotencyKey` (`unique`, `sparse`)
   - `uniq_booking_request_key` on `bookingrequests.key` (`unique`)

7. Deploy/restart the application, restore booking traffic and perform the documented live smoke tests.

Do not run reconciliation without the clinic's explicit record-level decision. The migration never deletes appointments.

## Rescheduling consistency

The slot claim, location, local date/time, status and embedded history entry are changed in one MongoDB document update. MongoDB's unique slot index arbitrates concurrent destination claims. This does not require a multi-document transaction: if the destination key conflicts, MongoDB rejects the whole update and the old appointment remains unchanged. The legacy history collection, audit log, reminders and queue-token refresh are follow-up projections; the authoritative embedded history and slot state cannot be partially moved.
