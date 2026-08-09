const { config } = require("./src/config/env");
const { connectDatabase, disconnectDatabase } = require("./src/config/db");
const { createApp } = require("./src/app");
const { startReminderScheduler, stopReminderScheduler } = require("./src/services/reminderService");
const { startOwnerEmailScheduler, stopOwnerEmailSchedulerForTests } = require("./src/services/ownerEmailOutboxService");
const { StaffUser, ClinicLocation } = require("./src/models");
const { logError } = require("./src/utils/safeLogger");

async function inspectInitialData() {
  const [staffCount, locationCount] = await Promise.all([
    StaffUser.countDocuments(),
    ClinicLocation.countDocuments()
  ]);
  return { staffCount, locationCount };
}

async function startServer(dependencies = {}) {
  const connect = dependencies.connectDatabase || connectDatabase;
  const disconnect = dependencies.disconnectDatabase || disconnectDatabase;
  const appFactory = dependencies.createApp || createApp;
  const inspect = dependencies.inspectInitialData || inspectInitialData;

  // Production never accepts traffic until its real database is connected.
  await connect();
  const initialData = await inspect();
  if (initialData.staffCount === 0) console.warn("No staff accounts exist. Run the one-time Super Admin bootstrap command.");
  if (initialData.locationCount === 0) console.warn("No clinic locations exist. Configure verified clinic details before accepting bookings.");

  const app = appFactory();
  const host = "0.0.0.0";
  const port = config.port;
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(port, host, () => resolve(listener));
    listener.once("error", reject);
  });

  startReminderScheduler();
  startOwnerEmailScheduler();
  console.log(`Appointment system started on port ${port}.`);

  let shuttingDown = false;
  async function shutdown(signal = "shutdown", exitCode = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received. Closing application services.`);
    stopReminderScheduler();
    stopOwnerEmailSchedulerForTests();
    const forced = setTimeout(() => {
      server.closeAllConnections?.();
    }, 10_000);
    forced.unref?.();
    await new Promise((resolve) => server.close(resolve));
    clearTimeout(forced);
    await disconnect();
    if (dependencies.exitOnShutdown !== false) process.exit(exitCode);
  }

  return { app, server, shutdown, initialData };
}

async function main() {
  let runtime;
  try {
    runtime = await startServer();
  } catch (error) {
    logError("Application startup failed", error);
    await disconnectDatabase().catch(() => undefined);
    process.exitCode = 1;
    return;
  }

  process.once("SIGTERM", () => runtime.shutdown("SIGTERM"));
  process.once("SIGINT", () => runtime.shutdown("SIGINT"));
  process.once("uncaughtException", (error) => {
    logError("Uncaught application error", error);
    runtime.shutdown("uncaughtException", 1);
  });
  process.once("unhandledRejection", (error) => {
    logError("Unhandled promise rejection", error);
    runtime.shutdown("unhandledRejection", 1);
  });
}

if (require.main === module) main();

module.exports = { inspectInitialData, startServer, main };
