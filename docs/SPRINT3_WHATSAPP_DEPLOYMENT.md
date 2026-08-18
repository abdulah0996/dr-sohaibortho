# Sprint 3 WhatsApp deployment

## Template contracts

The approved Meta Utility templates must exactly match these environment names, languages and body-variable orders:

| Environment name | Variables in order |
|---|---|
| `WHATSAPP_TEMPLATE_APPOINTMENT_CONFIRMATION` | patient name, appointment ID, queue token, date, time, clinic name, address, contact |
| `WHATSAPP_TEMPLATE_APPOINTMENT_REMINDER` | patient name, appointment ID, date, time, clinic contact, management instruction |
| `WHATSAPP_TEMPLATE_RESCHEDULE_CONFIRMATION` | patient name, appointment ID, new date, new time, clinic name, queue token, contact |
| `WHATSAPP_TEMPLATE_CANCELLATION_CONFIRMATION` | patient name, appointment ID, cancelled date, cancelled time, clinic contact |

Each template has a matching `..._LANGUAGE` variable, normally `en_US`. Template names must contain only lowercase letters, numbers and underscores.

## Controlled deployment order

1. Back up MongoDB and the current Hostinger application/environment.
2. Complete the Sprint 2 appointment migration before accepting booking traffic.
3. Deploy the new application files and run `npm ci`.
4. Set every WhatsApp variable listed in `.env.example` using the existing registered number and Meta application. Never place credentials in source control.
5. Run `npm run migrate:whatsapp-delivery`. It backfills deterministic delivery event IDs, converts legacy `sent_to_meta` values to `queued`, and verifies WhatsApp/delivery/reminder indexes. It does not delete messages.
6. Restart the Node application and verify health/readiness.
7. Confirm the Meta webhook URL and verify token still match Hostinger.
8. Perform the live registered-number checklist in the completion report.

An accepted Graph API send remains `queued`. Only signed Meta delivery webhooks may advance it to `sent`, `delivered`, or `read`.
