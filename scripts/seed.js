const bcrypt = require("bcryptjs");
const { connectDatabase } = require("../src/config/db");
const {
  StaffUser,
  Patient,
  ClinicLocation,
  DoctorProfile,
  Appointment,
  ConversationSession,
  WhatsAppMessage,
  ClinicSettings,
  MedicalReport,
  OnlineConsultation,
  EmergencyAlert,
  ReminderJob,
  StaffNote,
  AuditLog
} = require("../src/models");

async function seed() {
  console.log("Starting Dr. Sohaib Database Seeding...");
  await connectDatabase();

  // Clear existing collections
  await Promise.all([
    StaffUser.deleteMany({}),
    Patient.deleteMany({}),
    ClinicLocation.deleteMany({}),
    DoctorProfile.deleteMany({}),
    Appointment.deleteMany({}),
    ConversationSession.deleteMany({}),
    WhatsAppMessage.deleteMany({}),
    ClinicSettings.deleteMany({}),
    MedicalReport.deleteMany({}),
    OnlineConsultation.deleteMany({}),
    EmergencyAlert.deleteMany({}),
    ReminderJob.deleteMany({}),
    StaffNote.deleteMany({}),
    AuditLog.deleteMany({})
  ]);

  console.log("Existing data cleared.");

  // 1. Seed Demo Staff Users (4 users)
  const passwordHashAdmin = await bcrypt.hash("Admin@123", 10);
  const passwordHashDoctor = await bcrypt.hash("Doctor@123", 10);
  const passwordHashReception = await bcrypt.hash("Reception@123", 10);
  const passwordHashStaff = await bcrypt.hash("Staff@123", 10);

  const adminUser = await StaffUser.create({
    name: "Super Admin",
    email: "admin@drsohaibdemo.com",
    passwordHash: passwordHashAdmin,
    role: "super_admin",
    isActive: true
  });

  const doctorUser = await StaffUser.create({
    name: "Dr. Sohaib",
    email: "doctor@drsohaibdemo.com",
    passwordHash: passwordHashDoctor,
    role: "doctor",
    isActive: true
  });

  const receptionUser = await StaffUser.create({
    name: "Bahawalpur Receptionist",
    email: "reception@drsohaibdemo.com",
    passwordHash: passwordHashReception,
    role: "receptionist",
    isActive: true
  });

  const staffUser = await StaffUser.create({
    name: "Clinic Staff",
    email: "staff@drsohaibdemo.com",
    passwordHash: passwordHashStaff,
    role: "clinic_staff",
    isActive: true
  });

  console.log("4 Demo staff users seeded.");

  // 2. Seed Doctor Profile Record
  await DoctorProfile.create({
    doctorKey: "dr-sohaib",
    doctorName: "Dr. Sohaib",
    profileImage: "/assets/dr-sohaib.png",
    qualification: "Specialist Physician & Surgeon",
    specialty: "General & Specialty Clinical Consultation, Surgical Evaluation & Patient Care",
    experience: "12+ Years Clinical Experience",
    services: "Professional Consultations, Surgical Evaluations, Comprehensive Diagnosis & Follow-up Care",
    consultationLocation: "Iqbal Hospital, Noor Mahal Road, Bahawalpur",
    consultationDays: "Monday to Thursday",
    consultationTimings: "4:30 PM to 8:30 PM",
    bio: "Dr. Sohaib is a dedicated physician and surgeon based at Iqbal Hospital, Bahawalpur. He provides professional consultations, surgical evaluations, and follow-up care for patients."
  });

  // 3. Seed Clinic Settings
  await ClinicSettings.create({
    key: "default",
    doctorName: "Dr. Sohaib",
    clinicName: "Iqbal Hospital",
    city: "Bahawalpur",
    address: "Noor Mahal Road, Bahawalpur",
    consultationDays: "Monday to Thursday",
    consultationTime: "4:30 PM to 8:30 PM",
    contactNumber: "+92 300 1234567",
    timezone: "Asia/Karachi",
    slotDurationMinutes: 15,
    updatedBy: adminUser._id
  });

  // 4. Seed 3 Clinic Location Records
  const bahawalpur = await ClinicLocation.create({
    clinicName: "Iqbal Hospital",
    city: "Bahawalpur",
    code: "BWP",
    fullAddress: "Noor Mahal Road, Bahawalpur",
    contactNumber: "+92 300 1234567",
    status: "Active",
    isActive: true,
    bookingEnabled: true,
    timezone: "Asia/Karachi",
    slotDurationMinutes: 15,
    appointmentFee: 2500,
    displayOrder: 1,
    weeklyHours: [
      { day: 1, isOpen: true, start: "16:30", end: "20:30" }, // Mon
      { day: 2, isOpen: true, start: "16:30", end: "20:30" }, // Tue
      { day: 3, isOpen: true, start: "16:30", end: "20:30" }, // Wed
      { day: 4, isOpen: true, start: "16:30", end: "20:30" }, // Thu
      { day: 5, isOpen: false, start: "16:30", end: "20:30" },
      { day: 6, isOpen: false, start: "16:30", end: "20:30" },
      { day: 7, isOpen: false, start: "16:30", end: "20:30" }
    ]
  });

  const bahawalnagar = await ClinicLocation.create({
    clinicName: "Bahawalnagar Medical Center",
    city: "Bahawalnagar",
    code: "BWN",
    fullAddress: "Main City Center, Bahawalnagar",
    contactNumber: "+92 300 1234567",
    status: "Coming Soon",
    isActive: false,
    bookingEnabled: false,
    timezone: "Asia/Karachi",
    slotDurationMinutes: 15,
    appointmentFee: 2000,
    displayOrder: 2
  });

  const rahimYarKhan = await ClinicLocation.create({
    clinicName: "Rahim Yar Khan Clinic",
    city: "Rahim Yar Khan",
    code: "RYK",
    fullAddress: "Hospital Road, Rahim Yar Khan",
    contactNumber: "+92 300 1234567",
    status: "Coming Soon",
    isActive: false,
    bookingEnabled: false,
    timezone: "Asia/Karachi",
    slotDurationMinutes: 15,
    appointmentFee: 2000,
    displayOrder: 3
  });

  console.log("3 Clinic locations seeded.");

  // 5. Seed 15 Fictional Patients
  const patientData = [
    { patientId: "PAT-100001", fullName: "Mohammad Ali", phoneE164: "+923001110001", preferredLanguage: "en", age: 45, city: "Bahawalpur", gender: "male", notes: "Joint stiffness history" },
    { patientId: "PAT-100002", fullName: "Tariq Mahmood", phoneE164: "+923001110002", preferredLanguage: "ur", age: 52, city: "Bahawalpur", gender: "male", notes: "Post-op consultation" },
    { patientId: "PAT-100003", fullName: "Ayesha Khan", phoneE164: "+923001110003", preferredLanguage: "en", age: 34, city: "Bahawalpur", gender: "female", notes: "Knee discomfort during exercise" },
    { patientId: "PAT-100004", fullName: "Usman Tariq", phoneE164: "+923001110004", preferredLanguage: "ur", age: 29, city: "Bahawalpur", gender: "male", notes: "Sports injury" },
    { patientId: "PAT-100005", fullName: "Zainab Bibi", phoneE164: "+923001110005", preferredLanguage: "ur", age: 60, city: "Bahawalpur", gender: "female", notes: "Severe joint pain" },
    { patientId: "PAT-100006", fullName: "Hamza Chaudhry", phoneE164: "+923001110006", preferredLanguage: "en", age: 24, city: "Bahawalpur", gender: "male", notes: "Ankle sprain" },
    { patientId: "PAT-100007", fullName: "Fatima Zahra", phoneE164: "+923001110007", preferredLanguage: "ur", age: 48, city: "Bahawalpur", gender: "female", notes: "Osteoporosis check" },
    { patientId: "PAT-100008", fullName: "Bilal Ahmed", phoneE164: "+923001110008", preferredLanguage: "en", age: 38, city: "Bahawalpur", gender: "male", notes: "Lower back pain" },
    { patientId: "PAT-100009", fullName: "Saira Banu", phoneE164: "+923001110009", preferredLanguage: "ur", age: 55, city: "Bahawalpur", gender: "female", notes: "Rheumatology follow-up" },
    { patientId: "PAT-100010", fullName: "Kamran Shah", phoneE164: "+923001110010", preferredLanguage: "en", age: 42, city: "Bahawalpur", gender: "male", notes: "Shoulder impingement" },
    { patientId: "PAT-100011", fullName: "Sana Malik", phoneE164: "+923001110011", preferredLanguage: "ur", age: 31, city: "Bahawalpur", gender: "female", notes: "Ligament strain" },
    { patientId: "PAT-100012", fullName: "Imran Raza", phoneE164: "+923001110012", preferredLanguage: "en", age: 50, city: "Bahawalpur", gender: "male", notes: "Degenerative disc inquiry" },
    { patientId: "PAT-100013", fullName: "Noreen Akhtar", phoneE164: "+923001110013", preferredLanguage: "ur", age: 62, city: "Bahawalpur", gender: "female", notes: "Requires wheelchair assistance" },
    { patientId: "PAT-100014", fullName: "Omer Farooq", phoneE164: "+923001110014", preferredLanguage: "en", age: 27, city: "Bahawalpur", gender: "male", notes: "Gym injury" },
    { patientId: "PAT-100015", fullName: "Rabia Rashid", phoneE164: "+923001110015", preferredLanguage: "ur", age: 39, city: "Bahawalpur", gender: "female", notes: "Routine follow-up" }
  ];

  const patients = await Patient.insertMany(patientData);
  console.log("15 Patients seeded.");

  // Valid Bahawalpur dates: 2026-08-03 (Mon), 2026-08-04 (Tue), 2026-08-05 (Wed), 2026-08-06 (Thu)
  const validDates = ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06"];
  const validTimes = ["16:30", "16:45", "17:00", "17:15", "17:30", "17:45", "18:00", "18:15", "18:30", "18:45", "19:00", "19:15", "19:30", "19:45", "20:00", "20:15"];
  const reasons = [
    "Knee Joint Evaluation",
    "Back Pain Consultation",
    "Shoulder Pain & Stiffness",
    "Post-Op Recovery Follow-up",
    "Sports Ligament Injury",
    "Arthritis Assessment",
    "Trauma & Fracture Check",
    "Routine Bone Health Check",
    "Spine Consultation",
    "Consultation & X-Ray Review"
  ];

  const statuses = [
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
  ];

  // 6. Seed 25 Fictional Appointments
  const appointmentsData = [];
  for (let i = 0; i < 25; i++) {
    const pt = patients[i % patients.length];
    const status = statuses[i % statuses.length];
    const date = validDates[i % validDates.length];
    const time = validTimes[i % validTimes.length];
    const tokenNum = String(i + 1).padStart(3, "0");
    const apptId = `DS-2026-${1001 + i}`;

    appointmentsData.push({
      appointmentId: apptId,
      tokenNumber: tokenNum,
      patient: pt._id,
      patientSnapshot: {
        fullName: pt.fullName,
        phoneMasked: pt.phoneE164.substring(0, 7) + "****",
        age: pt.age,
        gender: pt.gender,
        preferredLanguage: pt.preferredLanguage
      },
      phoneE164: pt.phoneE164,
      location: bahawalpur._id,
      locationSnapshot: {
        clinicName: bahawalpur.clinicName,
        city: bahawalpur.city,
        code: bahawalpur.code,
        address: bahawalpur.fullAddress,
        contactNumber: bahawalpur.contactNumber,
        timezone: bahawalpur.timezone
      },
      reason: reasons[i % reasons.length],
      optionalNote: `Patient note for appointment #${i + 1}`,
      date: date,
      time: time,
      status: status,
      source: i % 2 === 0 ? "whatsapp" : "website",
      reminderStatus: status === "completed" ? "sent" : "pending"
    });
  }

  const appointments = await Appointment.insertMany(appointmentsData);
  console.log("25 Appointments seeded.");

  // 7. Seed 8 Uploaded Medical Reports
  const reportTypes = ["xray", "mri", "blood_test", "prescription", "lab", "discharge", "other", "mri"];
  const reportTitles = [
    "Knee X-Ray Scan", "Lumbar Spine MRI", "Uric Acid & Blood Test", "Prescription Notes",
    "Laboratory Blood Report", "Discharge Summary", "Ultrasound Scan", "Brain MRI Scan"
  ];
  const reportStatuses = ["Uploaded", "Received", "Under Review", "Reviewed", "More Information Required", "Uploaded", "Reviewed", "Under Review"];
  
  for (let i = 0; i < 8; i++) {
    const appt = appointments[i % appointments.length];
    await MedicalReport.create({
      reportId: `RPT-10000${i + 1}`,
      patient: patients[i]._id,
      patientPhone: patients[i].phoneE164,
      appointmentId: appt.appointmentId,
      appointment: appt._id,
      reportTitle: `${patients[i].fullName} - ${reportTitles[i]}`,
      documentType: reportTypes[i],
      fileUrl: `/uploads/sample_report_${i + 1}.pdf`,
      fileName: `report_${patients[i].fullName.replace(/\s+/g, "_")}.pdf`,
      fileType: "application/pdf",
      fileSize: 1024 * 500 * (i + 1),
      notes: `Medical document uploaded for Dr. Sohaib review.`,
      status: reportStatuses[i],
      reviewedBy: i % 2 === 0 ? doctorUser._id : null,
      reviewedAt: i % 2 === 0 ? new Date() : null
    });
  }
  console.log("8 Medical Reports seeded.");

  // 8. Seed 6 Online Consultation Requests
  const consultStatuses = ["Pending", "Under Review", "Approved", "Scheduled", "Completed", "Rejected"];
  for (let i = 0; i < 6; i++) {
    await OnlineConsultation.create({
      consultationId: `VC-10000${i + 1}`,
      patient: patients[i + 2]._id,
      patientPhone: patients[i + 2].phoneE164,
      fullName: patients[i + 2].fullName,
      age: patients[i + 2].age,
      city: patients[i + 2].city,
      patientType: i % 2 === 0 ? "new" : "existing",
      appointmentId: i % 2 === 1 ? appointments[i].appointmentId : "",
      preferredDate: validDates[i % validDates.length],
      preferredTime: validTimes[i % validTimes.length],
      symptoms: `Patient complaints regarding ${reasons[i]} with symptoms for over 2 weeks.`,
      medicalHistory: `No prior surgical complications. Seeking virtual consultation with Dr. Sohaib.`,
      reportFileName: i % 2 === 0 ? `consult_report_${i + 1}.pdf` : "",
      contactPhone: patients[i + 2].phoneE164,
      status: consultStatuses[i],
      assignedDoctor: doctorUser._id,
      doctorNotes: i > 0 ? "Reviewed symptoms. Staff scheduled follow-up." : ""
    });
  }
  console.log("6 Online Consultations seeded.");

  // 9. Seed 5 Staff Conversations & 3 Human-Takeover Conversations
  for (let i = 0; i < 5; i++) {
    const pt = patients[i + 8];
    const isTakeover = i < 3;
    const session = await ConversationSession.create({
      phoneE164: pt.phoneE164,
      patient: pt._id,
      language: pt.preferredLanguage,
      intent: isTakeover ? "human_takeover" : "menu",
      state: isTakeover ? "staff_talking" : "idle",
      humanRequired: isTakeover,
      aiPaused: isTakeover,
      takenOverBy: isTakeover ? receptionUser._id : null,
      lastMessageAt: new Date()
    });

    await WhatsAppMessage.create({
      phoneE164: pt.phoneE164,
      conversation: session._id,
      direction: "incoming",
      senderType: "patient",
      body: `Assalam-o-Alaikum, I need assistance regarding Dr. Sohaib's consultation schedule.`,
      status: "read"
    });

    await WhatsAppMessage.create({
      phoneE164: pt.phoneE164,
      conversation: session._id,
      direction: "outgoing",
      senderType: isTakeover ? "staff" : "ai",
      senderStaff: isTakeover ? receptionUser._id : null,
      body: isTakeover 
        ? `Welcome to Dr. Sohaib's Clinic. I am the receptionist. How can I help you?`
        : `Welcome to Dr. Sohaib's Appointment Assistant. Type 1 to Book Appointment.`,
      status: "delivered"
    });
  }
  console.log("5 Staff Conversations (3 Human Takeovers) seeded.");

  // 10. Seed 3 Emergency Alerts
  for (let i = 0; i < 3; i++) {
    const pt = patients[i];
    await EmergencyAlert.create({
      patient: pt._id,
      phoneE164: pt.phoneE164,
      alertMessage: `EMERGENCY ALERT: Patient reporting severe acute condition requiring urgent Dr. Sohaib evaluation.`,
      priority: i === 0 ? "critical" : "high",
      status: i === 2 ? "resolved" : "open",
      resolvedBy: i === 2 ? doctorUser._id : null,
      resolutionNotes: i === 2 ? "Patient instructed to visit ER immediately." : ""
    });
  }
  console.log("3 Emergency Alerts seeded.");

  // 11. Seed 5 Follow-up Reminders
  for (let i = 0; i < 5; i++) {
    const pt = patients[i + 10];
    await ReminderJob.create({
      patient: pt._id,
      appointment: appointments[i]._id,
      phoneE164: pt.phoneE164,
      type: "follow_up_reminder",
      dueAt: new Date(Date.now() + (i + 1) * 86400000),
      message: `Friendly follow-up reminder from Dr. Sohaib's Clinic: Please remember your scheduled checkup and routine care.`,
      status: "pending"
    });
  }
  console.log("5 Follow-up Reminders seeded.");

  // 12. Seed Audit Logs
  await AuditLog.create({
    actorType: "system",
    action: "SYSTEM_SEEDED",
    entityType: "System",
    metadata: { note: "Database seeded successfully for Dr. Sohaib Clinic System." }
  });

  console.log("\n==========================================");
  console.log("SUCCESS: Database Seeding Completed!");
  console.log("Demo Credentials:");
  console.log(" - Super Admin: admin@drsohaibdemo.com / Admin@123");
  console.log(" - Doctor:      doctor@drsohaibdemo.com / Doctor@123");
  console.log(" - Reception:   reception@drsohaibdemo.com / Reception@123");
  console.log(" - Staff:       staff@drsohaibdemo.com / Staff@123");
  console.log("==========================================\n");

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
