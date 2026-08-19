const http = require("http");

let config;
let connectDatabase;
let disconnectDatabase;
let createApp;
let startReminderScheduler;
let stopReminderScheduler;
let startOwnerEmailScheduler;
let stopOwnerEmailSchedulerForTests;
let StaffUser;
let ClinicLocation;
let logError;
let bootstrapError;

try {
  ({ config } = require("./src/config/env"));
  ({ connectDatabase, disconnectDatabase } = require("./src/config/db"));
  ({ createApp } = require("./src/app"));
  ({ startReminderScheduler, stopReminderScheduler } = require("./src/services/reminderService"));
  ({ startOwnerEmailScheduler, stopOwnerEmailSchedulerForTests } = require("./src/services/ownerEmailOutboxService"));
  ({ StaffUser, ClinicLocation } = require("./src/models"));
  ({ logError } = require("./src/utils/safeLogger"));
} catch (error) {
  bootstrapError = error;
}

function safeBootstrapReason(error) {
  const message = String(error?.message || "");
  if (/^Missing required production environment variable: [A-Z0-9_ ]+$/.test(message)) return message;
  if (/^Invalid production environment variable: [A-Z0-9_]+$/.test(message)) return message;
  if (/^Production (?:authentication|WhatsApp) secrets must /.test(message)) return message;
  if (/^Unsafe production TLS configuration/.test(message)) return message;
  return "Production configuration could not be validated.";
}

function startRestrictedBootstrapServer(error) {
  const reason = safeBootstrapReason(error);
  const port = Number(process.env.PORT) || 3000;
  const server = http.createServer((req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.statusCode = 503;
    res.end(JSON.stringify({ success: false, status: "configuration_error", reason }));
  });
  server.listen(port, "0.0.0.0", () => console.error("Restricted startup mode.", { reason }));
  return server;
}

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

  const app = appFactory();
  const host = "0.0.0.0";
  const port = config.port;
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(port, host, () => resolve(listener));
    listener.once("error", reject);
  });

  console.log(`Appointment system listening on port ${port}.`);
  let stopped = false;
  let retryTimer;
  let backgroundStarted = false;
  let initialData = { staffCount: 0, locationCount: 0 };

  const databaseReady = (async function connectWithRetry() {
    let attempt = 0;
    while (!stopped) {
      attempt += 1;
      try {
        await connect();
        initialData = await inspect();
        if (initialData.staffCount === 0) console.warn("No staff accounts exist. Run the one-time Super Admin bootstrap command.");
        if (initialData.locationCount === 0) console.warn("No clinic locations exist. Configure verified clinic details before accepting bookings.");
        if (!backgroundStarted) {
          startReminderScheduler();
          startOwnerEmailScheduler();
          backgroundStarted = true;
        }
        console.log("Database and background services are ready.");
        return initialData;
      } catch (error) {
        logError("Database startup attempt failed", error, { attempt });
        await disconnect().catch(() => undefined);
        const delay = Math.min(30_000, 1_000 * (2 ** Math.min(attempt - 1, 5)));
        await new Promise((resolve) => { retryTimer = setTimeout(resolve, delay); });
      }
    }
    return initialData;
  }());

  let shuttingDown = false;
  async function shutdown(signal = "shutdown", exitCode = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    stopped = true;
    clearTimeout(retryTimer);
    console.log(`${signal} received. Closing application services.`);
    if (backgroundStarted) {
      stopReminderScheduler();
      stopOwnerEmailSchedulerForTests();
    }
    const forced = setTimeout(() => {
      server.closeAllConnections?.();
    }, 10_000);
    forced.unref?.();
    await new Promise((resolve) => server.close(resolve));
    clearTimeout(forced);
    await disconnect();
    if (dependencies.exitOnShutdown !== false) process.exit(exitCode);
  }

  return { app, server, shutdown, initialData, databaseReady };
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

function launch() {
  if (bootstrapError) startRestrictedBootstrapServer(bootstrapError);
  else return main();
}

if (require.main === module) launch();

module.exports = { inspectInitialData, startServer, main, launch, safeBootstrapReason, startRestrictedBootstrapServer };
