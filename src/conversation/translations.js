const copy = {
  en: {
    language: "Please select your language / براہِ کرم اپنی زبان منتخب کریں۔",
    welcomeHeader: "Orthopedic Chatbot\nAI Appointment Assistant — Dr. Shoaib",
    welcome: "Assalam-o-Alaikum! Welcome to Dr. Shoaib's Clinic (Iqbal Hospital, Bahawalpur).\n\nI can help you with:\n• 📅 Appointment Booking & Rescheduling\n• 🏥 Clinic Information & Timings\n• 🦴 Orthopedic Services & Procedures\n• 📄 Uploading X-rays / MRI Reports\n• ☎️ Direct Contact with Reception\n\n⏰ Clinic Timings:\n• Mon–Thu: 4:30 PM – 8:30 PM\n• Friday: 8:00 PM – 9:00 PM\n• Sat–Sun: Closed\n\nWhat would you like help with today? 😊",
    chooseOption: "Choose one option from the menu below:",
    openMenuButton: "📋 Open Menu",
    menuBook: "📅 Book Appointment",
    menuBookDesc: "Schedule an in-person clinic visit",
    menuAssess: "🩺 Start Assessment",
    menuAssessDesc: "Share symptoms or joint concern",
    menuServices: "🦴 Explore Services",
    menuServicesDesc: "Orthopedic treatments & specialties",
    menuUpload: "📄 Upload X-ray / MRI",
    menuUploadDesc: "Securely attach reports for the doctor",
    menuAbout: "👨‍⚕️ About the Doctor",
    menuAboutDesc: "Qualifications, specialty & experience",
    menuClinic: "🏥 Clinic Information",
    menuClinicDesc: "Location, timings & directions",
    menuCheck: "🔎 Check Appointment",
    menuCheckDesc: "View your upcoming visit details & token",
    menuReschedule: "🔄 Reschedule Appointment",
    menuRescheduleDesc: "Change date or time of your booking",
    menuCancel: "❌ Cancel Appointment",
    menuCancelDesc: "Cancel an existing appointment",
    menuStaff: "☎️ Contact Reception",
    menuStaffDesc: "Speak directly with clinic staff",
    menuLang: "🌐 Change Language",
    menuLangDesc: "Switch between English and اردو",
    
    // Doctor details
    doctorCardTitle: "👨‍⚕️ About Dr. Shoaib",
    doctorCardBody: "*Dr. Shoaib Aslam*\n_Specialist Orthopedic & Trauma Surgeon_\n\n• *Experience:* 12+ Years Clinical & Surgical Experience\n• *Specialties:* Knee & Hip Replacement, Trauma/Fracture Surgery, Spine Care, Sports Injuries & Arthroscopy, Pediatric Bone Deformities\n• *Consultation Venue:* Iqbal Hospital, Noor Mahal Road, Bahawalpur\n• *Consultation Timings:*\n  - Monday to Thursday: 4:30 PM – 8:30 PM\n  - Friday: 8:00 PM – 9:00 PM\n• *Slot Duration:* 20 minutes per patient",
    
    // Clinic details
    clinicCardTitle: "🏥 Clinic Information",
    clinicCardBody: "*Iqbal Hospital Bahawalpur*\n📍 *Address:* Noor Mahal Road, Bahawalpur\n📞 *Contact:* +92 300 1234567\n\n⏰ *Clinic Timings:*\n• *Monday to Thursday:* 4:30 PM – 8:30 PM\n• *Friday:* 8:00 PM – 9:00 PM\n• *Saturday & Sunday:* Closed\n\n⏱ *Appointment Duration:* 20 minutes per consultation\n🏥 *Coming Soon Facilities:* Bahawalnagar & Rahim Yar Khan",

    // Services
    servicesTitle: "🦴 Orthopedic Specialties & Services",
    servicesBody: "*Dr. Shoaib provides comprehensive care for:*\n\n1. 🦴 *Fracture & Trauma Surgery* — Modern bone fixation, casting & urgent trauma care\n2. 🦵 *Joint Pain & Arthritis* — Knee, hip & shoulder osteoarthritis treatment & joint replacement\n3. 🩺 *Spine & Back Care* — Sciatica, disc herniation, slip disc & chronic back pain management\n4. 🏃 *Sports Injuries* — Ligament tears (ACL/PCL), meniscus injuries & tendonitis\n5. 👶 *Pediatric Orthopedics* — Congenital clubfoot, bow legs & bone growth disorders\n6. 🩹 *Post-Op Rehabilitation* — Structured joint mobilization and physical recovery guidance",

    // Assessment
    assessmentPrompt: "🩺 *Clinical Assessment / Symptom Check*\n\nPlease briefly describe your symptoms or concern (for example: knee pain, shoulder injury, lower back stiffness, recent fracture) and specify for how long you have experienced this.",

    // Booking Flow
    bookStep1Name: "👤 *Step 3 of 5 — Patient Name*\n\nPlease enter the patient's full name:",
    invalidName: "Please enter a valid patient name (2 to 160 letters).",
    bookStep2Age: "🎂 *Step 2 of 6 — Patient Age*\n\nPlease enter the patient's age (in years), or select for whom this booking is:",
    bookStep3Concern: "🩺 *Step 4 of 5 — Reason for Visit*\n\nWhat would you like Dr. Shoaib to look at? Pick the closest option:",
    bookStep4Clinic: "🏥 *Select Clinic Location*\n\nPlease choose your preferred clinic location:",
    bookStep5Date: "📅 *Step 1 of 5 — Choose a Date*\n\nDr. Shoaib is available Mon–Thu 4:30 PM – 8:30 PM and Friday 8:00 PM – 9:00 PM.\n\nPlease pick a date below:",
    noDatesAvailable: "📅 No open appointment dates were found. Please check back shortly or speak with reception.",
    bookStep6Time: "🕒 *Step 2 of 5 — Choose a Time*\n\nThese 20-minute slots are open on *{date}*. Please pick one:",
    noTimesAvailable: "No available slots remain on {date}. Please select a different date.",
    pickDateButton: "📅 Choose Date",
    pickTimeButton: "🕒 Choose Time",
    sectionDates: "Available Dates",
    sectionTimes: "Available Times",
    sectionConcerns: "Common Concerns",
    slotsLeftOne: "1 slot available",
    slotsLeftMany: "{count} slots available",
    dateToday: "Today",
    dateTomorrow: "Tomorrow",
    weekdayShort: "Mon,Tue,Wed,Thu,Fri,Sat,Sun",
    monthShort: "Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec",
    pickConcernButton: "🩺 Choose Concern",
    concernFracture: "🦴 Fracture / Injury",
    concernJoint: "🦵 Joint Pain / Arthritis",
    concernSpine: "🩺 Spine / Back Pain",
    concernSports: "🏃 Sports Injury",
    concernChild: "👶 Child Bone Problem",
    concernFollowUp: "🔁 Follow-up Visit",
    concernOther: "✍️ Something Else",
    concernOtherPrompt: "🩺 *Step 4 of 5 — Your Concern*\n\nPlease briefly describe the problem in your own words:",
    confirmCardBody: "✅ *Final Check*\n\nPlease confirm this appointment for *{name}*:\n\n👨‍⚕️ Dr. Shoaib\n📍 {clinic}\n📅 {date}\n🕒 {time}\n⏱️ 20 minutes",
    askReportsPrompt: "📄 *Previous Medical Records / X-rays*\n\nWould you like to attach previous X-rays, MRI scans, or prescription reports for Dr. Shoaib to review before your visit?",
    btnUploadReports: "📎 Yes, Upload Reports",
    btnSkipReports: "⏭️ Continue Without Reports",
    attachReportInstruction: "Please send your medical report as a PDF, JPEG, or PNG document now.",
    reportAttachedSuccess: "✅ Report received and securely linked to your appointment.",
    
    // Summary
    summaryTitle: "📋 Appointment Summary",
    summaryPatient: "👤 Patient:",
    summaryClinic: "🏥 Clinic:",
    summaryAddress: "📍 Address:",
    summaryDate: "📅 Date:",
    summaryTime: "🕐 Time:",
    summaryDuration: "⏱ Duration: 20 minutes",
    summaryReports: "📄 Reports:",
    summaryReportsYes: "To be attached",
    summaryReportsNo: "None attached",
    summaryDisclaimer: "_Patient-provided information only — formal clinical evaluation will take place during your in-person visit._",
    summaryConfirmPrompt: "Is everything correct? Please confirm below:",
    btnSummaryOk: "✅ Everything Is Correct",
    btnSummaryChange: "✏️ Make a Change",

    // Consent
    consentPrompt: "📋 *Patient Consent Statement*\n\n{consentText}\n\nDo you provide consent to proceed with this booking?",
    btnConsentYes: "✅ Yes, I Consent",
    btnConsentNo: "❌ No, Cancel",
    consentDeclined: "No appointment was created because consent was not provided. You may start again whenever you are ready.",

    // Confirmation
    confirmationTitle: "✅ Appointment Confirmed!",
    tokenLabel: "🎟️ Token Number:",
    appointmentIdLabel: "🆔 Appointment ID:",
    confirmedBody: "Your consultation with *Dr. Shoaib* has been confirmed.\n\n👤 *Patient:* {name}\n📅 *Date:* {date}\n🕒 *Time:* {time}\n🎟️ *Token Number:* {token}\n🆔 *Appointment ID:* {id}\n🏥 *Clinic:* Iqbal Hospital, Noor Mahal Road, Bahawalpur\n⏱ *Slot Duration:* 20 minutes\n\n_Please arrive 10 minutes prior to your scheduled time._",
    btnDirections: "📍 Get Directions",
    btnChangeAppointment: "🔄 Manage / Reschedule",
    btnContactStaff: "☎️ Talk to Reception",

    // Lookup / Check
    lookupPrompt: "🔎 *Check Appointment Status*\n\nPlease enter your Appointment ID (e.g. DS-2026-0001) or Token Number:",
    lookupNotFound: "I couldn't verify that appointment with this WhatsApp number. Please check the ID or speak with reception.",
    lookupSuccess: "📋 *Appointment Details*\n\n🆔 *ID:* {id}\n🎟️ *Token:* {token}\n👤 *Patient:* {name}\n📅 *Date:* {date}\n🕒 *Time:* {time}\n🏥 *Clinic:* {clinic}\n📊 *Status:* {status}",

    // Reschedule
    reschedulePrompt: "🔄 *Reschedule Appointment*\n\nPlease enter your Appointment ID to reschedule:",
    rescheduleDatePrompt: "Please select your new preferred date:",
    rescheduleTimePrompt: "Please select your new 20-minute time slot on {date}:",
    rescheduleConfirmPrompt: "Confirm moving Appointment *{id}* to *{date}* at *{time}*?",
    btnRescheduleConfirm: "✅ Confirm New Slot",
    btnRescheduleKeep: "❌ Keep Current Slot",
    rescheduleSuccess: "✅ *Appointment Rescheduled!*\n\nAppointment *{id}* is now scheduled for *{date}* at *{time}* (Token: {token}) at Iqbal Hospital, Bahawalpur.",
    rescheduleKept: "Your existing appointment remains unchanged.",

    // Cancel
    cancelPrompt: "❌ *Cancel Appointment*\n\nPlease enter your Appointment ID to cancel:",
    cancelConfirmPrompt: "Are you sure you want to cancel Appointment *{id}* on *{date}* at *{time}*?",
    btnCancelConfirm: "✅ Yes, Cancel Appointment",
    btnCancelKeep: "❌ No, Keep Appointment",
    cancelSuccess: "✅ Appointment *{id}* has been successfully cancelled and the slot has been released.",
    cancelKept: "Your appointment was kept active and unchanged.",

    // Navigation & General
    btnBack: "⬅️ Back",
    btnMainMenu: "🏠 Main Menu",
    btnChangeLang: "🌐 Language / زبان",
    fallbackText: "I didn't quite understand that. Please choose an option from the menu below or tap a button:",
    emergencyNotice: "🚨 *EMERGENCY MEDICAL NOTICE*\n\nIf you or the patient are experiencing a life-threatening medical emergency (such as severe open trauma, heavy uncontrolled bleeding, sudden paralysis, chest pain, or severe difficulty breathing), please visit the nearest Emergency Room or call *1122* immediately.\n\n_Automated clinical conversation is stopped and an urgent alert has been logged for clinic staff._",
    staffHandoffMessage: "🤝 *Connecting to Clinic Reception*\n\nI have transferred your conversation to Dr. Shoaib's reception team at Iqbal Hospital. A staff member will assist you shortly on WhatsApp or call you back if urgent.",
    errorGeneric: "We could not complete that request at this moment. Please try again or contact clinic reception."
  },
  ur: {
    language: "براہِ کرم اپنی زبان منتخب کریں / Please select your language.",
    welcomeHeader: "آرتھوپیڈک چیٹ باٹ\nڈاکٹر شعیب — اے آئی اپائنٹمنٹ اسسٹنٹ",
    welcome: "*السلام علیکم!* ڈاکٹر شعیب کے کلینک (اقبال ہسپتال، بہاولپور) میں خوش آمدید۔\n\nمیں درج ذیل امور میں آپ کی رہنمائی کر سکتا ہوں:\n• 📅 اپائنٹمنٹ بکنگ اور وقت کی تبدیلی\n• 🏥 کلینک کی معلومات اور اوقات\n• 🦴 ہڈیوں، جوڑوں اور پٹھوں کے علاج کی تفصیلات\n• 📄 ایکسرے اور ایم آر آئی رپورٹس کا اندراج\n• ☎️ استقبالیہ اور عملے سے براہ راست رابطہ\n\n⏰ *کلینک کے اوقات:*\n• *پیر تا جمعرات:* شام 4:30 سے رات 8:30 تک\n• *جمعہ:* رات 8:00 سے رات 9:00 تک\n• *ہفتہ و اتوار:* چھٹی\n\n_آج میں آپ کی کیا مدد کر سکتا ہوں؟_ 😊",
    chooseOption: "براہِ کرم نیچے دیے گئے مینو میں سے ایک آپشن منتخب کریں:",
    openMenuButton: "📋 مینو کھولیں",
    menuBook: "📅 اپائنٹمنٹ بک کریں",
    menuBookDesc: "کلینک میں معائنے کے لیے نیا وقت بک کریں",
    menuAssess: "🩺 علامات اور معائنہ",
    menuAssessDesc: "اپنی تکلیف یا بیماری کی تفصیل بتائیں",
    menuServices: "🦴 کلینک کی سہولیات",
    menuServicesDesc: "ہڈیوں اور جوڑوں کے امراض کے علاج کی تفصیل",
    menuUpload: "📄 ایکسرے / ایم آر آئی اپ لوڈ",
    menuUploadDesc: "ڈاکٹر کے معائنے کے لیے پرانی رپورٹس منسلک کریں",
    menuAbout: "👨‍⚕️ ڈاکٹر شعیب کا تعارف",
    menuAboutDesc: "تعلیم، تجربہ اور سرجیکل مہارت",
    menuClinic: "🏥 کلینک معلومات و اوقات",
    menuClinicDesc: "پتہ، رابطہ اور او پی ڈی کے اوقات",
    menuCheck: "🔎 اپائنٹمنٹ چیک کریں",
    menuCheckDesc: "اپنی بکنگ، تاریخ، وقت اور ٹوکن نمبر دیکھیں",
    menuReschedule: "🔄 تاریخ یا وقت تبدیل کریں",
    menuRescheduleDesc: "پہلے سے طے شدہ اپائنٹمنٹ کا وقت بدلیں",
    menuCancel: "❌ اپائنٹمنٹ منسوخ کریں",
    menuCancelDesc: "اپنی بک شدہ اپائنٹمنٹ منسوخ کریں",
    menuStaff: "☎️ عملے سے رابطہ کریں",
    menuStaffDesc: "کلینک استقبالیہ ٹیم سے براہ راست بات کریں",
    menuLang: "🌐 زبان تبدیل کریں",
    menuLangDesc: "اردو یا انگریزی زبان کا انتخاب کریں",

    // Doctor details
    doctorCardTitle: "👨‍⚕️ ڈاکٹر شعیب کے بارے میں",
    doctorCardBody: "*ڈاکٹر شعیب اسلم*\n_ماہر امراض ہڈی، جوڑ، مہرے و ٹراما سرجن_\n\n• *تجربہ:* 12 سال سے زائد کلینیکل اور سرجیکل تجربہ\n• *خصوصی مہارت:* گھٹنے اور کولہے کی تبدیلی (Joint Replacement)، فریکچر اور ہڈیوں کے جوڑ، مہروں و کمر کا درد، کھیلوں کی چوٹیں (Sports Injuries) اور بچوں کی ہڈیوں کے مسائل\n• *کلینک کی جگہ:* اقبال ہسپتال، نور محل روڈ، بہاولپور\n• *معائنے کے اوقات:*\n  - پیر تا جمعرات: شام 4:30 سے رات 8:30 تک\n  - جمعہ: رات 8:00 سے رات 9:00 تک\n• *معائنے کا دورانیہ:* 20 منٹ فی مریض",

    // Clinic details
    clinicCardTitle: "🏥 کلینک کی معلومات",
    clinicCardBody: "*اقبال ہسپتال بہاولپور*\n📍 *پتہ:* نور محل روڈ، بہاولپور\n📞 *رابطہ نمبر:* 0300-1234567\n\n⏰ *کلینک کے اوقات:*\n• *پیر تا جمعرات:* شام 4:30 سے رات 8:30 تک\n• *جمعہ:* رات 8:00 سے رات 9:00 تک\n• *ہفتہ و اتوار:* چھٹی\n\n⏱ *اپائنٹمنٹ کا دورانیہ:* 20 منٹ فی معائنہ\n🏥 *جلد فعال ہونے والے کلینکس:* بہاولنگر اور رحیم یار خان",

    // Services
    servicesTitle: "🦴 کلینک کی خصوصی سہولیات",
    servicesBody: "*ڈاکٹر شعیب درج ذیل امراض کا مکمل علاج فراہم کرتے ہیں:*\n\n1. 🦴 *فریکچر اور ٹراما سرجری* — ٹوٹی ہوئی ہڈیوں کا جدید علاج اور پلاسٹر\n2. 🦵 *جوڑوں کا درد اور آرتھرائٹس* — گھٹنے، کولہے اور کندھے کے درد کا علاج و تبدیلی\n3. 🩺 *کمر اور مہروں کا علاج* — مہروں کے درد، شیاٹیکا (عرق النساء) اور ڈسک کے مسائل\n4. 🏃 *کھیلوں کی چوٹیں اور پٹھے* — پٹھوں کا کھنچاؤ، لیگامنٹ کے مسائل (ACL) اور آرتھروسکوپی\n5. 👶 *بچوں کی ہڈیوں کے امراض* — پیدائشی ٹیڑھے پاؤں اور ہڈیوں کی نشوونما کے نقائص\n6. 🩹 *آپریشن کے بعد بحالی* — جوڑوں کی حرکت اور فزیوتھراپی سے متعلق رہنمائی",

    // Assessment
    assessmentPrompt: "🩺 *معائنہ اور علامات کا اندراج*\n\nبراہ کرم اپنی تکلیف یا علامات کی مختصر تفصیل بتائیں (مثلاً: گھٹنے میں درد، کمر کا کھنچاؤ، کندھے کی چوٹ، یا حالیہ فریکچر) اور یہ بھی بتائیں کہ یہ تکلیف کتنے عرصے سے ہے:",

    // Booking Flow
    bookStep1Name: "👤 *مرحلہ 3 از 5 — مریض کا نام*\n\nبراہِ کرم مریض کا پورا نام درج کریں:",
    invalidName: "براہِ کرم درست نام درج کریں (2 سے 160 حروف)۔",
    bookStep2Age: "🎂 *مرحلہ 2 از 6 — مریض کی عمر*\n\nبراہِ کرم مریض کی عمر (سالوں میں) درج کریں:",
    bookStep3Concern: "🩺 *مرحلہ 4 از 5 — معائنے کی وجہ*\n\nڈاکٹر شعیب کو کیا دکھانا چاہتے ہیں؟ قریب ترین آپشن منتخب کریں:",
    bookStep4Clinic: "🏥 *کلینک کا انتخاب*\n\nبراہِ کرم اپنی پسند کا کلینک منتخب کریں:",
    bookStep5Date: "📅 *مرحلہ 1 از 5 — تاریخ منتخب کریں*\n\nڈاکٹر شعیب پیر تا جمعرات شام 4:30 سے رات 8:30 اور جمعہ رات 8:00 سے 9:00 تک دستیاب ہیں۔\n\nبراہ کرم نیچے سے تاریخ منتخب کریں:",
    noDatesAvailable: "📅 فی الحال کوئی تاریخ دستیاب نہیں ہے۔ براہ کرم کچھ دیر بعد چیک کریں یا عملے سے رابطہ کریں۔",
    bookStep6Time: "🕒 *مرحلہ 2 از 5 — وقت منتخب کریں*\n\n*{date}* کو یہ 20 منٹ کے اوقات دستیاب ہیں۔ براہ کرم ایک منتخب کریں:",
    noTimesAvailable: "اس تاریخ پر مزید کوئی وقت دستیاب نہیں ہے۔ براہ کرم دوسری تاریخ منتخب کریں۔",
    pickDateButton: "📅 تاریخ منتخب کریں",
    pickTimeButton: "🕒 وقت منتخب کریں",
    sectionDates: "دستیاب تاریخیں",
    sectionTimes: "دستیاب اوقات",
    sectionConcerns: "عام شکایات",
    slotsLeftOne: "1 وقت دستیاب",
    slotsLeftMany: "{count} اوقات دستیاب",
    dateToday: "آج",
    dateTomorrow: "کل",
    weekdayShort: "پیر,منگل,بدھ,جمعرات,جمعہ,ہفتہ,اتوار",
    monthShort: "جنوری,فروری,مارچ,اپریل,مئی,جون,جولائی,اگست,ستمبر,اکتوبر,نومبر,دسمبر",
    pickConcernButton: "🩺 شکایت منتخب کریں",
    concernFracture: "🦴 فریکچر / چوٹ",
    concernJoint: "🦵 جوڑوں کا درد",
    concernSpine: "🩺 کمر یا مہروں کا درد",
    concernSports: "🏃 کھیل کی چوٹ",
    concernChild: "👶 بچے کی ہڈی کا مسئلہ",
    concernFollowUp: "🔁 دوبارہ معائنہ",
    concernOther: "✍️ کوئی اور مسئلہ",
    concernOtherPrompt: "🩺 *مرحلہ 4 از 5 — آپ کی شکایت*\n\nبراہ کرم اپنی تکلیف مختصر الفاظ میں بیان کریں:",
    confirmCardBody: "✅ *آخری تصدیق*\n\nبراہ کرم *{name}* کے لیے اس اپائنٹمنٹ کی تصدیق کریں:\n\n👨‍⚕️ ڈاکٹر شعیب\n📍 {clinic}\n📅 {date}\n🕒 {time}\n⏱️ 20 منٹ",
    askReportsPrompt: "📄 *پرانی ٹیسٹ رپورٹس یا ایکسرے*\n\nکیا آپ ڈاکٹر شعیب کے معائنے سے قبل پرانا ایکسرے، ایم آر آئی یا نسخہ منسلک کرنا چاہتے ہیں؟",
    btnUploadReports: "📎 جی ہاں، رپورٹ اپ لوڈ کریں",
    btnSkipReports: "⏭️ بغیر رپورٹ کے آگے بڑھیں",
    attachReportInstruction: "براہِ کرم اپنی رپورٹ اب PDF، JPEG یا PNG فارمیٹ میں بھیجیں۔",
    reportAttachedSuccess: "✅ رپورٹ کامیابی سے وصول ہو گئی ہے اور آپ کی اپائنٹمنٹ کے ساتھ منسلک کر دی گئی ہے۔",

    // Summary
    summaryTitle: "📋 اپائنٹمنٹ کی تفصیلات",
    summaryPatient: "👤 مریض کا نام:",
    summaryClinic: "🏥 کلینک:",
    summaryAddress: "📍 پتہ:",
    summaryDate: "📅 تاریخ:",
    summaryTime: "🕐 وقت:",
    summaryDuration: "⏱ دورانیہ: 20 منٹ",
    summaryReports: "📄 رپورٹس:",
    summaryReportsYes: "منسلک کی جائیں گی",
    summaryReportsNo: "منسلک نہیں ہیں",
    summaryDisclaimer: "_یہ مریض کی فراہم کردہ معلومات ہیں — باقاعدہ معائنہ کلینک آمد پر کیا جائے گا۔_",
    summaryConfirmPrompt: "کیا تمام معلومات درست ہیں؟ براہِ کرم تصدیق کریں:",
    btnSummaryOk: "✅ تمام معلومات درست ہیں",
    btnSummaryChange: "✏️ تبدیلی کریں",

    // Consent
    consentPrompt: "📋 *مریض کی رضامندی*\n\n{consentText}\n\nکیا آپ اس اپائنٹمنٹ کے لیے رضامند ہیں؟",
    btnConsentYes: "✅ جی ہاں، میں رضامند ہوں",
    btnConsentNo: "❌ نہیں، منسوخ کریں",
    consentDeclined: "رضامندی نہ دینے کی وجہ سے اپائنٹمنٹ بک نہیں کی گئی۔ آپ جب چاہیں دوبارہ شروع کر سکتے ہیں۔",

    // Confirmation
    confirmationTitle: "✅ اپائنٹمنٹ بک ہو گئی ہے!",
    tokenLabel: "🎟️ ٹوکن نمبر:",
    appointmentIdLabel: "🆔 اپائنٹمنٹ آئی ڈی:",
    confirmedBody: "ڈاکٹر شعیب کے ساتھ آپ کی اپائنٹمنٹ کامیابی سے بک ہو گئی ہے۔\n\n👤 *مریض:* {name}\n📅 *تاریخ:* {date}\n🕒 *وقت:* {time}\n🎟️ *ٹوکن نمبر:* {token}\n🆔 *اپائنٹمنٹ آئی ڈی:* {id}\n🏥 *کلینک:* اقبال ہسپتال، نور محل روڈ، بہاولپور\n⏱ *دورانیہ:* 20 منٹ\n\n_براہِ کرم اپنے مقررہ وقت سے 10 منٹ قبل کلینک تشریف لائیں۔_",
    btnDirections: "📍 کلینک کا پتہ و راستہ",
    btnChangeAppointment: "🔄 اپائنٹمنٹ تبدیل کریں",
    btnContactStaff: "☎️ عملے سے بات کریں",

    // Lookup / Check
    lookupPrompt: "🔎 *اپائنٹمنٹ چیک کریں*\n\nبراہِ کرم اپنی اپائنٹمنٹ آئی ڈی (مثلاً DS-2026-0001) یا ٹوکن نمبر درج کریں:",
    lookupNotFound: "اس واٹس ایپ نمبر پر اس آئی ڈی سے کوئی فعال اپائنٹمنٹ نہیں ملی۔ براہ کرم عملے سے رابطہ کریں۔",
    lookupSuccess: "📋 *اپائنٹمنٹ کی تفصیلات*\n\n🆔 *آئی ڈی:* {id}\n🎟️ *ٹوکن:* {token}\n👤 *مریض:* {name}\n📅 *تاریخ:* {date}\n🕒 *وقت:* {time}\n🏥 *کلینک:* {clinic}\n📊 *سٹیٹس:* {status}",

    // Reschedule
    reschedulePrompt: "🔄 *اپائنٹمنٹ کا وقت بدلیں*\n\nبراہِ کرم وہ اپائنٹمنٹ آئی ڈی بھیجیں جس کا وقت آپ بدلنا چاہتے ہیں:",
    rescheduleDatePrompt: "براہِ کرم نئی تاریخ منتخب کریں:",
    rescheduleTimePrompt: "براہِ کرم {date} کے لیے نیا 20 منٹ کا وقت منتخب کریں:",
    rescheduleConfirmPrompt: "کیا آپ اپائنٹمنٹ *{id}* کو *{date}* بوقت *{time}* پر منتقل کرنا چاہتے ہیں؟",
    btnRescheduleConfirm: "✅ وقت تبدیل کریں",
    btnRescheduleKeep: "❌ پرانا وقت برقرار رکھیں",
    rescheduleSuccess: "✅ *اپائنٹمنٹ کا وقت تبدیل ہو گیا ہے!*\n\nآپ کی اپائنٹمنٹ *{id}* اب *{date}* بوقت *{time}* (ٹوکن: {token}) اقبال ہسپتال، بہاولپور میں شیڈول ہے۔",
    rescheduleKept: "آپ کی پہلے والی اپائنٹمنٹ برقرار رکھی گئی ہے۔",

    // Cancel
    cancelPrompt: "❌ *اپائنٹمنٹ منسوخ کریں*\n\nبراہِ کرم وہ اپائنٹمنٹ آئی ڈی درج کریں جسے آپ منسوخ کرنا چاہتے ہیں:",
    cancelConfirmPrompt: "کیا آپ واقعی اپائنٹمنٹ *{id}* بتاریخ *{date}* بوقت *{time}* منسوخ کرنا چاہتے ہیں؟",
    btnCancelConfirm: "✅ جی ہاں، منسوخ کریں",
    btnCancelKeep: "❌ نہیں، برقرار رکھیں",
    cancelSuccess: "✅ اپائنٹمنٹ *{id}* منسوخ کر دی گئی ہے اور سلاٹ خالی کر دیا گیا ہے۔",
    cancelKept: "آپ کی اپائنٹمنٹ فعال اور برقرار ہے۔",

    // Navigation & General
    btnBack: "⬅️ واپس",
    btnMainMenu: "🏠 مین مینو",
    btnChangeLang: "🌐 زبان تبدیل کریں",
    fallbackText: "میں آپ کی بات پوری طرح سمجھ نہیں سکا۔ براہِ کرم نیچے دیے گئے مینو میں سے انتخاب کریں:",
    emergencyNotice: "🚨 *ہنگامی طبی اطلاع*\n\nاگر مریض کی حالت تشویشناک ہے (مثلاً شدید فریکچر، بے تحاشہ خون، بے ہوشی، یا سانس کی شدید تکلیف)، تو فوری طور پر قریبی ہسپتال تشریف لے جائیں یا *1122* پر کال کریں۔\n\n_خودکار گفتگو روک دی گئی ہے اور کلینک عملے کو ہنگامی اطلاع بھیج دی گئی ہے۔_",
    staffHandoffMessage: "🤝 *استقبالیہ سے رابطہ*\n\nآپ کی گفتگو ڈاکٹر شعیب کے کلینک عملے کو منتقل کر دی گئی ہے۔ عملے کا نمائندہ جلد آپ سے واٹس ایپ پر رابطہ کرے گا۔",
    errorGeneric: "درخواست پر عمل نہیں ہو سکا۔ براہ کرم دوبارہ کوشش کریں یا کلینک عملے سے رابطہ کریں۔"
  }
};

function tr(language, key, variables = {}) {
  const lang = language === "ur" ? "ur" : "en";
  let text = copy[lang][key] || copy.en[key] || key;
  for (const [varName, varVal] of Object.entries(variables)) {
    text = text.replace(new RegExp(`\\{${varName}\\}`, "g"), String(varVal ?? ""));
  }
  return text;
}

module.exports = { copy, tr };
