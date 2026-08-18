const { connectDatabase, disconnectDatabase } = require("../src/config/db");
const { logError } = require("../src/utils/safeLogger");
const { AuditLog, MessageDeliveryStatus, WhatsAppMessage } = require("../src/models");

async function main() {
  await connectDatabase();
  await Promise.all([
    AuditLog.createIndexes(),
    MessageDeliveryStatus.createIndexes(),
    WhatsAppMessage.createIndexes()
  ]);
  console.log("Sprint 1 security indexes created successfully.");
  await disconnectDatabase();
}

main().catch(async (error) => {
  logError("Security index migration failed", error);
  await disconnectDatabase().catch(() => undefined);
  process.exitCode = 1;
});
