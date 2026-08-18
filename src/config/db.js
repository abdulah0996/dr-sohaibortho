const mongoose = require("mongoose");
const { config } = require("./env");
const { logError } = require("../utils/safeLogger");

let mongod = null;

async function connectDatabase(options = {}) {
  mongoose.set("strictQuery", true);
  const autoIndex = options.autoIndex ?? !config.isProduction;
  try {
    await mongoose.connect(config.mongoUri, {
      autoIndex,
      serverSelectionTimeoutMS: 5000
    });
    console.log("MongoDB connected successfully.");
  } catch (error) {
    if (config.isProduction || process.env.NODE_ENV === "production") {
      logError("Production MongoDB connection failed", error);
      throw error;
    }

    console.log("External MongoDB unavailable. Using temporary in-memory database.");
    console.log("Data will be removed when the server stops.");
    try {
      const { MongoMemoryServer } = require("mongodb-memory-server");
      mongod = await MongoMemoryServer.create();
      const uri = mongod.getUri();
      await mongoose.connect(uri, { autoIndex });
      console.log("In-memory MongoDB connected successfully.");
    } catch (memError) {
      logError("In-memory MongoDB startup failed", memError);
      throw error;
    }
  }
}

async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  if (mongod) await mongod.stop();
  mongod = null;
}

module.exports = { connectDatabase, disconnectDatabase };
