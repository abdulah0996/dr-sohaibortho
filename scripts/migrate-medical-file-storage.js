const { connectDatabase, disconnectDatabase } = require("../src/config/db");
const { logError } = require("../src/utils/safeLogger");
const { MedicalReport } = require("../src/models");

async function migrate() {
  await connectDatabase({ autoIndex: false });
  const collection = MedicalReport.collection;
  const legacy = await collection.updateMany(
    { $or: [{ storageKey: { $exists: false } }, { storageKey: null }, { storageKey: "" }] },
    {
      $set: { fileStatus: "quarantined", status: "archived" },
      $unset: { fileUrl: "", fileName: "", fileType: "" }
    }
  );
  await collection.createIndex({ storageKey: 1 }, { unique: true, sparse: true, name: "storageKey_1" });
  await collection.createIndex({ fileStatus: 1 }, { name: "fileStatus_1" });
  console.log(JSON.stringify({
    legacyRecordsQuarantined: legacy.modifiedCount,
    storageKeyIndex: "verified",
    fileStatusIndex: "verified"
  }));
}

migrate()
  .then(() => disconnectDatabase())
  .catch(async (error) => {
    logError("Medical-file migration failed", error);
    await disconnectDatabase().catch(() => {});
    process.exitCode = 1;
  });
