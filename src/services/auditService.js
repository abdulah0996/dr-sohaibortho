const { AuditLog } = require("../models");
const { logError } = require("../utils/safeLogger");

const SENSITIVE_KEY = /(password|passcode|token|secret|authorization|cookie|storagekey|filecontent|filebuffer|filebytes|filedata|^buffer$|^content$|^body$|^message$|messagetext|messagebody|notes|symptoms|medicalhistory)/i;

function safeSummary(value, depth = 0) {
  if (value === undefined) return undefined;
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.slice(0, 500);
  if (depth >= 3) return "[nested]";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => safeSummary(item, depth + 1));
  if (typeof value !== "object") return String(value).slice(0, 500);
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) continue;
    output[key] = safeSummary(item, depth + 1);
  }
  return output;
}

async function audit({
  actorType,
  actorStaff,
  actorPatient,
  actorId,
  actorPhone,
  actorRole,
  action,
  entityType,
  entityId,
  targetType,
  targetId,
  metadata,
  before,
  after,
  req
}) {
  try {
    const resolvedStaff = actorStaff || req?.user?._id;
    const resolvedEntityType = targetType || entityType;
    const resolvedEntityId = targetId || entityId;
    return await AuditLog.create({
      actorType,
      actorStaff: resolvedStaff,
      actorPatient,
      actorId: actorId || resolvedStaff?.toString?.() || actorPatient?.toString?.(),
      actorPhone,
      actorRole: actorRole || req?.user?.role,
      action,
      entityType: resolvedEntityType,
      entityId: resolvedEntityId,
      targetType: resolvedEntityType,
      targetId: resolvedEntityId,
      metadata: safeSummary(metadata),
      beforeSummary: safeSummary(before),
      afterSummary: safeSummary(after),
      requestId: req?.requestId,
      ip: String(req?.ip || req?.socket?.remoteAddress || "").slice(0, 120) || undefined,
      userAgent: String(req?.get?.("user-agent") || "").slice(0, 600) || undefined
    });
  } catch (error) {
    logError("Audit log write failed", error);
    return null;
  }
}

module.exports = { audit, safeSummary };
