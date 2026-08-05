const mongoose = require("mongoose");

const { Schema } = mongoose;

const baseOptions = { timestamps: true };

// Auto-increment counter schema
const counterSchema = new Schema({
  key: { type: String, required: true, unique: true, trim: true },
  seq: { type: Number, default: 0 }
}, baseOptions);

// Staff User schema (User)
const staffUserSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { 
    type: String, 
    enum: ["super_admin", "doctor", "receptionist", "clinic_staff"], 
    default: "clinic_staff" 
  },
  isActive: { type: Boolean, default: true },
  failedLoginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date },
  passwordChangedAt: { type: Date },
  lastLoginAt: { type: Date }
}, baseOptions);

staffUserSchema.index({ role: 1, isActive: 1 });

// Refresh token schema
const refreshTokenSessionSchema = new Schema({
  staffUser: { type: Schema.Types.ObjectId, ref: "StaffUser", required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  userAgent: { type: String, maxlength: 600 },
  ip: { type: String, maxlength: 120 },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date }
}, baseOptions);

refreshTokenSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Patient schema
const patientSchema = new Schema({
  patientId: { type: String, unique: true, sparse: true },
  fullName: { type: String, required: true, trim: true, maxlength: 160 },
  phoneE164: { type: String, required: true, unique: true, trim: true },
  preferredLanguage: { type: String, default: "en", enum: ["en", "ur"] },
  age: { type: Number, min: 0, max: 130 },
  city: { type: String, default: "Bahawalpur" },
  gender: { type: String, enum: ["female", "male", "other", "not_provided"], default: "not_provided" },
  notes: { type: String, maxlength: 1000 },
  optOut: { type: Boolean, default: false }
}, baseOptions);

patientSchema.index({ fullName: "text", phoneE164: "text" });

// Patient Consent schema
const patientConsentSchema = new Schema({
  patient: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
  phoneE164: { type: String, required: true, index: true },
  consentGiven: { type: Boolean, required: true },
  consentText: { type: String, required: true },
  channel: { type: String, enum: ["website", "whatsapp", "staff"], required: true },
  language: { type: String, default: "en" },
  consentedAt: { type: Date, default: Date.now }
}, baseOptions);

// Clinic Location schema (Clinic)
const clinicLocationSchema = new Schema({
  clinicName: { type: String, required: true, trim: true, maxlength: 160 },
  city: { type: String, required: true, trim: true, maxlength: 100 },
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  fullAddress: { type: String, required: true, trim: true, maxlength: 500 },
  contactNumber: { type: String, trim: true, maxlength: 50 },
  status: { type: String, enum: ["Active", "Coming Soon"], default: "Active" },
  isActive: { type: Boolean, default: true, index: true },
  bookingEnabled: { type: Boolean, default: true, index: true },
  timezone: { type: String, default: "Asia/Karachi" },
  weeklyHours: [{
    day: { type: Number, min: 1, max: 7 },
    isOpen: { type: Boolean, default: true },
    start: { type: String, default: "16:30" },
    end: { type: String, default: "20:30" }
  }],
  slotDurationMinutes: { type: Number, default: 15, min: 5, max: 240 },
  appointmentFee: { type: Number, min: 0, default: 2000 },
  blockedDates: [{ date: String, reason: String }],
  displayOrder: { type: Number, default: 0 }
}, baseOptions);

clinicLocationSchema.index({ isActive: 1, bookingEnabled: 1, displayOrder: 1 });

// Doctor Profile Schema (Doctor)
const doctorProfileSchema = new Schema({
  doctorKey: { type: String, default: "dr-sohaib", unique: true },
  doctorName: { type: String, default: "Dr. Sohaib" },
  profileImage: { type: String, default: "/assets/dr-sohaib.png" },
  qualification: { type: String, default: "Specialist Physician & Surgeon" },
  specialty: { type: String, default: "General & Specialty Clinical Consultation, Surgical Evaluation & Patient Care" },
  experience: { type: String, default: "12+ Years Clinical Experience" },
  services: { type: String, default: "Professional Consultations, Surgical Evaluations, Comprehensive Diagnosis & Follow-up Care" },
  consultationLocation: { type: String, default: "Iqbal Hospital, Noor Mahal Road, Bahawalpur" },
  consultationDays: { type: String, default: "Monday to Thursday" },
  consultationTimings: { type: String, default: "4:30 PM to 8:30 PM" },
  bio: { type: String, default: "Dr. Sohaib is a dedicated physician and surgeon based at Iqbal Hospital, Bahawalpur. He provides professional consultations, surgical evaluations, and follow-up care for patients." }
}, baseOptions);

