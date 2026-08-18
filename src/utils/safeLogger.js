const { config } = require("../config/env");

function sanitizeText(value) {
  return String(value || "")
    .replace(/mongodb(?:\+srv)?:\/\/[^\s"']+/gi, "[REDACTED_DATABASE_URI]")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/((?:password|secret|token|access[_-]?key)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .slice(0, 1000);
}

function safeError(error) {
  const result = {
    name: sanitizeText(error?.name || "Error"),
    code: sanitizeText(error?.code || "UNEXPECTED_ERROR")
  };
  const message = String(error?.message || error || "");
  const safeProductionConfigurationMessage = /^(?:Missing required production environment variable: [A-Z0-9_ ]+|Invalid production environment variable: [A-Z0-9_]+|Production authentication secrets must be distinct strong values of at least 32 characters\.|Production WhatsApp secrets must be strong non-placeholder values\.|Invalid production email boolean configuration\.|Invalid production email SMTP configuration\.|Missing required production email SMTP credentials\.|Invalid production owner\/from email configuration\.|Invalid production private-storage credentials\.|Unsafe production TLS configuration is not allowed\.)$/.test(message);
  if (!config.isProduction || safeProductionConfigurationMessage) result.message = sanitizeText(message);
  return result;
}

function safeMetadata(value, depth = 0) {
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return sanitizeText(value);
  if (depth >= 3) return "[nested]";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => safeMetadata(item, depth + 1));
  if (typeof value !== "object") return sanitizeText(value);
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = /(password|secret|token|authorization|cookie|databaseuri|mongodb)/i.test(key)
      ? "[REDACTED]"
      : safeMetadata(item, depth + 1);
  }
  return output;
}

function logError(label, error, metadata = {}) {
  console.error(sanitizeText(label), { ...safeMetadata(metadata), ...safeError(error) });
}

module.exports = { sanitizeText, safeError, safeMetadata, logError };
