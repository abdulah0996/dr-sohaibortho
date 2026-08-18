const crypto = require("crypto");
const { connectDatabase, disconnectDatabase } = require("../src/config/db");
const { logError } = require("../src/utils/safeLogger");
const { MessageDeliveryStatus, ReminderJob, WhatsAppMessage } = require("../src/models");

async function main() {
  await connectDatabase({ autoIndex: false });
  const events = await MessageDeliveryStatus.collection.find({}, { projection: { metaMessageId: 1, status: 1, timestamp: 1, eventKey: 1 } }).toArray();
  const eventUpdates = events.filter((event) => !event.eventKey).map((event) => ({
    updateOne: {
      filter: { _id: event._id },
      update: { $set: { eventKey: crypto.createHash("sha256").update(`${event.metaMessageId}|${event.status}|${new Date(event.timestamp).toISOString()}`).digest("hex") } }
    }
  }));
  if (eventUpdates.length) await MessageDeliveryStatus.collection.bulkWrite(eventUpdates, { ordered: true });
  const messageResult = await WhatsAppMessage.collection.updateMany({ status: "sent_to_meta" }, { $set: { status: "queued" } });
  const reminderResult = await ReminderJob.collection.updateMany({ status: "sent_to_meta" }, { $set: { status: "queued" } });
  await Promise.all([
    MessageDeliveryStatus.createIndexes(),
    WhatsAppMessage.createIndexes(),
    ReminderJob.createIndexes()
  ]);
  const indexes = await Promise.all([
    MessageDeliveryStatus.collection.indexes(),
    WhatsAppMessage.collection.indexes(),
    ReminderJob.collection.indexes()
  ]);
  console.log(JSON.stringify({
    deliveryEventsBackfilled: eventUpdates.length,
    messagesNormalized: messageResult.modifiedCount,
    remindersNormalized: reminderResult.modifiedCount,
    verifiedIndexes: indexes.flat().map((index) => index.name)
  }, null, 2));
  await disconnectDatabase();
}

main().catch(async (error) => {
  logError("WhatsApp delivery migration failed", error);
  await disconnectDatabase().catch(() => undefined);
  process.exitCode = 1;
});
