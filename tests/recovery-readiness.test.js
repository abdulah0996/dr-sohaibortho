const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

process.env.NODE_ENV = "test";

const { createApp } = require("../src/app");
const { copyDatabaseForRecoveryVerification } = require("../src/services/recoveryVerificationService");

test("readiness returns 503 and no sensitive detail while MongoDB is unavailable", async () => {
  await mongoose.disconnect();
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/health/ready`);
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.deepEqual(body, { success: false, database: "not_connected" });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("synthetic backup restores documents, references and indexes into a separate empty database", async () => {
  const mongod = await MongoMemoryServer.create();
  const client = new mongoose.mongo.MongoClient(mongod.getUri());
  await client.connect();
  try {
    const source = client.db("dr_sohaib_backup_source_test");
    const restored = client.db("dr_sohaib_restore_target_test");
    const patientId = new mongoose.Types.ObjectId();
    await source.collection("patients").insertOne({ _id: patientId, patientId: "PAT-SYNTHETIC-1", fullName: "Synthetic Restore Patient" });
    await source.collection("appointments").insertOne({ appointmentId: "DS-SYNTHETIC-1", patient: patientId, date: "2030-01-01", time: "16:30" });
    await source.collection("appointments").createIndex({ appointmentId: 1 }, { unique: true, name: "appointmentId_1" });

    const result = await copyDatabaseForRecoveryVerification(source, restored);
    assert.deepEqual(result, { collections: 2, documents: 2, indexes: 1 });
    const restoredAppointment = await restored.collection("appointments").findOne({ appointmentId: "DS-SYNTHETIC-1" });
    assert.equal(String(restoredAppointment.patient), String(patientId));
    assert.equal((await restored.collection("patients").countDocuments({ _id: patientId })), 1);
    await assert.rejects(
      () => restored.collection("appointments").insertOne({ appointmentId: "DS-SYNTHETIC-1" }),
      (error) => error?.code === 11000
    );
  } finally {
    await client.close();
    await mongod.stop();
  }
});

test("restore verification refuses a non-empty target and never overwrites it", async () => {
  const mongod = await MongoMemoryServer.create();
  const client = new mongoose.mongo.MongoClient(mongod.getUri());
  await client.connect();
  try {
    const source = client.db("source_test");
    const target = client.db("occupied_restore_test");
    await source.collection("patients").insertOne({ synthetic: true });
    await target.collection("sentinel").insertOne({ preserve: true });
    await assert.rejects(() => copyDatabaseForRecoveryVerification(source, target), /must be empty/);
    assert.equal(await target.collection("sentinel").countDocuments({ preserve: true }), 1);
  } finally {
    await client.close();
    await mongod.stop();
  }
});
