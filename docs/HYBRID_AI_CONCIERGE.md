# Hybrid AI patient concierge

## Safety boundary

The OpenAI Responses API receives only the current patient message, the clinic timezone, and the current date. It returns one strict JSON object containing intent and patient-supplied facts. It never receives phone numbers, database records, family profiles, report contents, media IDs, API credentials, or internal tool output.

All operational actions use server-side validated tools:

- `get_available_slots`
- `create_appointment`
- `lookup_verified_appointment`
- `reschedule_appointment`
- `cancel_appointment`
- `get_clinic_information`
- `get_visit_status`
- `request_staff_handoff`

Booking, rescheduling, and cancellation schemas require literal explicit-confirmation fields. The existing appointment service retains idempotency, active-slot uniqueness, consent, schedule checks, reminders, and audit behavior.

## Patient workflow

1. A greeting receives a short text welcome, not a menu.
2. Natural text or a securely downloaded voice-note transcript enters the same workflow.
3. Supplied facts are retained; only missing booking facts are requested.
4. Availability is read from MongoDB through the existing availability service.
5. The patient confirms appointment details and consent.
6. PDF, JPEG, and PNG reports are optionally stored in private storage without AI processing.
7. A patient-provided visit summary is shown for approval. Only the approved version is attached to the appointment.
8. One appointment is created through the existing idempotent appointment engine and a compact visit pass is sent.
9. An approved doctor audio/video welcome is sent once when configured; otherwise it is skipped.

Appointment lookup by ID plus WhatsApp-number ownership is required before natural-language cancellation, rescheduling, or visit status. Human handoff pauses automation. Emergency and medical-advice classifications stop ordinary booking.

## Configuration

Use only the variable names in `.env.example`. Keep `OPENAI_API_KEY` in the server environment. The conversational and transcription models are configured independently. SDK request timeouts, bounded retries, and per-minute interpretation limits are configurable.

Set `AI_CONCIERGE_ENABLED=false` for an immediate application-level rollback to the prior deterministic menu orchestrator. This flag does not alter appointments or patient data.

Doctor welcome and current-day delay data are configured through the authenticated clinic settings endpoint. Delay data is used only when its effective date matches the appointment date. Smart arrival messages require an approved Meta template configured by name.

## Privacy and monitoring

Voice audio is held in memory only for validation and transcription. Raw audio and full voice transcripts are not stored or logged. Uploaded report contents are never sent to OpenAI. Monitoring records outcome, latency, token counts, audio byte count, and a coarse confidence bucket without patient text.

## Deployment gates

Do not enable production traffic until the complete local suite, dependency and secret scans, staging workflows, restored-backup verification, production readiness, registered-number voice/report workflows, webhook signature rejection, source-file denial, and rollback checks pass. Use synthetic patient data for staging and live acceptance.
