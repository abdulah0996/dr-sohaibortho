const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

process.env.NODE_ENV = "test";
process.env.FRONTEND_URL = "http://127.0.0.1:4173";
process.env.CORS_ORIGINS = "http://127.0.0.1:4173";

const { createApp } = require("../../src/app");
const { createStaffUser } = require("../../src/services/authService");
const { ensureInitialLocations } = require("../../src/services/locationService");

let mongod;
let server;

async function shutdown(exitCode = 0) {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect().catch(() => undefined);
  if (mongod) await mongod.stop().catch(() => undefined);
  process.exit(exitCode);
}

async function main() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { autoIndex: true });
  await createStaffUser({
    name: "QA Super Admin",
    email: "qa.admin@clinic.test",
    password: "QaBrowser!Pass2026",
    role: "super_admin"
  });
  await ensureInitialLocations();
  server = createApp().listen(4173, "127.0.0.1", () => console.log("Browser QA server ready at http://127.0.0.1:4173"));
}

process.once("SIGINT", () => shutdown(0));
process.once("SIGTERM", () => shutdown(0));
process.once("uncaughtException", (error) => {
  console.error(error.message);
  shutdown(1);
});
process.once("unhandledRejection", (error) => {
  console.error(error?.message || error);
  shutdown(1);
});

main().catch((error) => {
  console.error(error.message);
  shutdown(1);
});