// Appointment schema
const appointmentSchema = new Schema({
  appointmentId: { type: String, required: true, unique: true, trim: true },
  tokenNumber: { type: String, required: true, trim: true },
  appointmentType: { type: String, enum: ["in_person", "online", "In-Person", "Online"], default: "in_person" },
  patient: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
  patientSnapshot: {
    fullName: { type: String, required: true },
    phoneMasked: { type: String, required: true },
    age: { type: Number },
    gender: { type: String },
    preferredLanguage: { type: String }
  },
  phoneE164: { type: String, required: true, index: true },
  location: { type: Schema.Types.ObjectId, ref: "ClinicLocation", required: true, index: true },
  locationSnapshot: { 
    clinicName: String, 
    city: String, 
    code: String, 
    address: String, 
    contactNumber: String, 
    timezone: String 
  },
  reason: { type: String, required: true, maxlength: 1000 },
  optionalNote: { type: String, maxlength: 1000 },
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  time: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
  status: {
    type: String,
    enum: [
      "pending",
      "confirmed",
      "patient_confirmed",
      "arrived",
      "in_consultation",
      "completed",
      "rescheduled",
      "cancelled",
      "no_show",
      "waiting_for_earlier_slot"
    ],
    default: "pending",
    index: true
  },
  consent: { type: Schema.Types.ObjectId, ref: "PatientConsent" },
  source: { type: String, enum: ["website", "whatsapp", "staff"], default: "whatsapp" },
  reminderStatus: { type: String, enum: ["pending", "partially_sent", "sent", "cancelled"], default: "pending" },
  rescheduleCount: { type: Number, default: 0 },
  createdBy: { type: Schema.Types.ObjectId, ref: "StaffUser" },
  cancelledAt: { type: Date },
  completedAt: { type: Date },
  arrivedAt: { type: Date }
}, baseOptions);

appointmentSchema.index({ location: 1, date: 1, time: 1, status: 1 });
appointmentSchema.index({ appointmentId: 1, phoneE164: 1 });

// Reschedule History schema
const rescheduleHistorySchema = new Schema({
  appointment: { type: Schema.Types.ObjectId, ref: "Appointment", required: true, index: true },
  previousDate: { type: String, required: true },
  previousTime: { type: String, required: true },
  newDate: { type: String, required: true },
  newTime: { type: String, required: true },
  changedByType: { type: String, enum: ["patient", "staff", "system"], required: true },
  changedByStaff: { type: Schema.Types.ObjectId, ref: "StaffUser" },
  reason: { type: String, maxlength: 1000 }
}, baseOptions);

// Conversation Session schema (Conversation)
const conversationSessionSchema = new Schema({
  phoneE164: { type: String, required: true, unique: true },
  patient: { type: Schema.Types.ObjectId, ref: "Patient" },
  language: { type: String, default: "en", enum: ["en", "ur"] },
  intent: { type: String, default: "menu" },
  state: { type: String, default: "idle" },
  context: { type: Schema.Types.Mixed, default: {} },
  humanRequired: { type: Boolean, default: false },
  aiPaused: { type: Boolean, default: false },
  takenOverBy: { type: Schema.Types.ObjectId, ref: "StaffUser" },
  lastMessageAt: { type: Date, default: Date.now }
}, baseOptions);

conversationSessionSchema.index({ humanRequired: 1, aiPaused: 1, lastMessageAt: -1 });

// WhatsApp Message schema (Message)
const whatsappMessageSchema = new Schema({
  metaMessageId: { type: String, unique: true, sparse: true },
  direction: { type: String, enum: ["incoming", "outgoing"], required: true },
  senderType: { type: String, enum: ["patient", "ai", "staff"], default: "patient" },
  senderStaff: { type: Schema.Types.ObjectId, ref: "StaffUser" },
  phoneE164: { type: String, required: true, index: true },
  conversation: { type: Schema.Types.ObjectId, ref: "ConversationSession" },
  messageType: { type: String, default: "text" },
  body: { type: String, maxlength: 6000 },
  mediaUrl: { type: String },
  status: {
    type: String,
    enum: ["received", "queued", "sent", "delivered", "read", "failed"],
    default: "received",
    index: true
  }
}, baseOptions);

