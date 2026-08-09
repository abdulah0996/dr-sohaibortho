const { connectDatabase, disconnectDatabase } = require("../src/config/db");
const { logError } = require("../src/utils/safeLogger");
const { Appointment, BookingRequest } = require("../src/models");
const { auditActiveSlotData, backfillActiveSlotKeys } = require("../src/services/appointmentMigrationService");

async function main() {
  await connectDatabase({ autoIndex: false });
  const before = await auditActiveSlotData();
  console.log(JSON.stringify(before, null, 2));
  if (before.duplicateSlotCount || before.invalidRecordCount) {
    throw new Error("Migration stopped: resolve the reported duplicate or invalid active appointments first.");
  }
  const updated = await backfillActiveSlotKeys();
  await Appointment.collection.createIndex(
    { activeSlotKey: 1 },
    { unique: true, sparse: true, name: "uniq_active_appointment_slot" }
  );
  await BookingRequest.collection.createIndex(
    { key: 1 },
    { unique: true, name: "uniq_booking_request_key" }
  );
  await Appointment.collection.createIndex(
    { idempotencyKey: 1 },
    { unique: true, sparse: true, name: "uniq_appointment_idempotency" }
  );
  const indexes = await Appointment.collection.indexes();
  const requestIndexes = await BookingRequest.collection.indexes();
  console.log(JSON.stringify({
    updatedAppointments: updated,
    verifiedIndexes: [...indexes, ...requestIndexes].filter((index) => index.name.startsWith("uniq_"))
  }, null, 2));
  await disconnectDatabase();
}

main().catch(async (error) => {
  logError("Appointment engine migration failed", error);
  await disconnectDatabase().catch(() => undefined);
  process.exitCode = 1;
});
