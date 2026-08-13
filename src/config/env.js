if (process.env.DOTENV_CONFIG_PATH) {
  require("dotenv").config({ path: process.env.DOTENV_CONFIG_PATH });
} else {
  require("dotenv").config();
}

const requiredInProduction = [
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "COOKIE_SECRET",
  "FRONTEND_URL",
  "CORS_ORIGINS",
  "TRUST_PROXY",
  "CLINIC_TIMEZONE"
];

const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";

for (const key of requiredInProduction) {
  if (isProduction && !process.env[key]) {
    throw new Error(`Missing required production environment variable: ${key}`);
  }
}

if (isProduction && ![process.env.MONGODB_URI_V2, process.env.MONGODB_URI]
  .some((value) => String(value || "").trim())) {
  throw new Error("Missing required production environment variable: MONGODB_URI_V2 or MONGODB_URI");
}

function read(name, fallback = "") {
  return process.env[name] || fallback;
}

function readNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function readBoolean(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return String(value).trim().toLowerCase() === "true";
}

function readOrigins() {
  return read("CORS_ORIGINS", read("FRONTEND_URL", "http://localhost:3000"))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const emailEnabled = readBoolean("EMAIL_ENABLED", readBoolean("EMAIL_APPOINTMENT_ALERT_ENABLED", false));
const emailHost = read("EMAIL_HOST", read("SMTP_HOST")).trim();
const emailPort = readNumber("EMAIL_PORT", readNumber("SMTP_PORT", 587));
const emailUser = read("EMAIL_USER", read("SMTP_USER")).trim();
const emailPassword = read("EMAIL_PASSWORD", read("SMTP_PASSWORD"));
const emailFrom = read("EMAIL_FROM", read("EMAIL_FROM_ADDRESS")).trim();
const ownerEmail = read("OWNER_EMAIL", read("EMAIL_APPOINTMENT_ALERT_TO")).trim();
const emailSecure = readBoolean("EMAIL_SECURE", readBoolean("SMTP_SECURE", false));
const mongoUriOverride = String(process.env.MONGODB_URI_V2 || "").trim();

const rawContactNumber = read("CLINIC_CONTACT_NUMBER", "+923001234567").trim();
const rawPublicWhatsApp = read("PUBLIC_WHATSAPP_NUMBER", "+923001234567").trim();

const config = {
  nodeEnv,
  isProduction,
  port: readNumber("PORT", 3000),
  mongoUri: mongoUriOverride || read("MONGODB_URI", "mongodb://127.0.0.1:27017/dr-sohaib-whatsapp-chatbot").trim(),
  frontendUrl: read("FRONTEND_URL", "http://localhost:3000"),
  corsOrigins: readOrigins(),
  jwtAccessSecret: read("JWT_ACCESS_SECRET", "dev-only-change-this-access-secret"),
  jwtRefreshSecret: read("JWT_REFRESH_SECRET", "dev-only-change-this-refresh-secret"),
  cookieSecret: read("COOKIE_SECRET", "dev-only-change-this-cookie-secret"),
  accessTokenTtl: read("ACCESS_TOKEN_TTL", "15m"),
  refreshTokenTtlDays: readNumber("REFRESH_TOKEN_TTL_DAYS", 30),
  trustProxy: readNumber("TRUST_PROXY", isProduction ? 1 : 1),
  clinicTimezone: read("CLINIC_TIMEZONE", "Asia/Karachi"),
  clinicContactNumber: /^\+[1-9]\d{7,14}$/.test(rawContactNumber.replace(/[\s()-]/g, "")) ? rawContactNumber : "+923001234567",
  appointmentConsent: {
    text: read("APPOINTMENT_CONSENT_TEXT", "The clinic will use your information for appointment management, reminders, rescheduling, and clinic communications."),
    version: read("APPOINTMENT_CONSENT_VERSION", "appointment-consent-v1")
  },
  defaultClinicLocationCode: read("DEFAULT_CLINIC_LOCATION_CODE", "BWP"),
  publicWhatsAppNumber: /^\+[1-9]\d{7,14}$/.test(rawPublicWhatsApp.replace(/[\s()-]/g, "")) ? rawPublicWhatsApp : "+923001234567",
  adminPanelUrl: read("ADMIN_PANEL_URL", read("FRONTEND_URL", "http://localhost:3000") + "/#/admin"),
  emailAppointmentAlert: {
    enabled: emailEnabled,
    to: ownerEmail,
    fromName: read("EMAIL_FROM_NAME", "Dr. Sohaib Clinic").trim(),
    fromAddress: emailFrom,
    provider: read("EMAIL_PROVIDER", "smtp").trim().toLowerCase(),
    smtp: {
      host: emailHost,
      port: emailPort,
      secure: emailSecure,
      user: emailUser,
      password: emailPassword
    }
  },
  storage: {
    provider: read("STORAGE_PROVIDER", "local").trim().toLowerCase(),
    endpoint: read("STORAGE_ENDPOINT").trim(),
    region: read("STORAGE_REGION", "us-east-1").trim(),
    bucket: read("STORAGE_BUCKET").trim(),
    accessKeyId: read("STORAGE_ACCESS_KEY_ID").trim(),
    secretAccessKey: read("STORAGE_SECRET_ACCESS_KEY"),
    maxUploadBytes: readNumber("STORAGE_MAX_UPLOAD_BYTES", 10 * 1024 * 1024),
    signedUrlExpirySeconds: readNumber("STORAGE_SIGNED_URL_EXPIRY_SECONDS", 300),
    localPath: read("STORAGE_LOCAL_PATH", "private-storage").trim()
  },
  whatsapp: {
    graphVersion: read("WHATSAPP_GRAPH_VERSION", "v20.0"),
    accessToken: read("WHATSAPP_ACCESS_TOKEN"),
    phoneNumberId: read("WHATSAPP_PHONE_NUMBER_ID"),
    businessAccountId: read("WHATSAPP_BUSINESS_ACCOUNT_ID"),
    verifyToken: read("WHATSAPP_VERIFY_TOKEN").trim(),
    metaAppSecret: read("META_APP_SECRET"),
    templates: {
      appointmentConfirmation: read("WHATSAPP_TEMPLATE_APPOINTMENT_CONFIRMATION", "appointment_confirmation_v1"),
      appointmentConfirmationLanguage: read("WHATSAPP_TEMPLATE_APPOINTMENT_CONFIRMATION_LANGUAGE", "en_US"),
      appointmentReminder: read("WHATSAPP_TEMPLATE_APPOINTMENT_REMINDER", "appointment_reminder_v1"),
      appointmentReminderLanguage: read("WHATSAPP_TEMPLATE_APPOINTMENT_REMINDER_LANGUAGE", "en_US"),
      rescheduleConfirmation: read("WHATSAPP_TEMPLATE_RESCHEDULE_CONFIRMATION", "reschedule_confirmation_v1"),
      rescheduleConfirmationLanguage: read("WHATSAPP_TEMPLATE_RESCHEDULE_CONFIRMATION_LANGUAGE", "en_US"),
      cancellationConfirmation: read("WHATSAPP_TEMPLATE_CANCELLATION_CONFIRMATION", "cancellation_confirmation_v1"),
      cancellationConfirmationLanguage: read("WHATSAPP_TEMPLATE_CANCELLATION_CONFIRMATION_LANGUAGE", "en_US")
    }
  }
};

if (isProduction) {
  const invalid = (name) => { throw new Error(`Invalid production environment variable: ${name}`); };
  const strongSecret = (value) => typeof value === "string"
    && value.length >= 32
    && !/(your_|change|placeholder|example|dev-only|password)/i.test(value);
  const parseHttpsUrl = (name, value, { originOnly = false } = {}) => {
    let parsed;
    try { parsed = new URL(value); } catch { invalid(name); }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) invalid(name);
    if (originOnly && (parsed.pathname !== "/" || parsed.search || parsed.hash)) invalid(name);
    return parsed;
  };

  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") throw new Error("Unsafe production TLS configuration is not allowed.");
  if (!Number.isInteger(config.trustProxy) || config.trustProxy < 1 || config.trustProxy > 5) invalid("TRUST_PROXY");
  if (![config.jwtAccessSecret, config.jwtRefreshSecret, config.cookieSecret].every(strongSecret)) throw new Error("Production authentication secrets must be distinct strong values of at least 32 characters.");
  if (new Set([config.jwtAccessSecret, config.jwtRefreshSecret, config.cookieSecret]).size !== 3) throw new Error("Production authentication secrets must be distinct strong values of at least 32 characters.");
  let mongoUrl;
  try { mongoUrl = new URL(config.mongoUri); } catch { invalid("MONGODB_URI"); }
  if (!["mongodb:", "mongodb+srv:"].includes(mongoUrl.protocol) || !mongoUrl.username || !mongoUrl.password) invalid("MONGODB_URI");
  parseHttpsUrl("FRONTEND_URL", config.frontendUrl);
  parseHttpsUrl("ADMIN_PANEL_URL", config.adminPanelUrl);
  if (!config.corsOrigins.length) invalid("CORS_ORIGINS");
  for (const origin of config.corsOrigins) parseHttpsUrl("CORS_ORIGINS", origin, { originOnly: true });
  if (!config.corsOrigins.includes(new URL(config.frontendUrl).origin)) invalid("CORS_ORIGINS");
  try { new Intl.DateTimeFormat("en-US", { timeZone: config.clinicTimezone }); } catch { invalid("CLINIC_TIMEZONE"); }

  if (config.whatsapp.accessToken) {
    if (!strongSecret(config.whatsapp.accessToken) || !strongSecret(config.whatsapp.metaAppSecret) || !strongSecret(config.whatsapp.verifyToken)) {
      throw new Error("Production WhatsApp secrets must be strong non-placeholder values.");
    }
  }

  if (config.emailAppointmentAlert.enabled) {
    const email = config.emailAppointmentAlert;
    if (!email.smtp.host || !Number.isInteger(email.smtp.port) || email.smtp.port < 1 || email.smtp.port > 65535) throw new Error("Invalid production email SMTP configuration.");
    if (!email.smtp.user || !email.smtp.password) throw new Error("Missing required production email SMTP credentials.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.to) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.fromAddress)) throw new Error("Invalid production owner/from email configuration.");
  }

  if (config.storage.provider === "s3") {
    if (!config.storage.accessKeyId || !config.storage.secretAccessKey || /(your_|change|placeholder|example)/i.test(`${config.storage.accessKeyId}${config.storage.secretAccessKey}`)) throw new Error("Invalid production private-storage credentials.");
    try {
      const storageUrl = new URL(config.storage.endpoint);
      if (storageUrl.protocol !== "https:") throw new Error("insecure");
    } catch {
      throw new Error("Invalid production environment variable: STORAGE_ENDPOINT");
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,254}$/.test(config.storage.bucket)) throw new Error("Invalid production environment variable: STORAGE_BUCKET");
    if (!/^[a-zA-Z0-9-]{2,100}$/.test(config.storage.region)) throw new Error("Invalid production environment variable: STORAGE_REGION");
  }
  if (!Number.isInteger(config.storage.maxUploadBytes) || config.storage.maxUploadBytes < 1024 || config.storage.maxUploadBytes > 50 * 1024 * 1024) {
    throw new Error("Invalid production environment variable: STORAGE_MAX_UPLOAD_BYTES");
  }
  if (!Number.isInteger(config.storage.signedUrlExpirySeconds) || config.storage.signedUrlExpirySeconds < 30 || config.storage.signedUrlExpirySeconds > 3600) {
    throw new Error("Invalid production environment variable: STORAGE_SIGNED_URL_EXPIRY_SECONDS");
  }
  const templateNamePattern = /^[a-z0-9_]{1,512}$/;
  const languagePattern = /^[a-z]{2,3}(?:_[A-Z]{2})?$/;
  if (!/^v\d+\.\d+$/.test(config.whatsapp.graphVersion)) throw new Error("Invalid production environment variable: WHATSAPP_GRAPH_VERSION");
  if (!/^\d+$/.test(config.whatsapp.phoneNumberId)) throw new Error("Invalid production environment variable: WHATSAPP_PHONE_NUMBER_ID");
  if (!/^\d+$/.test(config.whatsapp.businessAccountId)) throw new Error("Invalid production environment variable: WHATSAPP_BUSINESS_ACCOUNT_ID");
  const contracts = [
    ["WHATSAPP_TEMPLATE_APPOINTMENT_CONFIRMATION", config.whatsapp.templates.appointmentConfirmation, "WHATSAPP_TEMPLATE_APPOINTMENT_CONFIRMATION_LANGUAGE", config.whatsapp.templates.appointmentConfirmationLanguage],
    ["WHATSAPP_TEMPLATE_APPOINTMENT_REMINDER", config.whatsapp.templates.appointmentReminder, "WHATSAPP_TEMPLATE_APPOINTMENT_REMINDER_LANGUAGE", config.whatsapp.templates.appointmentReminderLanguage],
    ["WHATSAPP_TEMPLATE_RESCHEDULE_CONFIRMATION", config.whatsapp.templates.rescheduleConfirmation, "WHATSAPP_TEMPLATE_RESCHEDULE_CONFIRMATION_LANGUAGE", config.whatsapp.templates.rescheduleConfirmationLanguage],
    ["WHATSAPP_TEMPLATE_CANCELLATION_CONFIRMATION", config.whatsapp.templates.cancellationConfirmation, "WHATSAPP_TEMPLATE_CANCELLATION_CONFIRMATION_LANGUAGE", config.whatsapp.templates.cancellationConfirmationLanguage]
  ];
  for (const [nameKey, name, languageKey, language] of contracts) {
    if (!templateNamePattern.test(name)) throw new Error(`Invalid production environment variable: ${nameKey}`);
    if (!languagePattern.test(language)) throw new Error(`Invalid production environment variable: ${languageKey}`);
  }
}

module.exports = { config, readBoolean };
