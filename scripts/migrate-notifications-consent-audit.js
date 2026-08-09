const { connectDatabase, disconnectDatabase } = require("../src/config/db");
const { logError } = require("../src/utils/safeLogger");
const { Appointment, ClinicSettings, EmailNotificationOutbox, PatientConsent, ReminderJob } = require("../src/models");

async function migrate() {
  await connectDatabase();
  const summary = { settings: 0, consents: 0, reminders: 0, emailJobs: 0 };

  const settings = await ClinicSettings.updateMany(
    { remindersEnabled: { $exists: false } },
    { $set: { remindersEnabled: true } }
  );
  summary.settings = settings.modifiedCount;

  const consents = await PatientConsent.updateMany(
    { consentTextVersion: { $exists: false } },
    { $set: { consentTextVersion: "legacy-unverified" } }
  );
  summary.consents = consents.modifiedCount;

  const reminders = await ReminderJob.find().sort({ createdAt: 1 });
  const seenReminders = new Set();
  for (const reminder of reminders) {
    if (!["pending", "processing", "queued", "sent", "delivered", "read", "failed", "cancelled"].includes(reminder.status)) reminder.status = "pending";
    if (reminder.type === "follow_up_reminder" && !String(reminder.message || "").trim()) {
      reminder.status = "cancelled";
      reminder.lastError = "Legacy follow-up had no message and was cancelled during migration.";
    }
    if (reminder.appointment && reminder.type === "appointment_reminder") {
      const appointment = await Appointment.findById(reminder.appointment).select("appointmentId rescheduleCount").lean();
      reminder.scheduleRevision = Number(appointment?.rescheduleCount || 0);
      if (!String(reminder.message || "").trim()) reminder.message = `Appointment reminder for ${appointment?.appointmentId || reminder.appointment}`;
      const key = `${reminder.appointment}|${reminder.intervalMinutes}|${reminder.scheduleRevision}`;
      if (seenReminders.has(key)) {
        reminder.status = "cancelled";
        reminder.scheduleRevision = -parseInt(String(reminder._id).slice(-6), 16);
        reminder.lastError = "Duplicate legacy reminder cancelled during migration.";
      }
      seenReminders.add(key);
    }
    await reminder.save({ validateBeforeSave: false });
    summary.reminders += 1;
  }

  const emailJobs = await EmailNotificationOutbox.find().sort({ createdAt: 1 });
  const seenEmail = new Set();
  for (const job of emailJobs) {
    const canonical = `appointment:${job.appointmentId}:booked:${String(job.recipient || "").toLowerCase()}`;
    if (seenEmail.has(canonical)) {
      job.dedupeKey = `legacy-duplicate:${job._id}`;
      if (job.status !== "sent") {
        job.status = "failed";
        job.failureCode = "LEGACY_DUPLICATE";
        job.failureMessageSafe = "Duplicate legacy notification suppressed during migration.";
      }
    } else {
      job.dedupeKey = canonical;
      seenEmail.add(canonical);
    }
    await job.save({ validateBeforeSave: false });
    summary.emailJobs += 1;
  }

  await Promise.all([ReminderJob.syncIndexes(), EmailNotificationOutbox.syncIndexes()]);
  console.log("Sprint 6 migration completed", summary);
}

migrate()
  .catch((error) => {
    logError("Sprint 6 migration failed", error);
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());
