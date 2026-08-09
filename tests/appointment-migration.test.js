const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

process.env.NODE_ENV = "test";
const { Appointment, ClinicLocation } = require("../src/models");
const { auditActiveSlotData, backfillActiveSlotKeys } = require("../src/services/appointmentMigrationService");
const { defaultWeeklyHours } = require("../src/utils/time");

let mongod;

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { autoIndex: false });
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test("duplicate audit is read-only and the migration index enforces active slot uniqueness", async () => {
  const location = await ClinicLocation.create({
    clinicName: "Migration Test", city: "Bahawalpur", code: "MIG", fullAddress: "Test",
    status: "Active", isActive: true, bookingEnabled: true, timezone: "Asia/Karachi",
    weeklyHours: defaultWeeklyHours(), slotDurationMinutes: 15
  });
  const base = {
    tokenNumber: "001", patient: new mongoose.Types.ObjectId(),
    patientSnapshot: { fullName: "Migration Patient", phoneMasked: "*******0001" },
    phoneE164: "+923000000001", location: location._id,
    locationSnapshot: { code: "MIG", timezone: "Asia/Karachi" }, reason: "Test",
    date: "2027-01-04", time: "16:30", status: "confirmed", source: "staff",
    createdAt: new Date(), updatedAt: new Date()
  };
  await Appointment.collection.insertMany([
    { ...base, appointmentId: "DS-2027-0001", _id: new mongoose.Types.ObjectId() },
    { ...base, appointmentId: "DS-2027-0002", phoneE164: "+923000000002", _id: new mongoose.Types.ObjectId() }
  ]);

  const beforeCount = await Appointment.countDocuments();
  const report = await auditActiveSlotData();
  assert.equal(report.duplicateSlotCount, 1);
  assert.deepEqual(report.duplicates[0].appointments.map((item) => item.appointmentId).sort(), ["DS-2027-0001", "DS-2027-0002"]);
  assert.equal(await Appointment.countDocuments(), beforeCount);

  await Appointment.deleteOne({ appointmentId: "DS-2027-0002" });
  assert.equal(await backfillActiveSlotKeys(), 1);
  await Appointment.collection.createIndex({ activeSlotKey: 1 }, { unique: true, sparse: true, name: "uniq_active_appointment_slot" });
  const migrated = await Appointment.findOne({ appointmentId: "DS-2027-0001" });
  assert.equal(migrated.activeSlotKey, `${location._id}|2027-01-04|16:30`);
  await assert.rejects(
    Appointment.collection.insertOne({ ...base, appointmentId: "DS-2027-0003", phoneE164: "+923000000003", activeSlotKey: migrated.activeSlotKey, _id: new mongoose.Types.ObjectId() }),
    (error) => error.code === 11000
  );
  const index = (await Appointment.collection.indexes()).find((item) => item.name === "uniq_active_appointment_slot");
  assert.equal(index.unique, true);
  assert.equal(index.sparse, true);
});