whatsappMessageSchema.index({ createdAt: -1 });

// Clinic & Doctor Settings
const clinicSettingsSchema = new Schema({
  key: { type: String, default: "default", unique: true },
  doctorName: { type: String, default: "Dr. Sohaib" },
  clinicName: { type: String, default: "Iqbal Hospital" },
  city: { type: String, default: "Bahawalpur" },
  address: { type: String, default: "Noor Mahal Road, Bahawalpur" },
  consultationDays: { type: String, default: "Monday to Thursday" },
  consultationTime: { type: String, default: "4:30 PM to 8:30 PM" },
  contactNumber: { type: String, default: "+92 300 1234567" },
  timezone: { type: String, default: "Asia/Karachi" },
  slotDurationMinutes: { type: Number, default: 15 },
  updatedBy: { type: Schema.Types.ObjectId, ref: "StaffUser" }
}, baseOptions);

// Medical Report Upload schema
const medicalReportSchema = new Schema({
  reportId: { type: String, unique: true, sparse: true },
  patient: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
  patientPhone: { type: String, required: true, index: true },
  appointmentId: { type: String, default: "" },
  tokenNumber: { type: String, default: "" },
  appointment: { type: Schema.Types.ObjectId, ref: "Appointment" },
  reportTitle: { type: String, required: true, trim: true, maxlength: 200 },
  documentType: { type: String, enum: ["mri", "xray", "prescription", "lab", "discharge", "other", "blood_test"], default: "other" },
  fileUrl: { type: String, required: true },
  fileName: { type: String, required: true },
  fileType: { type: String, default: "application/pdf" },
  fileSize: { type: Number },
  notes: { type: String, maxlength: 1000 },
  status: { type: String, enum: ["New", "Uploaded", "Received", "Under Review", "Reviewed", "More Information Required", "pending", "archived"], default: "New" },
  reviewedBy: { type: Schema.Types.ObjectId, ref: "StaffUser" },
  reviewedAt: { type: Date }
}, baseOptions);

// Online Consultation Request schema
const onlineConsultationSchema = new Schema({
  consultationId: { type: String, unique: true, sparse: true },
  patient: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
  patientPhone: { type: String, required: true, index: true },
  fullName: { type: String },
  age: { type: Number },
  city: { type: String },
  patientType: { type: String, enum: ["new", "existing"], default: "new" },
  appointmentId: { type: String, default: "" },
  preferredDate: { type: String },
  preferredTime: { type: String },
  symptoms: { type: String, required: true, maxlength: 2000 },
  medicalHistory: { type: String, maxlength: 2000 },
  reportFileName: { type: String, default: "" },
  contactPhone: { type: String, required: true },
  status: { type: String, enum: ["Pending", "Under Review", "Approved", "Scheduled", "Completed", "Rejected", "Cancelled", "pending", "under_review", "scheduled", "completed", "rejected"], default: "Pending" },
  doctorNotes: { type: String, maxlength: 1000 },
  assignedDoctor: { type: Schema.Types.ObjectId, ref: "StaffUser" }
}, baseOptions);

// Emergency Alert schema
const emergencyAlertSchema = new Schema({
  patient: { type: Schema.Types.ObjectId, ref: "Patient" },
  phoneE164: { type: String, required: true, index: true },
  conversation: { type: Schema.Types.ObjectId, ref: "ConversationSession" },
  alertMessage: { type: String, required: true, maxlength: 2000 },
  priority: { type: String, enum: ["high", "critical"], default: "critical" },
  status: { type: String, enum: ["open", "acknowledged", "resolved"], default: "open", index: true },
  resolvedBy: { type: Schema.Types.ObjectId, ref: "StaffUser" },
  resolutionNotes: { type: String, maxlength: 1000 },
  resolvedAt: { type: Date }
}, baseOptions);

// Email Notification Outbox schema
const emailNotificationOutboxSchema = new Schema({
  appointmentId: { type: Schema.Types.ObjectId, ref: "Appointment", index: true },
  notificationType: { type: String, required: true },
  recipient: { type: String, required: true },
  channel: { type: String, default: "email" },
  requestId: { type: String },
  templateKey: { type: String },
  status: { type: String, enum: ["queued", "sending", "sent", "failed", "dead_letter"], default: "queued", index: true },
  attemptCount: { type: Number, default: 0 },
  nextRetryAt: { type: Date },
  lockedAt: { type: Date },
  lockExpiresAt: { type: Date },
  lastAttemptAt: { type: Date },
  failedAt: { type: Date },
  sentAt: { type: Date },
  providerMessageId: { type: String },
  failureCode: { type: String },
  failureMessageSafe: { type: String }
}, baseOptions);

