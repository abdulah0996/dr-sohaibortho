const WHATSAPP_MESSAGE_STATUSES = Object.freeze([
  "received",
  "queued",
  "sent",
  "delivered",
  "read",
  "failed"
]);

const WHATSAPP_DELIVERY_STATUSES = Object.freeze([
  "sent",
  "delivered",
  "read",
  "failed",
  "deleted"
]);

const REMINDER_DELIVERY_STATUSES = Object.freeze([
  "pending",
  "processing",
  "queued",
  "sent",
  "delivered",
  "read",
  "failed",
  "cancelled"
]);

const DELIVERY_RANK = Object.freeze({ received: 0, queued: 1, sent: 2, delivered: 3, read: 4, failed: 5 });

function shouldAdvanceDeliveryStatus(current, next) {
  if (next === "failed") return true;
  if (!(next in DELIVERY_RANK)) return false;
  return (DELIVERY_RANK[next] || 0) >= (DELIVERY_RANK[current] || 0);
}

module.exports = {
  WHATSAPP_MESSAGE_STATUSES,
  WHATSAPP_DELIVERY_STATUSES,
  REMINDER_DELIVERY_STATUSES,
  shouldAdvanceDeliveryStatus
};
