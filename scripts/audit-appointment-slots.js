const { connectDatabase, disconnectDatabase } = require("../src/config/db");
const { logError } = require("../src/utils/safeLogger");
const { auditActiveSlotData } = require("../src/services/appointmentMigrationService");

async function main() {
  await connectDatabase({ autoIndex: false });
  const report = await auditActiveSlotData();
  console.log(JSON.stringify(report, null, 2));
  if (report.duplicateSlotCount || report.invalidRecordCount) process.exitCode = 2;
  await disconnectDatabase();
}

main().catch(async (error) => {
  logError("Appointment slot audit failed", error);
  await disconnectDatabase().catch(() => undefined);
  process.exitCode = 1;
});