emailNotificationOutboxSchema.index({ status: 1, nextRetryAt: 1 });

// Reminder Job schema (Reminder)
const reminderJobSchema = new Schema({
  appointment: { type: Schema.Types.ObjectId, ref: "Appointment", index: true },
  patient: { type: Schema.Types.ObjectId, ref: "Patient", index: true },
  phoneE164: { type: String, required: true, index: true },
  type: { type: String, enum: ["appointment_reminder", "follow_up_reminder"], default: "appointment_reminder" },
  dueAt: { type: Date, required: true, index: true },
  message: { type: String, required: true },
  status: { type: String, enum: ["pending", "sent", "cancelled", "failed"], default: "pending" },
  attempts: { type: Number, default: 0 },
  sentAt: { type: Date }
}, baseOptions);

// Staff Note schema
const staffNoteSchema = new Schema({
  targetType: { type: String, enum: ["patient", "appointment", "conversation"], required: true },
  targetId: { type: String, required: true, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "StaffUser", required: true },
  note: { type: String, required: true, maxlength: 2000 }
}, baseOptions);

// Notification schema
const notificationSchema = new Schema({
  title: { type: String, required: true },
  message: { type: String, required: true, maxlength: 2000 },
  type: { type: String, enum: ["info", "success", "warning", "emergency"], default: "info" },
  readBy: [{ type: Schema.Types.ObjectId, ref: "StaffUser" }]
}, baseOptions);

// Audit Log schema
const auditLogSchema = new Schema({
  actorType: { type: String, enum: ["staff", "patient", "system", "whatsapp"], required: true },
  actorStaff: { type: Schema.Types.ObjectId, ref: "StaffUser" },
  action: { type: String, required: true, index: true },
  entityType: { type: String, required: true },
  entityId: { type: String },
  metadata: { type: Schema.Types.Mixed }
}, baseOptions);

auditLogSchema.index({ createdAt: -1 });

const StaffUser = mongoose.model("StaffUser", staffUserSchema);
const Patient = mongoose.model("Patient", patientSchema);
const ClinicLocation = mongoose.model("ClinicLocation", clinicLocationSchema);
const DoctorProfile = mongoose.model("DoctorProfile", doctorProfileSchema);
const Appointment = mongoose.model("Appointment", appointmentSchema);
const MedicalReport = mongoose.model("MedicalReport", medicalReportSchema);
const OnlineConsultation = mongoose.model("OnlineConsultation", onlineConsultationSchema);
const EmergencyAlert = mongoose.model("EmergencyAlert", emergencyAlertSchema);
const EmailNotificationOutbox = mongoose.model("EmailNotificationOutbox", emailNotificationOutboxSchema);
const ReminderJob = mongoose.model("ReminderJob", reminderJobSchema);
const ConversationSession = mongoose.model("ConversationSession", conversationSessionSchema);
const WhatsAppMessage = mongoose.model("WhatsAppMessage", whatsappMessageSchema);

const models = {
  Counter: mongoose.model("Counter", counterSchema),
  StaffUser,
  User: StaffUser, // Alias
  RefreshTokenSession: mongoose.model("RefreshTokenSession", refreshTokenSessionSchema),
  Patient,
  PatientConsent: mongoose.model("PatientConsent", patientConsentSchema),
  ClinicLocation,
  Clinic: ClinicLocation, // Alias
  DoctorProfile,
  Doctor: DoctorProfile, // Alias
  Appointment,
  RescheduleHistory: mongoose.model("RescheduleHistory", rescheduleHistorySchema),
  ConversationSession,
  Conversation: ConversationSession, // Alias
  WhatsAppMessage,
  Message: WhatsAppMessage, // Alias
  ClinicSettings: mongoose.model("ClinicSettings", clinicSettingsSchema),
  MedicalReport,
  OnlineConsultation,
  EmergencyAlert,
  EmailNotificationOutbox,
  ReminderJob,
  Reminder: ReminderJob, // Alias
  StaffNote: mongoose.model("StaffNote", staffNoteSchema),
  Notification: mongoose.model("Notification", notificationSchema),
  AuditLog: mongoose.model("AuditLog", auditLogSchema)
};

module.exports = models;
