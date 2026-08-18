const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const uri = process.env.MONGODB_INTEGRATION_URI;
test("MongoDB integration connection", { skip: !uri && "Set MONGODB_INTEGRATION_URI to run database integration tests." }, async () => {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  try { assert.equal(mongoose.connection.readyState, 1); }
  finally { await mongoose.disconnect(); }
});
