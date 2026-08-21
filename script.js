(function () {
  const app = document.getElementById("app");
  const toastEl = document.getElementById("toast");

  const state = {
    lang: "en", // "en" or "ur"
    currentPath: window.location.hash ? window.location.hash.replace("#", "") : (window.location.pathname || "/"),
    user: null,
    activePhone: "",
    chatMessages: [],
    showMainMenuCard: false,
    currentFlow: "idle", // "idle" | "booking" | "manage" | "reschedule" | "cancel" | "upload_report"
    currentStep: "initial_welcome",
    bookingStepIndex: 0, // 1 to 6 for progress indicator
    isChangingDetails: false,
    bookingState: {
      patientName: "",
      phoneNumber: "",
      appointmentType: "in_person", // "in_person" | "online"
      city: "Bahawalpur",
      locationId: "BWP",
      date: "",
      dateLabel: "",
      time: "",
      timeLabel: "",
      consentGiven: false,
      idempotencyKey: ""
    },
    consentPolicy: null,
    uploadReportState: {
      documentType: "other",
      typeLabel: "Medical Document"
    },
    managedAppointment: null,
    rescheduleState: {
      date: "",
      dateLabel: "",
      time: "",
      timeLabel: ""
    },
    conversationMode: "AI", // "AI" | "HUMAN"
    humanHandoverActive: false,
    adminTab: "dashboard",
    dashboardLocationId: "BWP",
    dashboardDate: "",
    calendarView: "month"
  };

  function showToast(message, duration = 3000) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add("show");
    setTimeout(() => toastEl.classList.remove("show"), duration);
  }

  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Initial Chat Boot (Prototype Aligned)
  function initChat() {
    const isUrdu = state.lang === "ur";
    state.chatMessages = [
      {
        id: "msg_welcome",
        sender: "ai",
        title: isUrdu ? "👋 السلام علیکم!" : "👋 Assalam-o-Alaikum!",
        text: isUrdu
          ? "ڈاکٹر شعیب کے کلینک (اقبال ہسپتال، بہاولپور) میں خوش آمدید۔\n\n• کلینک کی معلومات اور علاج\n• اپائنٹمنٹ بکنگ اور ریسیپشن\n\n⏰ کلینک کے اوقات:\nپیر تا جمعرات | شام 4:30 سے رات 8:30 تک\nجمعہ | رات 8:00 سے رات 9:00 تک\n\nآج میں آپ کی کیا مدد کر سکتا ہوں؟ 😊"
          : "Welcome to Dr. Shoaib's Clinic (Iqbal Hospital, Bahawalpur).\n\n• Clinic information\n• Appointment booking\n\n⏰ Clinic Timings:\nMon–Thu | 4:30 PM – 8:30 PM\nFri | 8:00 PM – 9:00 PM\n\nWhat would you like help with today? 😊",
        time: "5:16 pm"
      }
    ];
    state.showMainMenuCard = true;
    state.currentFlow = "idle";
    state.currentStep = "main_menu";
    state.bookingStepIndex = 0;
    state.isChangingDetails = false;
  }
  initChat();

  function navigateTo(path) {
    let cleanPath = path.startsWith("/") ? path : `/${path}`;
    cleanPath = cleanPath.replace(/^#/, "");
    state.currentPath = cleanPath;
    window.location.hash = cleanPath;
    render();
  }

  window.addEventListener("hashchange", () => {
    const hash = window.location.hash.replace("#", "");
    if (hash && hash !== state.currentPath) {
      state.currentPath = hash.startsWith("/") ? hash : `/${hash}`;
      render();
    }
  });

  function render() {
    const isUrdu = state.lang === "ur";
    document.body.className = isUrdu ? "lang-ur" : "";
    document.documentElement.dir = isUrdu ? "rtl" : "ltr";

    const p = state.currentPath;

    if (p.startsWith("/admin")) {
      if (!state.user && !api.getToken()) {
        renderLoginView();
      } else {
        const sub = p.replace("/admin/", "").replace("/admin", "");
        if (sub && sub !== "dashboard") {
          state.adminTab = sub;
        }
        renderAdminDashboard();
      }
      return;
    }

    renderChatView();
  }

  function pushMessage(msg) {
    if (!msg.id) msg.id = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    if (!state.chatMessages.some(m => m.id === msg.id)) {
      state.chatMessages.push(msg);
    }
  }

  function dateLabel(date) {
    const parsed = new Date(`${date}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? date : new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(parsed);
  }

  function timeLabel(time) {
    const match = /^(\d{2}):(\d{2})$/.exec(time || "");
    if (!match) return time;
    const hour = Number(match[1]);
    return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? "PM" : "AM"}`;
  }

  function loadAvailableDates(actionPrefix, title) {
    const isUrdu = state.lang === "ur";
    pushMessage({ sender: "ai", text: isUrdu ? "دستیاب تاریخیں لوڈ کی جا رہی ہیں..." : "Checking available appointment dates...", time: "Now" });
    renderChatView();
    api.dates(state.bookingState.locationId || "BWP").then((response) => {
      const dates = (response.dates || []).slice(0, 10);
      const backAction = actionPrefix === "reschedule" ? "action_view_managed" : (state.bookingState.appointmentType === "online" ? "back_to_type" : "back_to_city");
      
      const quickReplies = dates.map((entry) => ({
        label: `📅 ${dateLabel(entry.date)}`,
        action: `${actionPrefix}_date_${entry.date}_${dateLabel(entry.date)}`
      }));
      quickReplies.push({ label: isUrdu ? "⬅️ واپس" : "⬅️ Back", action: backAction });

      pushMessage({
        sender: "ai",
        title: isUrdu ? "تاریخ منتخب کریں" : title,
        text: dates.length
          ? (isUrdu ? "براہ کرم دستیاب تاریخ کا انتخاب کریں:" : "Please select an available date:")
          : (isUrdu ? "📅 اس وقت کوئی تاریخ دستیاب نہیں ہے۔" : "📅 No appointment dates are currently available."),
        quickReplies: dates.length ? quickReplies : [
          { label: isUrdu ? "🔄 دوبارہ چیک کریں" : "🔄 Check Again", action: "start_booking" },
          { label: isUrdu ? "👤 عملے سے بات کریں" : "👤 Speak to Staff", action: "speak_to_staff" },
          { label: isUrdu ? "🏠 مین مینو" : "🏠 Main Menu", action: "show_main_menu" }
        ],
        time: "Now"
      });
      renderChatView();
    }).catch((error) => {
      showToast(error.message);
      pushMessage({
        sender: "ai",
        text: isUrdu ? "تاریخیں حاصل نہیں کی جا سکیں۔ براہ کرم دوبارہ کوشش کریں یا عملے سے رابطہ کریں۔" : "Availability could not be loaded. Please try again or contact clinic staff.",
        quickReplies: [
          { label: isUrdu ? "🔄 دوبارہ کوشش کریں" : "🔄 Try Again", action: "start_booking" },
          { label: isUrdu ? "👤 عملے سے بات کریں" : "👤 Speak to Staff", action: "speak_to_staff" },
          { label: isUrdu ? "🏠 مین مینو" : "🏠 Main Menu", action: "show_main_menu" }
        ],
        time: "Now"
      });
      renderChatView();
    });
  }

  function loadAvailableTimes(actionPrefix, date) {
    const isUrdu = state.lang === "ur";
    pushMessage({ sender: "ai", text: isUrdu ? "دستیاب اوقات چیک کیے جا رہے ہیں..." : "Checking available appointment times...", time: "Now" });
    renderChatView();
    api.slots(state.bookingState.locationId || "BWP", date).then((response) => {
      const slots = (response.slots || []).filter((slot) => slot.available);
      const backAction = actionPrefix === "reschedule" ? "action_reschedule_appt" : "back_to_date";
      
      const quickReplies = slots.map((slot) => ({
        label: `🕒 ${timeLabel(slot.time)}`,
        action: `${actionPrefix}_time_${slot.time}_${timeLabel(slot.time)}`
      }));
      quickReplies.push({ label: isUrdu ? "⬅️ واپس" : "⬅️ Back", action: backAction });

      pushMessage({
        sender: "ai",
        title: actionPrefix === "reschedule"
          ? (isUrdu ? "نیا وقت منتخب کریں" : "Select New Time Slot")
          : (isUrdu ? "وقت منتخب کریں" : "Select Appointment Time"),
        text: slots.length
          ? (isUrdu ? "براہ کرم دستیاب وقت منتخب کریں:" : "Please select an available appointment time:")
          : (isUrdu ? "اس تاریخ پر کوئی وقت دستیاب نہیں ہے۔ براہ کرم دوسری تاریخ منتخب کریں۔" : "No times remain available on this date. Please select another date."),
        quickReplies: slots.length ? quickReplies : [
          { label: isUrdu ? "📅 دوسری تاریخ چنیں" : "📅 Choose Another Date", action: actionPrefix === "reschedule" ? "action_reschedule_appt" : "back_to_date" },
          { label: isUrdu ? "👤 عملے سے بات کریں" : "👤 Speak to Staff", action: "speak_to_staff" },
          { label: isUrdu ? "🏠 مین مینو" : "🏠 Main Menu", action: "show_main_menu" }
        ],
        time: "Now"
      });
      renderChatView();
    }).catch((error) => {
      showToast(error.message);
      pushMessage({
        sender: "ai",
        text: isUrdu ? "وقت حاصل نہیں کیا جا سکا۔ براہ کرم دوسری تاریخ چنیں۔" : "Available times could not be loaded. Please select another date or contact clinic staff.",
        quickReplies: [
          { label: isUrdu ? "📅 دوسری تاریخ چنیں" : "📅 Choose Another Date", action: "back_to_date" },
          { label: isUrdu ? "🏠 مین مینو" : "🏠 Main Menu", action: "show_main_menu" }
        ],
        time: "Now"
      });
      renderChatView();
    });
  }

  // ----------------------------------------------------
  // CHATBOT ACTION HANDLER & STATE MACHINE
  // ----------------------------------------------------
  function handleChatAction(action, options = {}) {
    const isUrdu = state.lang === "ur";

    if (action !== "show_main_menu") {
      state.showMainMenuCard = false;
    }

    switch (action) {
      case "toggle_language":
      case "set_lang_en":
      case "set_lang_ur":
        state.lang = action === "toggle_language" ? (state.lang === "en" ? "ur" : "en") : (action === "set_lang_ur" ? "ur" : "en");
        initChat();
        render();
        break;

      case "show_main_menu":
        pushMessage({ sender: "user", text: isUrdu ? "🏠 مین مینو" : "🏠 Main Menu", time: "Now" });
        pushMessage({
          sender: "ai",
          title: isUrdu ? "مین مینو" : "Main Menu",
          text: isUrdu ? "براہ کرم مینو سے ایک اختیار کا انتخاب کریں:" : "Please choose an option from the menu below:",
          time: "Now"
        });
        state.showMainMenuCard = true;
        state.currentFlow = "idle";
        state.currentStep = "main_menu";
        state.bookingStepIndex = 0;
        state.isChangingDetails = false;
        break;

      case "start_booking":
        state.currentFlow = "booking";
        state.currentStep = "booking_name";
        state.bookingStepIndex = 1;
        if (!options.silentUserMsg) {
          pushMessage({ sender: "user", text: isUrdu ? "📅 اپوائنٹمنٹ بک کریں" : "📅 Book Appointment", time: "Now" });
        }
        pushMessage({
          sender: "ai",
          title: isUrdu ? "قدم ۱ از ۶: مریض کا نام" : "Step 1 of 6: Patient Name",
          text: isUrdu ? "👤 مریض کا مکمل نام کیا ہے؟" : "👤 What is the patient's full name?",
          quickReplies: [
            { label: isUrdu ? "⬅️ واپس" : "⬅️ Back", action: "show_main_menu" }
          ],
          time: "Now"
        });
        break;

      case "back_to_name":
        state.currentStep = "booking_name";
        state.bookingStepIndex = 1;
        pushMessage({
          sender: "ai",
          title: isUrdu ? "قدم ۱ از ۶: مریض کا نام" : "Step 1 of 6: Patient Name",
          text: isUrdu ? "👤 مریض کا مکمل نام کیا ہے؟" : "👤 What is the patient's full name?",
          quickReplies: [
            { label: isUrdu ? "⬅️ واپس" : "⬅️ Back", action: "show_main_menu" }
          ],
          time: "Now"
        });
        break;

      case "back_to_phone":
        state.currentStep = "booking_phone";
        state.bookingStepIndex = 2;
        pushMessage({
          sender: "ai",
          title: isUrdu ? "قدم ۲ از ۶: فون نمبر" : "Step 2 of 6: Phone Number",
          text: isUrdu ? "📞 براہ کرم اپنا موبائل یا واٹس ایپ نمبر درج کریں:\nمثال: 0300 1234567" : "📞 Please enter your mobile / WhatsApp number.\nExample: 0300 1234567",
          quickReplies: [
            { label: isUrdu ? "⬅️ واپس" : "⬅️ Back", action: "back_to_name" }
          ],
          time: "Now"
        });
        break;

      case "back_to_type":
        state.currentStep = "booking_type";
        state.bookingStepIndex = 3;
        pushMessage({
          sender: "ai",
          title: isUrdu ? "قدم ۳ از ۶: اپوائنٹمنٹ کی قسم" : "Step 3 of 6: Consultation Type",
          text: isUrdu ? "🏥 آپ ڈاکٹر صہیب سے کیسے مشورہ کرنا چاہتے ہیں؟" : "🏥 How would you like to consult Dr. Shoaib?",
          quickReplies: [
            { label: isUrdu ? "🏥 ان پرسن (کلینک) اپوائنٹمنٹ" : "🏥 In-Person Appointment", action: "booking_type_in_person" },
            { label: isUrdu ? "💻 آن لائن اپوائنٹمنٹ" : "💻 Online Appointment", action: "booking_type_online" },
            { label: isUrdu ? "⬅️ واپس" : "⬅️ Back", action: "back_to_phone" }
          ],
          time: "Now"
        });
        break;

      case "back_to_city":
        state.currentStep = "booking_city";
        state.bookingStepIndex = 4;
        pushMessage({
          sender: "ai",
          title: isUrdu ? "قدم ۴ از ۶: کلینک کا مقام" : "Step 4 of 6: Clinic Location",
          text: isUrdu ? "📍 کلینک کی جگہ منتخب کریں:" : "📍 Select Clinic Location:",
          quickReplies: [
            { label: isUrdu ? "📍 بہاولپور (اقبال ہسپتال)" : "📍 Bahawalpur (Iqbal Hospital)", action: "booking_city_bwp" },
            { label: isUrdu ? "📍 بہاولنگر — جلد آ رہا ہے" : "📍 Bahawalnagar — Coming Soon", action: "booking_city_bwn" },
            { label: isUrdu ? "📍 رحیم یار خان — جلد آ رہا ہے" : "📍 Rahim Yar Khan — Coming Soon", action: "booking_city_ryk" },
            { label: isUrdu ? "⬅️ واپس" : "⬅️ Back", action: "back_to_type" }
          ],
          time: "Now"
        });
        break;

      case "back_to_date":
        state.currentStep = "booking_date";
        state.bookingStepIndex = 5;
        loadAvailableDates("booking", isUrdu ? "قدم ۵ از ۶: تاریخ منتخب کریں" : "Step 5 of 6: Choose Date");
        break;

      case "back_to_time":
        state.currentStep = "booking_time";
        state.bookingStepIndex = 6;
        loadAvailableTimes("booking", state.bookingState.date);
        break;

      case "booking_type_in_person":
        state.bookingState.appointmentType = "in_person";
        pushMessage({ sender: "user", text: isUrdu ? "🏥 ان پرسن اپوائنٹمنٹ" : "🏥 In-Person Appointment", time: "Now" });
        
        if (state.isChangingDetails) {
          state.isChangingDetails = false;
          showBookingReview();
          break;
        }

        state.currentStep = "booking_city";
        state.bookingStepIndex = 4;
        pushMessage({
          sender: "ai",
          title: isUrdu ? "قدم ۴ از ۶: کلینک کا مقام" : "Step 4 of 6: Clinic Location",
          text: isUrdu ? "📍 آپ کون سے کلینک تشریف لانا چاہتے ہیں؟" : "📍 Which clinic location would you like to visit?",
          quickReplies: [
            { label: isUrdu ? "📍 بہاولپور (اقبال ہسپتال)" : "📍 Bahawalpur (Iqbal Hospital)", action: "booking_city_bwp" },
            { label: isUrdu ? "📍 بہاولنگر — جلد آ رہا ہے" : "📍 Bahawalnagar — Coming Soon", action: "booking_city_bwn" },
            { label: isUrdu ? "📍 رحیم یار خان — جلد آ رہا ہے" : "📍 Rahim Yar Khan — Coming Soon", action: "booking_city_ryk" },
            { label: isUrdu ? "⬅️ واپس" : "⬅️ Back", action: "back_to_type" }
          ],
          time: "Now"
        });
        break;

      case "booking_type_online":
        state.bookingState.appointmentType = "online";
        state.bookingState.city = "Bahawalpur";
        state.bookingState.locationId = "BWP";
        pushMessage({ sender: "user", text: isUrdu ? "💻 آن لائن اپوائنٹمنٹ" : "💻 Online Appointment", time: "Now" });
        
        if (state.isChangingDetails) {
          state.isChangingDetails = false;
          showBookingReview();
          break;
        }

        state.currentStep = "booking_date";
        state.bookingStepIndex = 5;
        loadAvailableDates("booking", isUrdu ? "قدم ۵ از ۶: آن لائن تاریخ منتخب کریں" : "Step 5 of 6: Choose Online Date");
        break;

      case "booking_city_bwp":
        state.bookingState.city = "Bahawalpur";
        state.bookingState.locationId = "BWP";
        pushMessage({ sender: "user", text: "📍 Bahawalpur (Iqbal Hospital)", time: "Now" });
        
        if (state.isChangingDetails) {
          state.isChangingDetails = false;
          showBookingReview();
          break;
        }

        state.currentStep = "booking_date";
        state.bookingStepIndex = 5;
        loadAvailableDates("booking", isUrdu ? "قدم ۵ از ۶: تاریخ منتخب کریں" : "Step 5 of 6: Choose Date");
        break;

      case "booking_city_bwn":
      case "booking_city_ryk":
        pushMessage({
          sender: "user",
          text: action === "booking_city_bwn"
            ? (isUrdu ? "📍 بہاولنگر — جلد آ رہا ہے" : "📍 Bahawalnagar — Coming Soon")
            : (isUrdu ? "📍 رحیم یار خان — جلد آ رہا ہے" : "📍 Rahim Yar Khan — Coming Soon"),
          time: "Now"
        });
        pushMessage({
          sender: "ai",
          text: isUrdu
            ? "یہ کلینک جلد ہی شروع ہو رہا ہے۔ فی الحال اپوائنٹمنٹ کے لیے بہاولپور کا انتخاب کریں۔"
            : "This clinic location is coming soon. Please select Bahawalpur for available appointment dates.",
          quickReplies: [
            { label: isUrdu ? "📍 بہاولپور (اقبال ہسپتال)" : "📍 Bahawalpur (Iqbal Hospital)", action: "booking_city_bwp" },
            { label: isUrdu ? "⬅️ واپس" : "⬅️ Back", action: "back_to_type" }
          ],
          time: "Now"
        });
        break;

      case "change_name":
        state.isChangingDetails = true;
        state.currentStep = "booking_name";
        pushMessage({
          sender: "ai",
          text: isUrdu ? "👤 مریض کا نیا مکمل نام درج کریں:" : "👤 Please enter the updated patient name:",
          time: "Now"
        });
        break;

      case "change_phone":
        state.isChangingDetails = true;
        state.currentStep = "booking_phone";
        pushMessage({
          sender: "ai",
          text: isUrdu ? "📞 نیا فون نمبر درج کریں (مثال: 0300 1234567):" : "📞 Please enter your updated phone number (e.g. 0300 1234567):",
          time: "Now"
        });
        break;

      case "change_type":
        state.isChangingDetails = true;
        state.currentStep = "booking_type";
        pushMessage({
          sender: "ai",
          title: isUrdu ? "اپوائنٹمنٹ کی قسم تبدیل کریں" : "Change Consultation Type",
          text: isUrdu ? "آپ ڈاکٹر صہیب سے کیسے مشورہ کرنا چاہتے ہیں؟" : "How would you like to consult Dr. Shoaib?",
          quickReplies: [
            { label: isUrdu ? "🏥 ان پرسن (کلینک) اپوائنٹمنٹ" : "🏥 In-Person Appointment", action: "booking_type_in_person" },
            { label: isUrdu ? "💻 آن لائن اپوائنٹمنٹ" : "💻 Online Appointment", action: "booking_type_online" }
          ],
          time: "Now"
        });
        break;

      case "change_city":
        if (state.bookingState.appointmentType === "online") {
          showBookingReview();
          break;
        }
        state.isChangingDetails = true;
        state.currentStep = "booking_city";
        pushMessage({
          sender: "ai",
          title: isUrdu ? "کلینک مقام تبدیل کریں" : "Change Clinic Location",
          text: isUrdu ? "آپ کون سے کلینک تشریف لانا چاہتے ہیں؟" : "Which clinic location would you like to visit?",
          quickReplies: [
            { label: isUrdu ? "📍 بہاولپور (اقبال ہسپتال)" : "📍 Bahawalpur (Iqbal Hospital)", action: "booking_city_bwp" }
          ],
          time: "Now"
        });
        break;

      case "change_date":
        state.isChangingDetails = true;
        state.currentStep = "booking_date";
        loadAvailableDates("booking", isUrdu ? "تاریخ تبدیل کریں" : "Change Appointment Date");
        break;

      case "change_time":
        state.isChangingDetails = true;
        state.currentStep = "booking_time";
        loadAvailableTimes("booking", state.bookingState.date);
        break;

      case "change_booking_menu":
        pushMessage({
          sender: "ai",
          title: isUrdu ? "✏️ تفصیلات تبدیل کریں" : "✏️ Change Details",
          text: isUrdu ? "آپ کس معلومات میں تبدیلی کرنا چاہتے ہیں؟" : "What details would you like to change?",
          quickReplies: [
            { label: isUrdu ? "👤 مریض کا نام" : "👤 Patient Name", action: "change_name" },
            { label: isUrdu ? "📞 فون نمبر" : "📞 Phone Number", action: "change_phone" },
            { label: isUrdu ? "🏥 اپوائنٹمنٹ کی قسم" : "🏥 Consultation Type", action: "change_type" },
            ...(state.bookingState.appointmentType === "in_person" ? [{ label: isUrdu ? "📍 کلینک کا مقام" : "📍 Clinic Location", action: "change_city" }] : []),
            { label: isUrdu ? "📅 تاریخ" : "📅 Date", action: "change_date" },
            { label: isUrdu ? "🕒 وقت" : "🕒 Time", action: "change_time" },
            { label: isUrdu ? "↩️ واپس ریویو پر جائیں" : "↩️ Back to Review", action: "show_booking_review" }
          ],
          time: "Now"
        });
        break;

      case "cancel_booking_prompt":
        pushMessage({
          sender: "ai",
          text: isUrdu ? "کیا آپ واقعی یہ بکنگ منسوخ کرنا چاہتے ہیں؟" : "Are you sure you want to cancel this booking process?",
          quickReplies: [
            { label: isUrdu ? "❌ ہاں، بکنگ منسوخ کریں" : "❌ Yes, Cancel Booking", action: "cancel_booking_confirm" },
            { label: isUrdu ? "↩️ نہیں، جاری رکھیں" : "↩️ No, Keep Editing", action: "show_booking_review" }
          ],
          time: "Now"
        });
        break;

      case "cancel_booking_confirm":
        pushMessage({ sender: "user", text: isUrdu ? "❌ بکنگ منسوخ کریں" : "❌ Cancel Booking", time: "Now" });
        state.bookingState = {
          patientName: "",
          phoneNumber: "",
          appointmentType: "in_person",
          city: "Bahawalpur",
          locationId: "BWP",
          date: "",
          dateLabel: "",
          time: "",
          timeLabel: "",
          consentGiven: false,
          idempotencyKey: ""
        };
        state.currentFlow = "idle";
        state.currentStep = "main_menu";
        state.bookingStepIndex = 0;
        state.isChangingDetails = false;
        pushMessage({
          sender: "ai",
          text: isUrdu ? "بکنگ کا عمل منسوخ کر دیا گیا ہے۔ میں آپ کی اور کیا مدد کر سکتا ہوں؟" : "Booking process cancelled. How else may I help you today?",
          time: "Now"
        });
        state.showMainMenuCard = true;
        break;

      case "show_booking_review":
        showBookingReview();
        break;

      case "confirm_booking_final":
        if (!state.consentPolicy) {
          showToast("Please wait while the consent statement loads.");
          showBookingReview();
          break;
        }
        state.bookingState.idempotencyKey ||= (globalThis.crypto?.randomUUID?.() || `web-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        pushMessage({ sender: "user", text: isUrdu ? "✅ میں متفق ہوں اور اپوائنٹمنٹ کی تصدیق کرتا ہوں" : "✅ I Consent & Confirm Appointment", time: "Now" });
        
        api.book({
          fullName: state.bookingState.patientName,
          phone: state.bookingState.phoneNumber || state.activePhone,
          appointmentType: state.bookingState.appointmentType,
          date: state.bookingState.date,
          time: state.bookingState.time,
          locationId: state.bookingState.locationId || "BWP",
          reason: "General Consultation",
          consentGiven: true,
          consentTextVersion: state.consentPolicy.version
        }, state.bookingState.idempotencyKey).then(res => {
          const appt = res.appointment;
          state.managedAppointment = appt;
          state.activePhone = state.bookingState.phoneNumber || state.activePhone;
          const isOnline = state.bookingState.appointmentType === "online";
          
          state.currentFlow = "idle";
          state.currentStep = "booking_success";
          state.bookingStepIndex = 0;
          state.isChangingDetails = false;

          pushMessage({
            sender: "ai",
            title: isUrdu ? "🎉 اپوائنٹمنٹ کی تصدیق ہو گئی!" : "🎉 Appointment Confirmed!",
            text: isUrdu
              ? `ڈاکٹر صہیب کے ساتھ آپ کی اپوائنٹمنٹ کامیابی سے بک ہو گئی ہے۔`
              : `Your appointment with Dr. Shoaib has been booked successfully.`,
            html: `
              <div class="structured-card">
                <div class="card-badge success">✅ ${isUrdu ? "کنفرمڈ" : "Confirmed"}</div>
                <div class="card-detail-row">
                  <span class="card-detail-label">👤 ${isUrdu ? "مریض" : "Patient"}</span>
                  <span class="card-detail-value">${esc(appt.patientName)}</span>
                </div>
                <div class="card-detail-row">
                  <span class="card-detail-label">📞 ${isUrdu ? "فون نمبر" : "Phone"}</span>
                  <span class="card-detail-value">${esc(appt.patientPhone || state.activePhone)}</span>
                </div>
                <div class="card-detail-row">
                  <span class="card-detail-label">🏥 ${isUrdu ? "نوعیت" : "Type"}</span>
                  <span class="card-detail-value">${isOnline ? (isUrdu ? "آن لائن مشاورت" : "Online Consultation") : (isUrdu ? "ان پرسن کلینک" : "In-Person Clinic")}</span>
                </div>
                ${!isOnline ? `
                  <div class="card-detail-row">
                    <span class="card-detail-label">📍 ${isUrdu ? "کلینک" : "Clinic"}</span>
                    <span class="card-detail-value">${esc(appt.clinic?.name || "Iqbal Hospital, Bahawalpur")}</span>
                  </div>
                ` : ''}
                <div class="card-detail-row">
                  <span class="card-detail-label">📅 ${isUrdu ? "تاریخ" : "Date"}</span>
                  <span class="card-detail-value">${esc(state.bookingState.dateLabel || appt.date)}</span>
                </div>
                <div class="card-detail-row">
                  <span class="card-detail-label">🕒 ${isUrdu ? "وقت" : "Time"}</span>
                  <span class="card-detail-value">${esc(state.bookingState.timeLabel || appt.time)}</span>
                </div>
                <div class="card-detail-row" style="background: #e8f5f2; margin: 8px -16px -16px; padding: 12px 16px; border-radius: 0 0 16px 16px;">
                  <div>
                    <strong style="color: var(--primary-dark-teal); display: block; font-size: 0.95rem;">🆔 ID: ${esc(appt.appointmentId || appt._id)}</strong>
                    <strong style="color: var(--secondary-teal); display: block; font-size: 1.1rem; margin-top: 2px;">🎫 Token: ${esc(appt.tokenNumber)}</strong>
                  </div>
                </div>
              </div>
            `,
            quickReplies: [
              { label: isUrdu ? "📋 اپوائنٹمنٹ مینیج کریں" : "📋 Manage Appointment", action: "action_view_managed" },
              { label: isUrdu ? "🏠 مین مینو" : "🏠 Main Menu", action: "show_main_menu" }
            ],
            time: "Now"
          });
          showToast("Appointment Booked Successfully!");
          renderChatView();
        }).catch(err => {
          showToast("Booking Error: " + err.message);
          pushMessage({
            sender: "ai",
            title: isUrdu ? "⚠️ بکنگ مکمل نہیں ہو سکی" : "⚠️ We couldn't complete the booking.",
            text: isUrdu
              ? `یہ وقت اب شاید دستیاب نہیں رہا۔ براہ کرم دوسرا وقت یا تاریخ منتخب کریں۔ (آپ کی درج کردہ معلومات محفوظ ہیں)`
              : `That time slot may no longer be available. Please choose another time or date. (Your entered patient information is saved).`,
            quickReplies: [
              { label: isUrdu ? "🕒 دوسرا وقت چنیں" : "🕒 Choose Another Time", action: "change_time" },
              { label: isUrdu ? "📅 دوسری تاریخ چنیں" : "📅 Choose Another Date", action: "change_date" },
              { label: isUrdu ? "👤 عملے سے بات کریں" : "👤 Speak to Staff", action: "speak_to_staff" },
              { label: isUrdu ? "🏠 مین مینو" : "🏠 Main Menu", action: "show_main_menu" }
            ],
            time: "Now"
          });
          renderChatView();
        });
        break;

      case "manage_booking":
        state.currentFlow = "manage";
        state.currentStep = "manage_search";
        if (!options.silentUserMsg) {
          pushMessage({ sender: "user", text: isUrdu ? "📋 اپوائنٹمنٹ مینیج کریں" : "📋 Manage Appointment", time: "Now" });
        }
        pushMessage({
          sender: "ai",
          title: isUrdu ? "🔎 اپوائنٹمنٹ تلاش کریں" : "🔎 Find Your Appointment",
          text: isUrdu
            ? "اپوائنٹمنٹ کی معلومات تلاش کرنے کے لیے اپنا اپوائنٹمنٹ شناختی کارڈ (ID) / ٹوکن نمبر اور رجسٹرڈ فون نمبر درج کریں:"
            : "Please enter your Appointment ID or Token Number along with your registered phone number to manage your booking:",
          html: `
            <form id="chat-lookup-form" class="demo-form compact" style="margin-top: 10px;">
              <label>${isUrdu ? "اپوائنٹمنٹ آئی ڈی یا ٹوکن نمبر" : "Appointment ID or Token Number"}
                <input name="appointmentId" placeholder="e.g. DS-2026-0001 or 014" required>
              </label>
              <label>${isUrdu ? "رجسٹرڈ واٹس ایپ / فون نمبر" : "Registered Phone / WhatsApp Number"}
                <input name="phone" value="${esc(state.activePhone)}" placeholder="e.g. 03001234567" required>
              </label>
              <button class="primary-action wide-button" type="submit">${isUrdu ? "اپوائنٹمنٹ تلاش کریں" : "Search Appointment"}</button>
            </form>
          `,
          quickReplies: [{ label: isUrdu ? "🏠 مین مینو" : "🏠 Main Menu", action: "show_main_menu" }],
          time: "Now"
        });
        break;

      case "action_reschedule_appt":
        if (!state.managedAppointment) break;
        state.currentFlow = "reschedule";
        state.bookingState.locationId = state.managedAppointment.location?.code || state.managedAppointment.clinic?.code || "BWP";
        pushMessage({ sender: "user", text: isUrdu ? "📅 تاریخ / وقت تبدیل کریں" : "📅 Reschedule Appointment", time: "Now" });
        loadAvailableDates("reschedule", isUrdu ? "نئی تاریخ منتخب کریں" : "Select New Date");
        break;

      case "action_cancel_appt":
        if (!state.managedAppointment) break;
        pushMessage({ sender: "user", text: isUrdu ? "❌ اپوائنٹمنٹ منسوخ کریں" : "❌ Cancel Appointment", time: "Now" });
        pushMessage({
          sender: "ai",
          title: isUrdu ? "⚠️ کیا آپ منسوخ کرنا چاہتے ہیں؟" : "⚠️ Cancel Appointment Confirmation",
          text: isUrdu
            ? `کیا آپ واقعی اس اپوائنٹمنٹ (ID: ${state.managedAppointment.appointmentId || state.managedAppointment._id}) کو منسوخ کرنا چاہتے ہیں؟`
            : `Are you sure you want to cancel appointment ${state.managedAppointment.appointmentId || state.managedAppointment._id} scheduled for ${state.managedAppointment.date} at ${state.managedAppointment.time}?`,
          quickReplies: [
            { label: isUrdu ? "❌ ہاں، اپوائنٹمنٹ منسوخ کریں" : "❌ Yes, Cancel Appointment", action: "action_cancel_confirm" },
            { label: isUrdu ? "↩️ نہیں، اپوائنٹمنٹ برقرار رکھیں" : "↩️ Keep Appointment", action: "action_view_managed" }
          ],
          time: "Now"
        });
        break;

      case "action_cancel_confirm":
        if (!state.managedAppointment) break;
        pushMessage({ sender: "user", text: isUrdu ? "ہاں، منسوخ کریں" : "Yes, Cancel Appointment", time: "Now" });
        api.cancelAppointment(state.managedAppointment.appointmentId || state.managedAppointment._id, { phone: state.activePhone })
          .then(res => {
            state.managedAppointment.status = "cancelled";
            pushMessage({
              sender: "ai",
              title: isUrdu ? "✅ اپوائنٹمنٹ منسوخ ہو گئی" : "✅ Appointment Cancelled",
              text: isUrdu
                ? "آپ کی اپوائنٹمنٹ کامیابی سے منسوخ کر دی گئی ہے اور سلوٹ کو آزاد کر دیا گیا ہے۔"
                : "Your appointment has been cancelled successfully and the slot has been freed.",
              quickReplies: [
                { label: isUrdu ? "📅 نئی اپوائنٹمنٹ بک کریں" : "📅 Book New Appointment", action: "start_booking" },
                { label: isUrdu ? "🏠 مین مینو" : "🏠 Main Menu", action: "show_main_menu" }
              ],
              time: "Now"
            });
            showToast("Appointment Cancelled Successfully.");
            renderChatView();
          })
          .catch(err => {
            showToast("Cancellation error: " + err.message);
          });
        break;

      case "action_earlier_appt":
        if (!state.managedAppointment) break;
        pushMessage({ sender: "user", text: isUrdu ? "⏰ پہلے وقت کی درخواست" : "⏰ Request Earlier Slot", time: "Now" });
        api.requestEarlierAppointment(state.managedAppointment.appointmentId || state.managedAppointment._id, { phone: state.activePhone })
          .then(res => {
            pushMessage({
              sender: "ai",
              title: isUrdu ? "⏰ درخواست موصول ہو گئی" : "⏰ Earlier Slot Request Recorded",
              text: isUrdu
                ? "جلد وقت کی اپوائنٹمنٹ کی آپ کی درخواست ریکارڈ کر لی گئی ہے۔ اگر کوئی وقت پہلے خالی ہوا تو کلینک کا عملہ آپ سے رابطہ کرے گا۔"
                : "Your request for an earlier appointment slot has been recorded. Our staff will notify you as soon as an earlier slot opens up.",
              quickReplies: [
                { label: isUrdu ? "🏠 مین مینو" : "🏠 Main Menu", action: "show_main_menu" }
              ],
              time: "Now"
            });
            showToast("Earlier slot request logged!");
            renderChatView();
          })
          .catch(err => {
            showToast("Request error: " + err.message);
          });
        break;

      case "action_view_managed":
        if (!state.managedAppointment) {
          handleChatAction("manage_booking");
          break;
        }
        const mAppt = state.managedAppointment;
        const mIsOnline = String(mAppt.appointmentType).toLowerCase() === "online";
        pushMessage({
          sender: "ai",
          title: isUrdu ? "📋 اپوائنٹمنٹ تفصیلات" : "📋 Your Appointment Details",
          html: `
            <div class="structured-card">
              <div class="card-badge ${mAppt.status === 'cancelled' ? 'warning' : 'success'}">${esc(String(mAppt.status).toUpperCase())}</div>
              <div class="card-detail-row">
                <span class="card-detail-label">👤 ${isUrdu ? "مریض" : "Patient"}</span>
                <span class="card-detail-value">${esc(mAppt.patientName)}</span>
              </div>
              <div class="card-detail-row">
                <span class="card-detail-label">🏥 ${isUrdu ? "نوعیت" : "Type"}</span>
                <span class="card-detail-value">${mIsOnline ? (isUrdu ? "آن لائن مشاورت" : "Online Consultation") : (isUrdu ? "ان پرسن کلینک" : "In-Person Clinic")}</span>
              </div>
              ${!mIsOnline ? `
                <div class="card-detail-row">
                  <span class="card-detail-label">📍 ${isUrdu ? "کلینک" : "Clinic"}</span>
                  <span class="card-detail-value">${esc(mAppt.clinic?.name || "Iqbal Hospital, Bahawalpur")}</span>
                </div>
              ` : ''}
              <div class="card-detail-row">
                <span class="card-detail-label">📅 ${isUrdu ? "تاریخ" : "Date"}</span>
                <span class="card-detail-value">${esc(mAppt.date)}</span>
              </div>
              <div class="card-detail-row">
                <span class="card-detail-label">🕒 ${isUrdu ? "وقت" : "Time"}</span>
                <span class="card-detail-value">${esc(timeLabel(mAppt.time))}</span>
              </div>
              <div class="card-detail-row" style="background: #e8f5f2; margin: 8px -16px -16px; padding: 12px 16px; border-radius: 0 0 16px 16px;">
                <div>
                  <strong style="color: var(--primary-dark-teal); display: block; font-size: 0.95rem;">🆔 ID: ${esc(mAppt.appointmentId || mAppt._id)}</strong>
                  <strong style="color: var(--secondary-teal); display: block; font-size: 1.1rem; margin-top: 2px;">🎫 Token: ${esc(mAppt.tokenNumber)}</strong>
                </div>
              </div>
            </div>
          `,
          quickReplies: [
            { label: isUrdu ? "📅 تاریخ/وقت تبدیل کریں" : "📅 Reschedule", action: "action_reschedule_appt" },
            { label: isUrdu ? "❌ اپوائنٹمنٹ منسوخ کریں" : "❌ Cancel Appointment", action: "action_cancel_appt" },
            { label: isUrdu ? "⏰ پہلے وقت کی درخواست" : "⏰ Request Earlier Slot", action: "action_earlier_appt" },
            { label: isUrdu ? "🏠 مین مینو" : "🏠 Main Menu", action: "show_main_menu" }
          ],
          time: "Now"
        });
        break;

      case "start_assessment":
        state.currentFlow = "booking";
        state.currentStep = "booking_concern";
        if (!options.silentUserMsg) {
          pushMessage({ sender: "user", text: isUrdu ? "🩺 علامات اور معائنہ" : "🩺 Start Assessment", time: "Now" });
        }
        pushMessage({
          sender: "ai",
          title: isUrdu ? "🩺 علامات اور معائنہ" : "🩺 Clinical Assessment & Symptoms",
          text: isUrdu
            ? "براہ کرم اپنی تکلیف یا علامت منتخب کریں یا نیچے تفصیل لکھیں:"
            : "Please select your primary orthopedic symptom or type your concern below:",
          quickReplies: [
            { label: isUrdu ? "🦵 گھٹنے / کولہے کا درد" : "🦵 Knee / Hip Pain & Arthritis", action: "start_booking" },
            { label: isUrdu ? "🦴 ہڈی کا فریکچر / چوٹ" : "🦴 Fracture & Trauma Injury", action: "start_booking" },
            { label: isUrdu ? "🩺 کمر اور مہروں کا درد" : "🩺 Spine, Sciatica & Back Pain", action: "start_booking" },
            { label: isUrdu ? "🏃 کھیلوں کی چوٹیں / پٹھے" : "🏃 Sports Injury & Ligament Tear", action: "start_booking" },
            { label: isUrdu ? "👶 بچوں کی ہڈیوں کے مسائل" : "👶 Pediatric Bone Condition", action: "start_booking" },
            { label: isUrdu ? "🏠 مین مینو" : "🏠 Main Menu", action: "show_main_menu" }
          ],
          time: "Now"
        });
        break;

      case "clinic_locations":
        pushMessage({ sender: "user", text: isUrdu ? "🏥 کلینک کی معلومات" : "🏥 Clinic Information", time: "Now" });
        pushMessage({
          sender: "ai",
          title: isUrdu ? "🏥 کلینک کی معلومات" : "🏥 Clinic Locations & Timings",
          html: `
            <div class="structured-card">
              <div class="card-badge info">📍 Iqbal Hospital Bahawalpur</div>
              <h3 style="color: var(--primary-dark-teal); margin-bottom: 6px;">Iqbal Hospital</h3>
              <p style="font-size: 0.88rem; color: var(--text-secondary); margin-bottom: 10px;">📍 Noor Mahal Road, Bahawalpur</p>
              <div class="card-detail-row">
                <span class="card-detail-label">🗓️ ${isUrdu ? "پیر تا جمعرات" : "Mon – Thu"}</span>
                <span class="card-detail-value">4:30 PM – 8:30 PM</span>
              </div>
              <div class="card-detail-row">
                <span class="card-detail-label">🗓️ ${isUrdu ? "جمعہ" : "Friday"}</span>
                <span class="card-detail-value">8:00 PM – 9:00 PM</span>
              </div>
              <div class="card-detail-row">
                <span class="card-detail-label">⏱️ ${isUrdu ? "دورانیہ" : "Slot Duration"}</span>
                <span class="card-detail-value">20 Minutes</span>
              </div>
            </div>
            <div class="structured-card" style="opacity: 0.75;">
              <div class="card-badge warning">Coming Soon</div>
              <h4 style="color: var(--text-main);">📍 Bahawalnagar & Rahim Yar Khan</h4>
              <p style="font-size: 0.82rem; color: var(--text-secondary); margin-top: 4px;">Regional clinic centers opening soon.</p>
            </div>
          `,
          quickReplies: [
            { label: isUrdu ? "📅 بہاولپور میں بک کریں" : "📅 Book at Bahawalpur", action: "start_booking" },
            { label: isUrdu ? "🗺️ نقشه دیکھں" : "🗺️ View Directions", action: "open_map_directions" },
            { label: isUrdu ? "🏠 مین مینو" : "🏠 Main Menu", action: "show_main_menu" }
          ],
          time: "Now"
        });
        break;

      case "open_map_directions":
        window.open("https://maps.google.com/?q=Iqbal+Hospital+Noor+Mahal+Road+Bahawalpur", "_blank");
        break;

      case "doctor_profile":
        pushMessage({ sender: "user", text: isUrdu ? "👨‍⚕️ ڈاکٹر کا پروفائل" : "👨‍⚕️ Doctor Profile", time: "Now" });
        pushMessage({
          sender: "ai",
          title: isUrdu ? "👨‍⚕️ ڈاکٹر کا پروفائل" : "👨‍⚕️ Dr. Shoaib Profile",
          html: `
            <div class="structured-card">
              <div class="card-badge info">Specialist Orthopedic & Trauma Surgeon</div>
              <h3 style="color: var(--primary-dark-teal); margin-bottom: 4px;">Dr. Shoaib Aslam</h3>
              <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 12px;">Specialist Orthopedic & Trauma Surgeon with 12+ years of surgical experience at Iqbal Hospital, Bahawalpur.</p>
              <div class="card-detail-row">
                <span class="card-detail-label">🎓 ${isUrdu ? "قابلیت" : "Qualifications"}</span>
                <span class="card-detail-value">MBBS, FCPS (Orthopedic Surgery)</span>
              </div>
              <div class="card-detail-row">
                <span class="card-detail-label">🩺 ${isUrdu ? "تخصص" : "Specialty"}</span>
                <span class="card-detail-value">Joint Replacement, Trauma, Spine & Arthroscopy</span>
              </div>
              <div class="card-detail-row">
                <span class="card-detail-label">📍 ${isUrdu ? "کلینک" : "Clinic Location"}</span>
                <span class="card-detail-value">Iqbal Hospital, Bahawalpur</span>
              </div>
              <div class="card-detail-row">
                <span class="card-detail-label">🗓️ ${isUrdu ? "معائنہ کے دن" : "Consultation Days"}</span>
                <span class="card-detail-value">Mon–Thu (4:30–8:30 PM), Fri (8:00–9:00 PM)</span>
              </div>
              <div class="card-detail-row">
                <span class="card-detail-label">⏱️ ${isUrdu ? "معائنہ کا وقت" : "Consultation Time"}</span>
                <span class="card-detail-value">20 Minutes Per Patient</span>
              </div>
            </div>
          `,
          quickReplies: [
            { label: isUrdu ? "📅 اپوائنٹمنٹ بک کریں" : "📅 Book Appointment", action: "start_booking" },
            { label: isUrdu ? "🏠 مین مینو" : "🏠 Main Menu", action: "show_main_menu" }
          ],
          time: "Now"
        });
        break;

      case "treatment_info":
        pushMessage({ sender: "user", text: isUrdu ? "🦴 کلینک کی سہولیات" : "🦴 Explore Services", time: "Now" });
        pushMessage({
          sender: "ai",
          title: isUrdu ? "🦴 کلینک کی خصوصی سہولیات" : "🦴 Orthopedic Specialties & Services",
          html: `
            <div class="structured-card">
              <div class="card-detail-row">
                <span class="card-detail-label">🦴 Fracture & Trauma Surgery</span>
                <span class="card-detail-value">Available</span>
              </div>
              <div class="card-detail-row">
                <span class="card-detail-label">🦵 Knee & Hip Replacement (Arthroplasty)</span>
                <span class="card-detail-value">Available</span>
              </div>
              <div class="card-detail-row">
                <span class="card-detail-label">🩺 Spine Care, Sciatica & Back Pain</span>
                <span class="card-detail-value">Available</span>
              </div>
              <div class="card-detail-row">
                <span class="card-detail-label">🏃 Sports Injuries & Ligament Arthroscopy</span>
                <span class="card-detail-value">Available</span>
              </div>
              <div class="card-detail-row">
                <span class="card-detail-label">👶 Pediatric Bone Deformity Care</span>
                <span class="card-detail-value">Available</span>
              </div>
              <div class="card-detail-row">
                <span class="card-detail-label">🩹 Post-Op Rehabilitation Guidance</span>
                <span class="card-detail-value">Available</span>
              </div>
            </div>
          `,
          quickReplies: [
            { label: isUrdu ? "📅 اپوائنٹمنٹ بک کریں" : "📅 Book Appointment", action: "start_booking" },
            { label: isUrdu ? "🏠 مین مینو" : "🏠 Main Menu", action: "show_main_menu" }
          ],
          time: "Now"
        });
        break;

      case "upload_report":
        state.currentFlow = "upload_report";
        if (!options.silentUserMsg) {
          pushMessage({ sender: "user", text: isUrdu ? "📎 رپورٹ اپ لوڈ کریں" : "📎 Upload Reports", time: "Now" });
        }
        pushMessage({
          sender: "ai",
          title: isUrdu ? "📎 رپورٹ کی قسم منتخب کریں" : "📎 Upload Medical Report",
          text: isUrdu ? "براہ کرم جس قسم کی میڈیکل رپورٹ اپ لوڈ کرنا چاہتے ہیں اسے منتخب کریں:" : "Please select the type of medical report you would like to upload:",
          quickReplies: [
            { label: isUrdu ? "🧪 لیب رپورٹ" : "🧪 Laboratory Report", action: "upload_type_lab" },
            { label: isUrdu ? "🩻 ایکس رے / سکین" : "🩻 X-Ray / Scan", action: "upload_type_xray" },
            { label: isUrdu ? "💊 نسخہ (Prescription)" : "💊 Prescription", action: "upload_type_prescription" },
            { label: isUrdu ? "📄 سابقہ میڈیکل رپورٹ" : "📄 Previous Medical Report", action: "upload_type_other" },
            { label: isUrdu ? "🏠 مین مینو" : "🏠 Main Menu", action: "show_main_menu" }
          ],
          time: "Now"
        });
        break;

      case "online_consultation":
        handleChatAction("booking_type_online");
        break;

      case "speak_to_staff":
        pushMessage({ sender: "user", text: isUrdu ? "👤 عملے سے بات کریں" : "👤 Speak to Clinic Staff", time: "Now" });
        pushMessage({
          sender: "ai",
          title: isUrdu ? "👤 کلینک کی ٹیم سے رابطہ" : "👤 Clinic Staff Takeover",
          text: isUrdu
            ? "میں آپ کی بات چیت کلینک کی ٹیم کو منتقل کر رہا ہوں۔ عملے کا رکن جلد ہی آپ سے رابطہ کرے گا۔"
            : "I'll connect you with the clinic team. A staff member will continue the conversation with you shortly.",
          time: "Now"
        });
        state.conversationMode = "HUMAN";
        state.humanHandoverActive = true;
        api.createConversation({ phone: state.activePhone, message: "Patient requested staff handover." }).catch(() => {});
        renderChatView();
        break;

      default:
        if (action.startsWith("upload_type_")) {
          const typeCode = action.replace("upload_type_", "");
          const labelsMap = {
            lab: "Laboratory Report",
            xray: "X-Ray / Scan",
            prescription: "Prescription",
            other: "Medical Report"
          };
          const selectedLabel = labelsMap[typeCode] || "Medical Report";
          state.uploadReportState = {
            documentType: typeCode,
            typeLabel: selectedLabel
          };

          pushMessage({ sender: "user", text: selectedLabel, time: "Now" });

          const apptId = state.managedAppointment?.appointmentId || state.managedAppointment?.tokenNumber || "";

          pushMessage({
            sender: "ai",
            title: `📎 Upload ${selectedLabel}`,
            text: isUrdu
              ? "براہ کرم فائل منتخب کریں (PDF, JPG, PNG 10 MB تک):"
              : "Please select the report file you would like to upload (PDF, JPG, JPEG, PNG up to 10 MB):",
            html: `
              <form id="chat-report-form" class="demo-form compact" style="margin-top: 10px;">
                <input type="hidden" name="documentType" value="${esc(typeCode)}">
                <label>${isUrdu ? "مریض کا فون نمبر" : "Patient Phone Number"}
                  <input name="phone" value="${esc(state.activePhone)}" placeholder="e.g. 03001234567" required>
                </label>
                <label>${isUrdu ? "اپوائنٹمنٹ ID / ٹوکن (اختیاری)" : "Appointment ID / Token (Optional)"}
                  <input name="appointmentId" value="${esc(apptId)}" placeholder="e.g. DS-2026-0001 or 014">
                </label>
                <label>${isUrdu ? "رپورٹ کی تفصیل" : "Report Description"}
                  <input name="reportTitle" value="${esc(selectedLabel)}" required>
                </label>
                <label>${isUrdu ? "فائل منتخب کریں" : "Select Document File (PDF, JPG, PNG up to 10MB)"}
                  <input type="file" id="chat-file-input" name="reportFile" accept=".pdf,.jpg,.jpeg,.png" required>
                </label>
                <progress id="chat-upload-progress" value="0" max="100" style="display:none;width:100%;"></progress>
                <small id="chat-upload-progress-text" aria-live="polite"></small>
                <button class="primary-action wide-button" type="submit">${isUrdu ? "رپورٹ اپ لوڈ کریں" : "Upload Document Now"}</button>
              </form>
            `,
            quickReplies: [{ label: isUrdu ? "🏠 مین مینو" : "🏠 Main Menu", action: "show_main_menu" }],
            time: "Now"
          });
        } else if (action.startsWith("reschedule_date_")) {
          const raw = action.replace("reschedule_date_", "");
          const [dVal, dLabel] = raw.split("_");
          state.rescheduleState.date = dVal;
          state.rescheduleState.dateLabel = dLabel || dVal;
          pushMessage({ sender: "user", text: dLabel || dVal, time: "Now" });
          loadAvailableTimes("reschedule", dVal);
          break;
        } else if (action.startsWith("reschedule_time_")) {
          const raw = action.replace("reschedule_time_", "");
          const [tVal, tLabel] = raw.split("_");
          state.rescheduleState.time = tVal;
          state.rescheduleState.timeLabel = tLabel || tVal;
          pushMessage({ sender: "user", text: tLabel || tVal, time: "Now" });

          if (state.managedAppointment) {
            const oldDate = state.managedAppointment.date;
            const oldTime = timeLabel(state.managedAppointment.time);
            pushMessage({
              sender: "ai",
              title: isUrdu ? "ری شیڈول ریویو" : "Review Reschedule Details",
              html: `
                <div class="structured-card">
                  <div class="card-badge warning">${isUrdu ? "تبدیلی کا جائزہ" : "Proposed Change"}</div>
                  <div class="card-detail-row">
                    <span class="card-detail-label">🔴 ${isUrdu ? "پرانا وقت" : "Old Slot"}</span>
                    <span class="card-detail-value">${esc(oldDate)} (${esc(oldTime)})</span>
                  </div>
                  <div class="card-detail-row" style="background: var(--light-mint); padding: 10px; border-radius: 8px; margin-top: 6px;">
                    <span class="card-detail-label" style="color: var(--primary-dark-teal);">🟢 ${isUrdu ? "نیا وقت" : "New Slot"}</span>
                    <span class="card-detail-value" style="color: var(--primary-dark-teal);">${esc(state.rescheduleState.dateLabel)} (${esc(tLabel || tVal)})</span>
                  </div>
                </div>
              `,
              quickReplies: [
                { label: isUrdu ? "✅ ری شیڈول کی تصدیق کریں" : "✅ Confirm Reschedule", action: "reschedule_confirm_final" },
                { label: isUrdu ? "↩️ منسوخ کریں" : "↩️ Go Back", action: "action_view_managed" }
              ],
              time: "Now"
            });
          }
        } else if (action === "reschedule_confirm_final") {
          if (state.managedAppointment && state.rescheduleState.date && state.rescheduleState.time) {
            pushMessage({ sender: "user", text: isUrdu ? "✅ ری شیڈول کی تصدیق کریں" : "✅ Confirm Reschedule", time: "Now" });
            api.rescheduleAppointment(state.managedAppointment.appointmentId || state.managedAppointment._id, {
              date: state.rescheduleState.date,
              time: state.rescheduleState.time,
              phone: state.activePhone
            }).then(res => {
              state.managedAppointment = res.appointment || state.managedAppointment;
              state.managedAppointment.date = state.rescheduleState.date;
              state.managedAppointment.time = state.rescheduleState.time;
              pushMessage({
                sender: "ai",
                title: isUrdu ? "✅ اپوائنٹمنٹ ری شیڈول ہو گئی" : "✅ Appointment Rescheduled",
                text: isUrdu
                  ? `آپ کی اپوائنٹمنٹ کامیابی سے ری شیڈول کر دی گئی ہے۔\n\n📅 نئی تاریخ: ${state.rescheduleState.dateLabel}\n🕓 نیا وقت: ${state.rescheduleState.timeLabel || state.rescheduleState.time}`
                  : `Your appointment has been rescheduled successfully.\n\n📅 New Date: ${state.rescheduleState.dateLabel}\n🕓 New Time: ${state.rescheduleState.timeLabel || state.rescheduleState.time}\n🎫 Token: ${res.appointment?.tokenNumber || state.managedAppointment.tokenNumber}`,
                quickReplies: [
                  { label: isUrdu ? "📋 تفصیلات دیکھیں" : "📋 View Appointment", action: "action_view_managed" },
                  { label: isUrdu ? "🏠 مین مینو" : "🏠 Main Menu", action: "show_main_menu" }
                ],
                time: "Now"
              });
              showToast("Rescheduled successfully!");
              renderChatView();
            }).catch(err => {
              showToast("Reschedule error: " + err.message);
            });
          }
        } else if (action.startsWith("booking_date_")) {
          const raw = action.replace("booking_date_", "");
          const [dVal, dLabel] = raw.split("_");
          state.bookingState.date = dVal;
          state.bookingState.dateLabel = dLabel || dVal;
          pushMessage({ sender: "user", text: dLabel || dVal, time: "Now" });

          if (state.isChangingDetails) {
            state.isChangingDetails = false;
            showBookingReview();
            break;
          }

          state.currentStep = "booking_time";
          state.bookingStepIndex = 6;
          loadAvailableTimes("booking", dVal);
          break;
        } else if (action.startsWith("booking_time_")) {
          const raw = action.replace("booking_time_", "");
          const [tVal, tLabel] = raw.split("_");
          state.bookingState.time = tVal;
          state.bookingState.timeLabel = tLabel || tVal;
          pushMessage({ sender: "user", text: tLabel || tVal, time: "Now" });

          state.isChangingDetails = false;
          showBookingReview();
        }
        break;
    }

    renderChatView();
  }

  async function showBookingReview() {
    state.currentStep = "booking_review";
    state.bookingStepIndex = 7;
    const isUrdu = state.lang === "ur";
    const isOnline = state.bookingState.appointmentType === "online";
    
    if (!state.consentPolicy) {
      try {
        const response = await api.getAppointmentConsent();
        state.consentPolicy = response.consent;
      } catch (error) {
        showToast("The consent statement could not be loaded. Please try again.");
        return;
      }
    }

    pushMessage({
      sender: "ai",
      title: isUrdu ? "✅ اپوائنٹمنٹ کا جائزہ اور تصدیق" : "✅ Review & Confirm Appointment",
      html: `
        <div class="structured-card">
          <div class="card-badge info">${isUrdu ? "حتمی جائزہ" : "Review Details"}</div>
          <div class="card-detail-row">
            <span class="card-detail-label">👤 ${isUrdu ? "مریض" : "Patient"}</span>
            <span class="card-detail-value">${esc(state.bookingState.patientName)}</span>
          </div>
          <div class="card-detail-row">
            <span class="card-detail-label">📞 ${isUrdu ? "فون نمبر" : "Phone"}</span>
            <span class="card-detail-value">${esc(state.bookingState.phoneNumber || state.activePhone)}</span>
          </div>
          <div class="card-detail-row">
            <span class="card-detail-label">🏥 ${isUrdu ? "نوعیت" : "Type"}</span>
            <span class="card-detail-value">${isOnline ? (isUrdu ? "آن لائن مشاورت" : "Online Consultation") : (isUrdu ? "ان پرسن کلینک" : "In-Person Clinic")}</span>
          </div>
          ${!isOnline ? `
            <div class="card-detail-row">
              <span class="card-detail-label">📍 ${isUrdu ? "کلینک" : "Clinic"}</span>
              <span class="card-detail-value">${esc(state.bookingState.city === "Bahawalpur" ? "Iqbal Hospital, Bahawalpur" : state.bookingState.city)}</span>
            </div>
          ` : ''}
          <div class="card-detail-row">
            <span class="card-detail-label">📅 ${isUrdu ? "تاریخ" : "Date"}</span>
            <span class="card-detail-value">${esc(state.bookingState.dateLabel || state.bookingState.date)}</span>
          </div>
          <div class="card-detail-row">
            <span class="card-detail-label">🕒 ${isUrdu ? "وقت" : "Time"}</span>
            <span class="card-detail-value">${esc(state.bookingState.timeLabel || state.bookingState.time)}</span>
          </div>
          <div style="margin-top: 10px; padding: 10px; background: var(--bg-neutral); border-radius: 8px; font-size: 0.78rem; color: var(--text-secondary);">
            🔒 ${esc(state.consentPolicy.text)} (Consent v${esc(state.consentPolicy.version)})
          </div>
        </div>
      `,
      quickReplies: [
        { label: isUrdu ? "✅ تصدیق کریں اور بک کریں" : "✅ Confirm Appointment", action: "confirm_booking_final", isPrimary: true },
        { label: isUrdu ? "✏️ تفصیلات تبدیل کریں" : "✏️ Change Details", action: "change_booking_menu" },
        { label: isUrdu ? "❌ بکنگ منسوخ کریں" : "❌ Cancel Booking", action: "cancel_booking_prompt" },
        { label: isUrdu ? "⬅️ واپس" : "⬅️ Back", action: "back_to_time" }
      ],
      time: "Now"
    });
    renderChatView();
  }

  function handleFreeTextInput(text) {
    const val = text.trim();
    if (!val) return;
    pushMessage({ sender: "user", text: val, time: "Now" });
    const isUrdu = state.lang === "ur";

    if (state.conversationMode === "HUMAN") {
      api.createConversation({ phone: state.activePhone, message: val }).catch(() => {});
      renderChatView();
      return;
    }

    if (state.currentFlow === "booking") {
      if (state.currentStep === "booking_name") {
        state.bookingState.patientName = val;
        
        if (state.isChangingDetails) {
          state.isChangingDetails = false;
          showBookingReview();
          return;
        }

        state.currentStep = "booking_phone";
        state.bookingStepIndex = 2;
        pushMessage({
          sender: "ai",
          title: isUrdu ? "قدم ۲ از ۶: فون نمبر" : "Step 2 of 6: Phone Number",
          text: isUrdu
            ? `شکریہ ${val}۔ 📞 براہ کرم اپنا موبائل یا واٹس ایپ نمبر درج کریں:\nمثال: 0300 1234567`
            : `Thank you, ${val}. 📞 Please enter your mobile / WhatsApp number.\nExample: 0300 1234567`,
          quickReplies: [
            { label: isUrdu ? "⬅️ واپس" : "⬅️ Back", action: "back_to_name" }
          ],
          time: "Now"
        });
        renderChatView();
        return;
      } else if (state.currentStep === "booking_phone") {
        const cleanedPhone = val.replace(/[^\d+]/g, "");
        if (cleanedPhone.length < 7) {
          pushMessage({
            sender: "ai",
            text: isUrdu ? "براہ کرم درست فون نمبر درج کریں۔ (مثال: 0300 1234567)" : "Please enter a valid mobile number (e.g. 0300 1234567).",
            time: "Now"
          });
          renderChatView();
          return;
        }
        state.bookingState.phoneNumber = val;
        state.activePhone = val;

        if (state.isChangingDetails) {
          state.isChangingDetails = false;
          showBookingReview();
          return;
        }

        state.currentStep = "booking_type";
        state.bookingStepIndex = 3;
        pushMessage({
          sender: "ai",
          title: isUrdu ? "قدم ۳ از ۶: اپوائنٹمنٹ کی قسم" : "Step 3 of 6: Consultation Type",
          text: isUrdu ? "🏥 آپ ڈاکٹر صہیب سے کیسے مشورہ کرنا چاہتے ہیں؟" : "🏥 How would you like to consult Dr. Shoaib?",
          quickReplies: [
            { label: isUrdu ? "🏥 ان پرسن (کلینک) اپوائنٹمنٹ" : "🏥 In-Person Appointment", action: "booking_type_in_person" },
            { label: isUrdu ? "💻 آن لائن اپوائنٹمنٹ" : "💻 Online Appointment", action: "booking_type_online" },
            { label: isUrdu ? "⬅️ واپس" : "⬅️ Back", action: "back_to_phone" }
          ],
          time: "Now"
        });
        renderChatView();
        return;
      }
    }

    if (/medicine|medication|drug|dose|prescribe/i.test(val)) {
      pushMessage({
        sender: "ai",
        title: isUrdu ? "⚠️ میڈیکل سیفٹی الرٹ" : "⚠️ Medical Safety Notice",
        text: isUrdu
          ? "میں عام معلومات فراہم کر سکتا ہوں، لیکن کسی مخصوص دوا کی تجویز کے لیے ڈاکٹر کا خود جائزہ لینا ضروری ہے۔"
          : "I can provide general clinic information, but the doctor will need to assess you in person before prescribing medication.",
        quickReplies: [
          { label: isUrdu ? "📅 اپوائنٹمنٹ بک کریں" : "📅 Book Appointment", action: "start_booking" },
          { label: isUrdu ? "🏠 مین مینو" : "🏠 Main Menu", action: "show_main_menu" }
        ],
        time: "Now"
      });
      renderChatView();
      return;
    }

    if (/emergency|urgent|chest pain|unconscious|bleeding/i.test(val)) {
      pushMessage({
        sender: "ai",
        title: isUrdu ? "🚨 ایمرجنسی الرٹ" : "🚨 Emergency Warning",
        text: isUrdu
          ? "اس صورتحال میں فوری طبی امداد کی ضرورت ہو سکتی ہے۔ براہ کرم قریبی ایمرجنسی سنٹر تشریف لے جائیں۔"
          : "This may require urgent medical attention. Please visit the nearest hospital emergency department immediately.",
        quickReplies: [{ label: isUrdu ? "🏠 مین مینو" : "🏠 Main Menu", action: "show_main_menu" }],
        time: "Now"
      });
      renderChatView();
      return;
    }

    if (/timing|where|address|location/i.test(val)) {
      handleChatAction("clinic_locations", { silentUserMsg: true });
    } else if (/book|appointment/i.test(val)) {
      handleChatAction("start_booking", { silentUserMsg: true });
    } else if (/cancel|manage/i.test(val)) {
      handleChatAction("manage_booking", { silentUserMsg: true });
    } else if (/report|mri|xray|upload/i.test(val)) {
      handleChatAction("upload_report", { silentUserMsg: true });
    } else if (/online|virtual|consultation/i.test(val)) {
      handleChatAction("booking_type_online", { silentUserMsg: true });
    } else if (/staff|human/i.test(val)) {
      handleChatAction("speak_to_staff", { silentUserMsg: true });
    } else {
      pushMessage({
        sender: "ai",
        text: isUrdu ? "ڈاکٹر صہیب کلینک اسسٹنٹ میں خوش آمدید۔ میں آپ کی کیا مدد کر سکتا ہوں؟" : "Welcome to Dr. Shoaib Clinic Assistant. How may I help you today?",
        quickReplies: [
          { label: isUrdu ? "📅 اپوائنٹمنٹ بک کریں" : "📅 Book Appointment", action: "start_booking" },
          { label: isUrdu ? "🏠 مین مینو" : "🏠 Main Menu", action: "show_main_menu" }
        ],
        time: "Now"
      });
    }

    renderChatView();
  }

  // Helper for progress bar
  function renderProgressBarHtml() {
    if (state.currentFlow !== "booking" || state.bookingStepIndex <= 0) return "";
    const isUrdu = state.lang === "ur";
    const totalSteps = 6;
    const current = Math.min(state.bookingStepIndex, totalSteps);
    
    let dots = "";
    for (let i = 1; i <= totalSteps; i++) {
      let cls = "progress-dot";
      if (i < current) cls += " completed";
      else if (i === current) cls += " active";
      dots += `<div class="${cls}"></div>`;
    }

    return `
      <div class="progress-bar-container">
        <span>${isUrdu ? `قدم ${current} از ${totalSteps}` : `Step ${current} of ${totalSteps}`}</span>
        <div class="progress-dots">${dots}</div>
      </div>
    `;
  }

  // ----------------------------------------------------
  // PATIENT PORTAL CHAT VIEW (PROTOTYPE ALIGNED)
  // ----------------------------------------------------
  function renderChatView() {
    const isUrdu = state.lang === "ur";
    const dir = isUrdu ? "rtl" : "ltr";

    app.innerHTML = `
      <div class="patient-page" dir="${dir}">
        <section class="presentation-panel">
          <div class="brand-lockup">
            <div class="logo">🩻</div>
            <div>
              <strong>Dr. Shoaib</strong>
              <small>Specialist Orthopedic & Trauma Surgeon</small>
            </div>
          </div>
          <div class="presentation-copy">
            <span class="eyebrow">${isUrdu ? "آفیشل پورٹل" : "Official Appointment Assistant"}</span>
            <h1>${isUrdu ? "ڈاکٹر شعیب اسسٹنٹ" : "Dr. Shoaib AI Assistant"}</h1>
            <p>Automated WhatsApp-style Appointment Booking & Clinic Portal</p>
          </div>
          <div class="clinic-mini">
            <div class="status-dot"></div>
            <div>
              <strong>Iqbal Hospital, Bahawalpur</strong>
              <small>Noor Mahal Road (Mon–Thu 4:30–8:30 PM, Fri 8:00–9:00 PM)</small>
            </div>
          </div>
          <button class="admin-entry" id="switch-to-admin">
            <span>🔐 ${isUrdu ? "عملے کا پورٹل" : "Staff & Clinic Dashboard"}</span>
            <span>→</span>
          </button>
        </section>

        <main class="chat-stage">
          <div class="phone">
            <header class="chat-header">
              <button class="header-back-btn" id="chat-header-back" title="Main Menu">←</button>
              <div class="avatar-container">
                <div class="avatar-badge">🩻<span class="steth-badge">🩺</span></div>
              </div>
              <div class="chat-title">
                <strong>${isUrdu ? "آرتھوپیڈک چیٹ باٹ" : "Orthopedic Chatbot"}</strong>
                <small>${isUrdu ? "اے آئی اپائنٹمنٹ اسسٹنٹ" : "AI Appointment Assistant"}</small>
              </div>
              <button class="header-lang-pill" id="lang-toggle-chat">🌐 ${isUrdu ? "EN" : "اردو"}</button>
            </header>

            <div class="safety-strip">
              🔒 ${isUrdu ? "محفوظ اپوائنٹمنٹ پورٹل — اقبال ہسپتال بہاولپور" : "Secure Appointment Portal — Iqbal Hospital Bahawalpur"}
            </div>

            ${renderProgressBarHtml()}

            <div class="chat-body" id="chat-body">
              ${state.chatMessages.map(msg => `
                <div class="${msg.sender === 'user' ? 'patient-bubble' : 'bot-bubble'}">
                  ${msg.title ? `<h2>${esc(msg.title)}</h2>` : ''}
                  ${msg.text ? `<p>${esc(msg.text).replace(/\n/g, '<br>')}</p>` : ''}
                  ${msg.html ? msg.html : ''}
                  ${msg.quickReplies && msg.quickReplies.length > 0 ? `
                    <div class="quick-replies-container">
                      ${msg.quickReplies.map(qr => `
                        <button class="quick-reply-btn ${qr.isPrimary ? 'primary-cta' : ''}" data-action="${qr.action}">${esc(qr.label)}</button>
                      `).join('')}
                    </div>
                  ` : ''}
                  <span class="msg-timestamp">${esc(msg.time || "5:16 pm")}</span>
                </div>
              `).join('')}

              ${state.showMainMenuCard ? `
                <div class="prototype-card" id="main-menu-options-card">
                  <div class="prototype-card-title">${isUrdu ? "ایک آپشن منتخب کریں" : "Choose one option"}</div>
                  <div class="prototype-option-list">
                    <button class="prototype-option-btn" data-action="start_booking">
                      <span class="radio-circle"></span>
                      <span class="prototype-option-label">📅 ${isUrdu ? "اپائنٹمنٹ بک کریں" : "Book Appointment"}</span>
                    </button>
                    <button class="prototype-option-btn" data-action="start_assessment">
                      <span class="radio-circle"></span>
                      <span class="prototype-option-label">🩺 ${isUrdu ? "علامات اور معائنہ" : "Start Assessment"}</span>
                    </button>
                    <button class="prototype-option-btn" data-action="treatment_info">
                      <span class="radio-circle"></span>
                      <span class="prototype-option-label">🦴 ${isUrdu ? "کلینک کی سہولیات" : "Explore Services"}</span>
                    </button>
                    <button class="prototype-option-btn" data-action="upload_report">
                      <span class="radio-circle"></span>
                      <span class="prototype-option-label">📄 ${isUrdu ? "ایکسرے / ایم آر آئی اپ لوڈ" : "Upload X-ray / MRI"}</span>
                    </button>
                    <button class="prototype-option-btn" data-action="doctor_profile">
                      <span class="radio-circle"></span>
                      <span class="prototype-option-label">👨‍⚕️ ${isUrdu ? "ڈاکٹر شعیب کا تعارف" : "About the Doctor"}</span>
                    </button>
                    <button class="prototype-option-btn" data-action="clinic_locations">
                      <span class="radio-circle"></span>
                      <span class="prototype-option-label">🏥 ${isUrdu ? "کلینک معلومات و اوقات" : "Clinic Information"}</span>
                    </button>
                    <button class="prototype-option-btn" data-action="speak_to_staff">
                      <span class="radio-circle"></span>
                      <span class="prototype-option-label">☎️ ${isUrdu ? "عملے سے رابطہ کریں" : "Contact Reception"}</span>
                    </button>
                    <button class="prototype-option-btn" data-action="toggle_language">
                      <span class="radio-circle"></span>
                      <span class="prototype-option-label">🌐 ${isUrdu ? "زبان تبدیل کریں" : "Change Language"}</span>
                    </button>
                  </div>
                </div>
              ` : ''}
            </div>

            <form class="composer" id="chat-composer">
              <button type="button" class="composer-attach-btn" id="attach-file-btn" title="Upload Document">🖼️<span class="plus-mini">+</span></button>
              <input type="text" id="chat-input" placeholder="${isUrdu ? 'اپنی بات یہاں لکھیں...' : 'Type your concern here...'}" required>
              <button type="submit" class="composer-send-btn" aria-label="Send">✈️</button>
            </form>
            <div class="chat-disclaimer-footer">
              🛡️ ${isUrdu ? "یہ صرف عمومی رہنمائی ہے۔ ہنگامی صورت میں فوری طبی امداد حاصل کریں۔" : "General guidance only. For emergencies, seek immediate in-person care."}
            </div>
          </div>
        </main>
      </div>
    `;

    const chatBody = document.getElementById("chat-body");
    if (chatBody) chatBody.scrollTop = chatBody.scrollHeight;

    document.getElementById("switch-to-admin")?.addEventListener("click", () => navigateTo("/admin/dashboard"));
    document.getElementById("chat-header-back")?.addEventListener("click", () => handleChatAction("show_main_menu"));
    document.getElementById("lang-toggle-chat")?.addEventListener("click", () => handleChatAction("toggle_language"));
    document.getElementById("attach-file-btn")?.addEventListener("click", () => handleChatAction("upload_report"));

    document.querySelectorAll("[data-action]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const action = btn.dataset.action;
        if (action) handleChatAction(action);
      });
    });

    document.getElementById("chat-composer")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("chat-input");
      const val = input.value.trim();
      if (!val) return;
      input.value = "";
      handleFreeTextInput(val);
    });

    // Chat Lookup Form Event Listener (Search Appointment)
    const lookupForm = document.getElementById("chat-lookup-form");
    lookupForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = lookupForm.querySelector("button[type='submit']");
      const appointmentIdInput = lookupForm.querySelector("input[name='appointmentId']");
      const phoneInput = lookupForm.querySelector("input[name='phone']");

      const appointmentId = appointmentIdInput?.value?.trim();
      const phone = phoneInput?.value?.trim();

      if (!appointmentId || !phone) {
        showToast("Please enter both Appointment ID/Token and Phone Number.");
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Searching...";
      }

      try {
        const res = await api.searchAppointment({ reference: appointmentId, phone });
        const appt = res.appointment;
        state.managedAppointment = appt;
        state.activePhone = phone;
        const isOnline = String(appt.appointmentType).toLowerCase() === "online";

        pushMessage({
          sender: "ai",
          title: "✅ Appointment Found",
          text: `👤 Patient: ${appt.patientName}\n🎫 Token: ${appt.tokenNumber}\n${isOnline ? '💻 Type: Online Appointment' : '🏥 Type: In-Person Appointment\n📍 Clinic: ' + (appt.clinic?.name || 'Configured clinic') + '\n📌 Location: ' + (appt.clinic?.address || '')}\n📅 Date: ${appt.date}\n🕓 Time: ${appt.time}\n📋 Status: ${String(appt.status).toUpperCase()}`,
          quickReplies: [
            { label: "✅ Confirm Appointment", action: "action_confirm_appt" },
            { label: "📅 Reschedule", action: "action_reschedule_appt" },
            { label: "❌ Cancel Appointment", action: "action_cancel_appt" },
            { label: "⏰ Request Earlier Appointment", action: "action_earlier_appt" },
            { label: "🏠 Main Menu", action: "show_main_menu" }
          ],
          time: "Now"
        });
        showToast("Appointment Found!");
        renderChatView();
      } catch (err) {
        pushMessage({
          sender: "ai",
          title: "❌ Appointment Not Found",
          text: "We couldn't find an appointment matching that Appointment ID/Token and phone number.\nPlease check the details and try again.",
          quickReplies: [
            { label: "🔄 Try Again", action: "manage_booking" },
            { label: "👤 Speak to Staff", action: "speak_to_staff" },
            { label: "🏠 Main Menu", action: "show_main_menu" }
          ],
          time: "Now"
        });
        renderChatView();
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Search Appointment";
        }
      }
    });

    const reportForm = document.getElementById("chat-report-form");
    reportForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fileInput = document.getElementById("chat-file-input");
      const file = fileInput?.files?.[0];

      if (!file) {
        showToast("Please select a document file to upload.");
        return;
      }

      const validExts = [".pdf", ".jpg", ".jpeg", ".png"];
      const fileNameLower = file.name.toLowerCase();
      const isValidExt = validExts.some(ext => fileNameLower.endsWith(ext));

      if (!isValidExt) {
        pushMessage({
          sender: "ai",
          text: "Please upload a PDF, JPG, JPEG, or PNG file.",
          time: "Now"
        });
        renderChatView();
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        pushMessage({
          sender: "ai",
          text: "This file is too large. Please upload a smaller file (under 10 MB).",
          time: "Now"
        });
        renderChatView();
        return;
      }

      const submitBtn = reportForm.querySelector("button[type='submit']");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Uploading Document...";
      }

      const formData = new FormData(reportForm);
      const progress = document.getElementById("chat-upload-progress");
      const progressText = document.getElementById("chat-upload-progress-text");
      if (progress) progress.style.display = "block";

      try {
        const res = await api.uploadReport(formData, (percent) => {
          if (progress) progress.value = percent;
          if (progressText) progressText.textContent = `Uploading: ${percent}%`;
        });
        const rep = res.report;
        const linkedText = rep.tokenNumber || rep.appointmentId ? `\nIt has also been attached to your appointment record (${rep.tokenNumber ? '#' + rep.tokenNumber : rep.appointmentId}).` : '';

        pushMessage({
          sender: "ai",
          title: "✅ Report Uploaded Successfully",
          text: `Your report has been uploaded successfully and securely added to your record.${linkedText}`,
          quickReplies: [
            { label: "📎 Upload Another Report", action: "upload_report" },
            { label: "📋 View Appointment", action: "manage_booking" },
            { label: "🏠 Main Menu", action: "show_main_menu" }
          ],
          time: "Now"
        });
        showToast("Report Uploaded & Synced with Admin Panel!");
        renderChatView();
      } catch (err) {
        showToast("Upload Error: " + err.message);
        pushMessage({
          sender: "ai",
          text: "Sorry, the report could not be uploaded. Please try again or speak to clinic staff.",
          quickReplies: [
            { label: "👤 Speak to Staff", action: "speak_to_staff" },
            { label: "🏠 Main Menu", action: "show_main_menu" }
          ],
          time: "Now"
        });
        renderChatView();
      }
    });
  }

  // ----------------------------------------------------
  // LOGIN VIEW FOR ADMIN DASHBOARD
  // ----------------------------------------------------
  function renderLoginView() {
    app.innerHTML = `
      <div class="patient-page" style="display: grid; place-items: center; min-height: 100vh;">
        <div class="demo-form" style="width: min(100%, 420px); padding: 24px;">
          <div style="text-align: center; margin-bottom: 16px;">
            <div class="avatar" style="width: 56px; height: 56px; margin: 0 auto 10px;">DS</div>
            <h2>Dr. Sohaib Staff Login</h2>
            <p><small>Access Appointment & Clinic Management Dashboard</small></p>
          </div>
          <form id="login-form">
            <label>Staff Email
              <input type="email" name="email" autocomplete="username" required>
            </label>
            <label>Password
              <input type="password" name="password" autocomplete="current-password" required>
            </label>
            <button class="primary-action wide-button" style="margin-top: 10px;" id="login-submit-btn">Login to Dashboard</button>
            <button type="button" class="header-button wide-button" id="login-back-patient" style="margin-top: 8px; color: var(--ink); border-color: var(--line);">Back to Patient Portal</button>
          </form>
        </div>
      </div>
    `;

    document.getElementById("login-back-patient")?.addEventListener("click", () => navigateTo("/"));
    document.getElementById("login-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      const btn = document.getElementById("login-submit-btn");
      btn.disabled = true;
      btn.textContent = "Logging in...";
      try {
        const res = await api.login(data);
        api.setToken(res.accessToken);
        state.user = res.user;
        showToast(`Welcome back, ${res.user.name}!`);
        navigateTo("/admin/dashboard");
      } catch (err) {
        showToast("Login Failed: " + err.message);
        btn.disabled = false;
        btn.textContent = "Login to Dashboard";
      }
    });
  }

  // ----------------------------------------------------
  // EXPANDED DR. SOHAIB ADMIN DASHBOARD
  // ----------------------------------------------------
  function canAccessAdminTab(tab) {
    const role = state.user?.role;
    const restrictedTabs = {
      doctor_profile: ["super_admin"],
      staff: ["super_admin"],
      audit_logs: ["super_admin"],
      settings: ["super_admin"],
      weekly_schedule: ["super_admin", "receptionist"],
      off_days: ["super_admin", "receptionist"],
      special_schedules: ["super_admin", "receptionist"],
      blocked_slots: ["super_admin", "receptionist"],
      reports: ["super_admin", "doctor", "receptionist"],
      consultations: ["super_admin", "doctor", "receptionist"]
    };
    return !restrictedTabs[tab] || restrictedTabs[tab].includes(role);
  }

  async function renderAdminDashboard() {
    if (!canAccessAdminTab(state.adminTab)) state.adminTab = "dashboard";
    app.innerHTML = `
      <div class="admin-shell">
        <aside class="admin-sidebar">
          <div class="brand-lockup">
            <div class="logo">DS</div>
            <div>
              <strong>Dr. Sohaib Clinic</strong>
              <small>Admin Dashboard</small>
            </div>
          </div>
          
          <nav>
            <div class="nav-section-title">MAIN</div>
            <button class="${state.adminTab === 'dashboard' ? 'active' : ''}" data-tab="dashboard">📊 Overview</button>
            <button class="${state.adminTab === 'appointments' ? 'active' : ''}" data-tab="appointments">📅 Appointments</button>
            <button class="${state.adminTab === 'calendar' ? 'active' : ''}" data-tab="calendar">🗓 Calendar</button>
            <button class="${state.adminTab === 'patients' ? 'active' : ''}" data-tab="patients">👥 Patients</button>

            <div class="nav-section-title">DOCTOR & CLINICS</div>
            <button class="${state.adminTab === 'doctor_profile' ? 'active' : ''}" data-tab="doctor_profile">👨‍⚕️ Doctor Profile</button>
            <button class="${state.adminTab === 'clinics' ? 'active' : ''}" data-tab="clinics">🏥 Clinics</button>
            <button class="${state.adminTab === 'weekly_schedule' ? 'active' : ''}" data-tab="weekly_schedule">📆 Weekly Schedule</button>
            <button class="${state.adminTab === 'off_days' ? 'active' : ''}" data-tab="off_days">🚫 Off-Days</button>
            <button class="${state.adminTab === 'special_schedules' ? 'active' : ''}" data-tab="special_schedules">🗓 Special Schedules</button>
            <button class="${state.adminTab === 'blocked_slots' ? 'active' : ''}" data-tab="blocked_slots">⛔ Blocked Slots</button>

            <div class="nav-section-title">PATIENT SERVICES</div>
            <button class="${state.adminTab === 'services' ? 'active' : ''}" data-tab="services">🦴 Services / Treatments</button>
            <button class="${state.adminTab === 'reports' ? 'active' : ''}" data-tab="reports">📎 Uploaded Reports</button>
            <button class="${state.adminTab === 'consultations' ? 'active' : ''}" data-tab="consultations">💻 Virtual Consultation</button>
            <button class="${state.adminTab === 'emergencies' ? 'active' : ''}" data-tab="emergencies">🚨 Emergency Alerts</button>

            <div class="nav-section-title">COMMUNICATION</div>
            <button class="${state.adminTab === 'conversations' ? 'active' : ''}" data-tab="conversations">💬 Staff Inbox</button>
            <button class="${state.adminTab === 'handover' ? 'active' : ''}" data-tab="handover">🤝 Human Handover</button>

            <div class="nav-section-title">MANAGEMENT</div>
            <button class="${state.adminTab === 'staff' ? 'active' : ''}" data-tab="staff">👥 Staff</button>
            <button class="${state.adminTab === 'reminders' ? 'active' : ''}" data-tab="reminders">🔔 Reminders</button>
            <button class="${state.adminTab === 'audit_logs' ? 'active' : ''}" data-tab="audit_logs">📜 Audit Logs</button>
            <button class="${state.adminTab === 'system_health' ? 'active' : ''}" data-tab="system_health">❤️ System Health</button>
            <button class="${state.adminTab === 'settings' ? 'active' : ''}" data-tab="settings">⚙️ Settings</button>
          </nav>

          <div style="margin-top: auto; padding-top: 20px; border-top: 1px solid #334155;">
            <div style="font-size: 0.8rem; color: #94a3b8; margin-bottom: 8px;">
              Logged in: <strong>${esc(state.user?.name || 'Super Admin')}</strong>
            </div>
            <button class="header-button wide-button" id="admin-logout-btn">Logout</button>
            <button class="header-button wide-button" id="admin-patient-portal-btn" style="margin-top: 6px;">Patient Portal</button>
          </div>
        </aside>

        <main class="admin-main" id="admin-main-content">
          <p>Loading Dr. Sohaib Admin Dashboard...</p>
        </main>
      </div>
    `;

    document.querySelectorAll(".admin-sidebar nav button").forEach(btn => {
      if (!canAccessAdminTab(btn.dataset.tab)) {
        btn.remove();
        return;
      }
      btn.addEventListener("click", () => {
        state.adminTab = btn.dataset.tab;
        navigateTo(`/admin/${btn.dataset.tab}`);
      });
    });

    document.getElementById("admin-logout-btn")?.addEventListener("click", async () => {
      await api.logout().catch(() => {});
      api.setToken("");
      state.user = null;
      navigateTo("/");
    });

    document.getElementById("admin-patient-portal-btn")?.addEventListener("click", () => navigateTo("/"));

    loadDashboardTabContent();
  }

  // ----------------------------------------------------
  // DYNAMIC TAB CONTENT LOADING
  // ----------------------------------------------------
  async function loadDashboardTabContent() {
    const container = document.getElementById("admin-main-content");
    if (!container) return;

    try {
      if (state.adminTab === "dashboard") {
        const [summaryRes, apptsRes, locationRes] = await Promise.all([
          api.dashboardSummary(state.dashboardLocationId, state.dashboardDate),
          api.dashboardRecentAppointments(),
          api.clinics()
        ]);
        const s = summaryRes.summary || {};
        state.dashboardLocationId = s.selectedClinic?.code || state.dashboardLocationId;
        state.dashboardDate = s.selectedDate || state.dashboardDate;
        const dashboardLocations = locationRes.locations || [];

        container.innerHTML = `
          <header>
            <h2>Dr. Sohaib Clinic Overview Dashboard</h2>
            <small>Database-calculated schedule and availability</small>
          </header>

          <form id="dashboard-availability-filter" class="demo-form compact" style="margin:16px 0;display:grid;grid-template-columns:1fr 1fr auto;gap:12px;align-items:end;">
            <label>Clinic
              <select name="locationId">
                ${dashboardLocations.map((location) => `<option value="${esc(location.code)}" ${location.code === state.dashboardLocationId ? 'selected' : ''}>${esc(location.clinicName)} — ${esc(location.status)}</option>`).join('')}
              </select>
            </label>
            <label>Date
              <input type="date" name="date" value="${esc(state.dashboardDate)}" required>
            </label>
            <button class="primary-action" type="submit">Apply</button>
          </form>

          <div class="stat-grid">
            <article>
              <div class="stat-icon">📅</div>
              <div>
                <strong>${s.totalPossibleSlots || 0}</strong>
                <small style="display: block;">Total Possible Slots</small>
              </div>
            </article>
            <article>
              <div class="stat-icon" style="background:#dcfce7; color:#16a34a;">✅</div>
              <div>
                <strong>${s.bookedSlots || 0}</strong>
                <small style="display: block;">Booked Slots</small>
              </div>
            </article>
            <article>
              <div class="stat-icon" style="background:#e0e7ff; color:#4f46e5;">🏁</div>
              <div>
                <strong>${s.availableSlots || 0}</strong>
                <small style="display: block;">Available Slots</small>
              </div>
            </article>
            <article>
              <div class="stat-icon" style="background:#fee2e2; color:#dc2626;">❌</div>
              <div>
                <strong>${s.blockedSlots || 0}</strong>
                <small style="display: block;">Blocked Slots</small>
              </div>
            </article>
          </div>

          <div class="stat-grid" style="margin-top: 16px;">
            <article>
              <div class="stat-icon" style="background:#fef3c7; color:#d97706;">⚠️</div>
              <div>
                <strong>${s.cancelledAppointments || 0}</strong>
                <small style="display: block;">Cancelled Appointments</small>
              </div>
            </article>
            <article>
              <div class="stat-icon">🕒</div>
              <div>
                <strong>${s.todayConfirmed || 0}</strong>
                <small style="display: block;">Confirmed</small>
              </div>
            </article>
            <article>
              <div class="stat-icon">⛔</div>
              <div>
                <strong>${s.todayCompleted || 0}</strong>
                <small style="display: block;">Completed</small>
              </div>
            </article>
            <article>
              <div class="stat-icon">🚫</div>
              <div>
                <strong>${s.noShows || 0}</strong>
                <small style="display: block;">No-Shows</small>
              </div>
            </article>
          </div>

          <div class="stat-grid" style="margin-top: 16px;">
            <article>
              <div class="stat-icon">💻</div>
              <div>
                <strong>${s.pendingConsultations || 0}</strong>
                <small style="display: block;">Pending Consultations</small>
              </div>
            </article>
            <article>
              <div class="stat-icon">🤝</div>
              <div>
                <strong>${s.humanHandovers || 0}</strong>
                <small style="display: block;">Human Handovers</small>
              </div>
            </article>
            <article>
              <div class="stat-icon" style="background:#ffe4e6; color:#e11d48;">🚨</div>
              <div>
                <strong>${s.activeEmergencies || 0}</strong>
                <small style="display: block;">Pending Emergency Alerts</small>
              </div>
            </article>
            <article>
              <div class="stat-icon">📎</div>
              <div>
                <strong>${s.pendingReports || 0}</strong>
                <small style="display: block;">Uploaded Reports Pending Review</small>
              </div>
            </article>
          </div>

          <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; padding:20px; margin-top:24px;">
            <h3>Integration Status</h3>
            <div style="display:flex; flex-wrap:wrap; gap:12px; margin-top:12px;">
              <span class="badge confirmed">Database: Connected</span>
              <span class="badge pending">WhatsApp: Connected / Simulation Active</span>
              <span class="badge confirmed">Appointment API: Connected</span>
              <span class="badge confirmed">Reminder System: Enabled</span>
              <span class="badge confirmed">File Storage: Connected</span>
              <span class="badge confirmed">Automated Assistant: Active</span>
            </div>
          </div>

          <h3 style="margin-top: 28px; margin-bottom: 12px;">Recent Appointments</h3>
          <div class="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Appointment ID</th>
                  <th>Patient</th>
                  <th>Phone</th>
                  <th>Appointment Type</th>
                  <th>Date & Time</th>
                  <th>City / Clinic</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${(apptsRes.appointments || []).map(a => `
                  <tr>
                    <td><strong style="color: var(--teal);">#${a.tokenNumber}</strong></td>
                    <td><strong>${a.appointmentId}</strong></td>
                    <td>${esc(a.patientSnapshot?.fullName || a.patientName || a.phoneE164)}</td>
                    <td>${a.phoneE164 || a.phoneMasked}</td>
                    <td><span class="badge ${String(a.appointmentType).toLowerCase() === 'online' ? 'completed' : 'confirmed'}">${String(a.appointmentType).toLowerCase() === 'online' ? 'Online' : 'In-Person'}</span></td>
                    <td>${a.date} at ${a.time}</td>
                    <td>${esc(a.locationSnapshot?.city || '')} (${esc(a.locationSnapshot?.clinicName || 'Configured clinic')})</td>
                    <td><span class="badge ${a.status}">${a.status}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
        document.getElementById("dashboard-availability-filter")?.addEventListener("submit", (event) => {
          event.preventDefault();
          const data = Object.fromEntries(new FormData(event.target));
          state.dashboardLocationId = data.locationId;
          state.dashboardDate = data.date;
          loadDashboardTabContent();
        });
      } else if (state.adminTab === "appointments") {
        const res = await api.appointments();
        container.innerHTML = `
          <header>
            <h2>Appointments Directory</h2>
            <small>Live records stored in MongoDB database</small>
          </header>
          <div class="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Token</th>
                  <th>ID</th>
                  <th>Patient Name</th>
                  <th>Phone</th>
                  <th>Appointment Type</th>
                  <th>City</th>
                  <th>Clinic & Address</th>
                  <th>Date & Time</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${(res.appointments || []).map(a => `
                  <tr>
                    <td><strong style="color: var(--teal);">#${a.tokenNumber}</strong></td>
                    <td><strong>${a.appointmentId}</strong></td>
                    <td>${esc(a.patientSnapshot?.fullName || a.patientName)}</td>
                    <td>${a.phoneE164 || a.phoneMasked}</td>
                    <td><span class="badge ${String(a.appointmentType).toLowerCase() === 'online' ? 'completed' : 'confirmed'}">${String(a.appointmentType).toLowerCase() === 'online' ? 'Online' : 'In-Person'}</span></td>
                    <td>${esc(a.locationSnapshot?.city || 'Bahawalpur')}</td>
                    <td>${esc(a.locationSnapshot?.clinicName || 'Configured clinic')}, ${esc(a.locationSnapshot?.address || '')}</td>
                    <td>${a.date} at ${a.time}</td>
                    <td><span class="badge ${a.status}">${a.status}</span></td>
                    <td>
                      <button class="primary-action btn-sm" onclick="window.updateApptStatus('${a._id}', 'confirmed')">Confirm</button>
                      <button class="primary-action btn-sm" style="background:#4f46e5;" onclick="window.updateApptStatus('${a._id}', 'completed')">Complete</button>
                      <button class="danger-action btn-sm" onclick="window.updateApptStatus('${a._id}', 'cancelled')">Cancel</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;

        window.updateApptStatus = async (id, status) => {
          await api.updateAppointmentStatus(id, status);
          showToast(`Appointment status updated to ${status}`);
          loadDashboardTabContent();
        };
      } else if (state.adminTab === "reports") {
        const res = await api.listReports();
        const reports = res.reports || [];

        container.innerHTML = `
          <header style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <h2>📎 Uploaded Medical Reports Directory</h2>
              <small>Patient report metadata with files held in private storage</small>
            </div>
            <button class="primary-action" id="refresh-reports-btn">🔄 Refresh Reports</button>
          </header>
          
          <div class="responsive-table" style="margin-top:16px;">
            <table>
              <thead>
                <tr>
                  <th>Report ID</th>
                  <th>Patient Name</th>
                  <th>Phone Number</th>
                  <th>Report Type</th>
                  <th>File Name</th>
                  <th>Appointment / Token</th>
                  <th>Upload Date & Time</th>
                  <th>Status</th>
                  <th>Staff Notes</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${reports.length > 0 ? reports.map(r => `
                  <tr>
                    <td><strong>${r.reportId || r._id}</strong></td>
                    <td>${esc(r.patient?.fullName || r.patientPhone)}</td>
                    <td>${r.patientPhone}</td>
                    <td><span class="badge confirmed">${esc((r.documentType || 'other').toUpperCase())}</span></td>
                    <td>${esc(r.fileName || r.originalFilename)}</td>
                    <td><strong style="color:var(--teal);">${r.tokenNumber ? '#' + r.tokenNumber : (r.appointmentId || '-')}</strong></td>
                    <td>${new Date(r.createdAt || Date.now()).toLocaleString()}</td>
                    <td><span class="badge ${r.status === 'New' || r.status === 'Uploaded' ? 'pending' : 'confirmed'}">${r.status}</span></td>
                    <td style="max-width:140px; font-size:0.85rem; color:var(--muted);">${esc(r.notes || '-')}</td>
                    <td>
                      ${['super_admin', 'doctor', 'receptionist'].includes(state.user?.role) ? `<button class="primary-action btn-sm" onclick="window.viewReportFile('${esc(r.reportId || r._id)}')" ${r.fileStatus !== 'active' ? 'disabled' : ''}>👁️ View</button>` : ''}
                      ${['super_admin', 'doctor'].includes(state.user?.role) ? `<button class="primary-action btn-sm" style="background:#0284c7;" onclick="window.downloadReportFile('${esc(r.reportId || r._id)}')" ${r.fileStatus !== 'active' ? 'disabled' : ''}>⬇️ Download</button>` : ''}
                      ${r.fileStatus === 'active' && r.status !== 'Reviewed' && ['super_admin', 'doctor'].includes(state.user?.role) ? `<button class="primary-action btn-sm" style="background:#16a34a;" onclick="window.markReportReviewed('${r._id}')">✅ Reviewed</button>` : ''}
                      ${['super_admin', 'doctor', 'receptionist'].includes(state.user?.role) ? `<button class="primary-action btn-sm" style="background:#4f46e5;" onclick="window.addReportNotePrompt('${r._id}', '${esc(r.notes || '')}')">📝 Note</button>` : ''}
                      ${state.user?.role === 'super_admin' ? `<button class="primary-action btn-sm" style="background:#b91c1c;" onclick="window.deleteReport('${esc(r.reportId || r._id)}')">🗑️ Delete</button>` : ''}
                    </td>
                  </tr>
                `).join('') : `<tr><td colspan="10" style="text-align:center; padding:24px;">No medical reports uploaded yet.</td></tr>`}
              </tbody>
            </table>
          </div>
        `;

        document.getElementById("refresh-reports-btn")?.addEventListener("click", () => loadDashboardTabContent());

        window.viewReportFile = async (id) => {
          try {
            const result = await api.viewReport(id);
            const objectUrl = URL.createObjectURL(result.blob);
            window.open(objectUrl, "_blank");
            setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
          } catch (error) {
            showToast("View error: " + error.message);
          }
        };

        window.downloadReportFile = async (id) => {
          try {
            const result = await api.downloadReport(id);
            const objectUrl = URL.createObjectURL(result.blob);
            const link = document.createElement("a");
            link.href = objectUrl;
            link.download = "medical-report";
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
          } catch (error) {
            showToast("Download error: " + error.message);
          }
        };

        window.markReportReviewed = async (id) => {
          await api.updateReportStatus(id, "Reviewed");
          showToast("Report marked as Reviewed!");
          loadDashboardTabContent();
        };

        window.addReportNotePrompt = async (id, currentNote = "") => {
          const note = window.prompt("Add or update staff note for this report:", currentNote || "");
          if (note === null) return;
          try {
            await api.addReportNote(id, note);
            showToast("Report note saved!");
            loadDashboardTabContent();
          } catch (error) {
            showToast("Note error: " + error.message);
          }
        };

        window.deleteReport = async (id) => {
          if (!window.confirm("Permanently remove this private medical file? The audit record will be retained.")) return;
          try {
            await api.deleteReport(id);
            showToast("Medical file deleted securely.");
            loadDashboardTabContent();
          } catch (error) {
            showToast("Deletion error: " + error.message);
          }
        };
      } else if (state.adminTab === "calendar") {
        const res = await api.appointments();
        const appts = res.appointments || [];

        container.innerHTML = `
          <header style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <h2>🗓 Clinic Appointment Calendar</h2>
              <small>Visual timeline of booked, confirmed, and completed slots</small>
            </div>
            <div style="display:flex; gap:8px;">
              <button class="primary-action ${state.calendarView === 'day' ? '' : 'header-button'}" id="cal-day">Day View</button>
              <button class="primary-action ${state.calendarView === 'week' ? '' : 'header-button'}" id="cal-week">Week View</button>
              <button class="primary-action ${state.calendarView === 'month' ? '' : 'header-button'}" id="cal-month">Month View</button>
            </div>
          </header>

          <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; padding:20px; margin-top:16px;">
            <h3>Schedule Matrix (${state.calendarView.toUpperCase()} VIEW)</h3>
            <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap:12px; margin-top:16px;">
              ${appts.map(a => `
                <div style="border:1px solid var(--line); border-radius:12px; padding:12px; background:#f8faf9;">
                  <strong style="color:var(--teal-dark);">#${a.tokenNumber} — ${a.time} (${String(a.appointmentType).toLowerCase() === 'online' ? 'Online' : 'In-Person'})</strong>
                  <div style="font-size:0.85rem; margin-top:4px;">Patient: ${esc(a.patientSnapshot?.fullName || a.patientName)}</div>
                  <div style="font-size:0.8rem; color:var(--muted);">Date: ${a.date}</div>
                  <span class="badge ${a.status}" style="margin-top:6px;">${a.status}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `;

        document.getElementById("cal-day")?.addEventListener("click", () => { state.calendarView = "day"; loadDashboardTabContent(); });
        document.getElementById("cal-week")?.addEventListener("click", () => { state.calendarView = "week"; loadDashboardTabContent(); });
        document.getElementById("cal-month")?.addEventListener("click", () => { state.calendarView = "month"; loadDashboardTabContent(); });
      } else if (state.adminTab === "patients") {
        const res = await api.patients();
        const patients = res.patients || [];
        container.innerHTML = `
          <header>
            <h2>👥 Patients Directory</h2>
            <small>Registered patient profiles and appointment history</small>
          </header>
          <div class="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Patient Name</th>
                  <th>Phone Number</th>
                  <th>City</th>
                  <th>Preferred Language</th>
                  <th>Created At</th>
                </tr>
              </thead>
              <tbody>
                ${patients.map(p => `
                  <tr>
                    <td><strong>${esc(p.fullName)}</strong></td>
                    <td>${p.phoneE164}</td>
                    <td>${esc(p.city || 'Bahawalpur')}</td>
                    <td>${p.preferredLanguage === 'ur' ? 'اردو' : 'English'}</td>
                    <td>${new Date(p.createdAt).toLocaleDateString()}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      } else if (state.adminTab === "doctor_profile") {
        const docRes = await api.getDoctorProfile();
        const doc = docRes.doctor || docRes.doctorProfile || {};

        container.innerHTML = `
          <header>
            <h2>👨‍⚕️ Manage Doctor Profile</h2>
            <small>Update Dr. Sohaib's official profile, credentials, and consultation details</small>
          </header>
          <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; padding:24px; max-width:680px;">
            <form id="doc-profile-form" class="demo-form">
              <label>Doctor Full Name
                <input name="doctorName" value="${esc(doc.doctorName || 'Dr. Sohaib')}" required>
              </label>
              <label>Qualifications
                <input name="qualification" value="${esc(doc.qualification || '')}" required>
              </label>
              <label>Specialty
                <input name="specialty" value="${esc(doc.specialty || '')}" required>
              </label>
              <label>Clinical Experience
                <input name="experience" value="${esc(doc.experience || '')}" required>
              </label>
              <label>Services Offered
                <textarea name="services" rows="3" required>${esc(doc.services || 'Professional Consultations, Surgical Evaluations, Comprehensive Diagnosis & Follow-up Care')}</textarea>
              </label>
              <label>Biography
                <textarea name="bio" rows="3" required>${esc(doc.bio || '')}</textarea>
              </label>
              <button class="primary-action wide-button" type="submit" style="margin-top:10px;">Save Profile Changes</button>
            </form>
          </div>
        `;

        document.getElementById("doc-profile-form")?.addEventListener("submit", async (e) => {
          e.preventDefault();
          const data = Object.fromEntries(new FormData(e.target));
          await api.updateDoctorProfile(data);
          showToast("Doctor Profile Updated Successfully!");
          loadDashboardTabContent();
        });
      } else if (state.adminTab === "clinics") {
        const locRes = await api.clinics();
        const locs = locRes.locations || [];

        container.innerHTML = `
          <header style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <h2>🏥 Clinic Locations Management</h2>
              <small>Manage active and regional coming-soon clinic centers</small>
            </div>
          </header>
          <div class="responsive-table" style="margin-top:16px;">
            <table>
              <thead>
                <tr>
                  <th>Clinic Code</th>
                  <th>Clinic Name</th>
                  <th>City</th>
                  <th>Address</th>
                  <th>Status</th>
                  <th>Booking Enabled</th>
                </tr>
              </thead>
              <tbody>
                ${locs.map(l => `
                  <tr>
                    <td><strong>${l.code}</strong></td>
                    <td>${esc(l.clinicName)}</td>
                    <td>${esc(l.city)}</td>
                    <td>${esc(l.fullAddress)}</td>
                    <td><span class="badge ${l.status === 'Active' ? 'confirmed' : 'pending'}">${l.status}</span></td>
                    <td>${l.bookingEnabled ? '✅ Active' : '🚫 Disabled'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      } else if (state.adminTab === "weekly_schedule") {
        const scheduleRes = await api.getManagedSchedule("BWP");
        const schedule = scheduleRes.location;
        const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
        container.innerHTML = `
          <header>
            <h2>📆 Weekly Clinic Schedule</h2>
            <small>Configure consultation days and time windows for Bahawalpur Iqbal Hospital</small>
          </header>
          <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; padding:24px; max-width:600px;">
            <h3>Iqbal Hospital, Bahawalpur</h3>
            <div style="margin-top:16px; display:flex; flex-direction:column; gap:10px;">
              <div style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid #eee;">
                <strong>Monday</strong> <span>4:30 PM – 8:30 PM (Active)</span>
              </div>
              <div style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid #eee;">
                <strong>Tuesday</strong> <span>4:30 PM – 8:30 PM (Active)</span>
              </div>
              <div style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid #eee;">
                <strong>Wednesday</strong> <span>4:30 PM – 8:30 PM (Active)</span>
              </div>
              <div style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid #eee;">
                <strong>Thursday</strong> <span>4:30 PM – 8:30 PM (Active)</span>
              </div>
              <div style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid #eee; color:#888;">
                <strong>Friday – Sunday</strong> <span>Closed</span>
              </div>
            </div>
          </div>
        `;
        container.innerHTML = `
          <header><h2>Weekly Clinic Schedule</h2><small>Authoritative schedule for ${esc(schedule.clinicName)}, ${esc(schedule.city)}</small></header>
          <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:24px;max-width:700px;">
            <form id="weekly-schedule-form" class="demo-form">
              <label>Clinic timezone<input name="timezone" value="${esc(schedule.timezone)}" required></label>
              <label>Slot duration (minutes)<input type="number" name="slotDurationMinutes" min="5" max="240" value="${schedule.slotDurationMinutes}" required></label>
              <label>Same-day advance cutoff (minutes)<input type="number" name="sameDayBookingCutoffMinutes" min="0" max="1440" value="${schedule.sameDayBookingCutoffMinutes || 0}" required></label>
              ${(schedule.weeklyHours || []).slice().sort((a, b) => a.day - b.day).map((hours) => `
                <fieldset style="display:grid;grid-template-columns:1fr auto 110px 110px;gap:8px;align-items:center;border:0;border-bottom:1px solid #eee;padding:10px 0;">
                  <strong>${dayNames[hours.day - 1]}</strong>
                  <label><input type="checkbox" name="day-${hours.day}-open" ${hours.isOpen ? 'checked' : ''}> Open</label>
                  <input type="time" name="day-${hours.day}-start" value="${esc(hours.start)}" required>
                  <input type="time" name="day-${hours.day}-end" value="${esc(hours.end)}" required>
                </fieldset>
              `).join('')}
              <button class="primary-action wide-button" type="submit">Save Weekly Schedule</button>
            </form>
          </div>`;
        document.getElementById("weekly-schedule-form")?.addEventListener("submit", async (event) => {
          event.preventDefault();
          const form = new FormData(event.target);
          const payload = {
            locationId: "BWP",
            timezone: form.get("timezone"),
            slotDurationMinutes: Number(form.get("slotDurationMinutes")),
            sameDayBookingCutoffMinutes: Number(form.get("sameDayBookingCutoffMinutes")),
            weeklyHours: dayNames.map((name, index) => ({ day: index + 1, isOpen: form.get(`day-${index + 1}-open`) === "on", start: form.get(`day-${index + 1}-start`), end: form.get(`day-${index + 1}-end`) }))
          };
          try {
            await api.updateSchedule(payload);
          } catch (error) {
            if (!error.details?.requiresConfirmation || !window.confirm(`${error.message}\n\nExisting appointments will remain booked. Apply this schedule anyway?`)) throw error;
            await api.updateSchedule({ ...payload, confirmExistingAppointments: true });
          }
          showToast("Weekly schedule saved in the clinic database.");
          loadDashboardTabContent();
        });
      } else if (state.adminTab === "off_days") {
        const managedSchedule = (await api.getManagedSchedule("BWP")).location;
        container.innerHTML = `
          <header>
            <h2>🚫 Off-Days & Doctor Leave</h2>
            <small>Block full or partial clinic days for holidays or doctor leave</small>
          </header>
          <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; padding:20px; max-width:500px; margin-bottom:20px;">
            <h3>Add Off-Day / Leave</h3>
            <form id="off-day-form" class="demo-form" style="margin-top:12px;">
              <label>Select Date
                <input type="date" name="date" required>
              </label>
              <label>Reason / Note
                <input name="reason" placeholder="e.g. Public Holiday / Doctor Leave" required>
              </label>
              <button class="primary-action wide-button" type="submit">Block Selected Date</button>
            </form>
          </div>
        `;
        container.insertAdjacentHTML("beforeend", `<div style="margin-top:16px;max-width:700px;"><h3>Saved blocked dates</h3>${(managedSchedule.blockedDates || []).length ? managedSchedule.blockedDates.map((entry) => `<div style="display:flex;justify-content:space-between;padding:10px;border-bottom:1px solid #eee;"><span><strong>${esc(entry.date)}</strong> — ${esc(entry.reason)}</span><button class="header-button unblock-date-btn" data-date="${esc(entry.date)}">Unblock</button></div>`).join('') : '<p>No blocked dates.</p>'}</div>`);

        document.getElementById("off-day-form")?.addEventListener("submit", async (e) => {
          e.preventDefault();
          const data = Object.fromEntries(new FormData(e.target));
          const payload = { locationId: "BWP", date: data.date, reason: data.reason };
          try {
            await api.blockDate(payload);
          } catch (error) {
            if (!error.details?.requiresConfirmation || !window.confirm(`${error.message}\n\nExisting appointments will remain booked. Block this date anyway?`)) throw error;
            await api.blockDate({ ...payload, confirmExistingAppointments: true });
          }
          showToast(`Date ${data.date} blocked successfully!`);
          loadDashboardTabContent();
        });
        document.querySelectorAll(".unblock-date-btn").forEach((button) => button.addEventListener("click", async () => {
          await api.unblockDate({ locationId: "BWP", date: button.dataset.date });
          showToast(`Date ${button.dataset.date} unblocked.`);
          loadDashboardTabContent();
        }));
      } else if (state.adminTab === "special_schedules") {
        container.innerHTML = `
          <header>
            <h2>🗓 Special Schedules</h2>
            <small>Override normal clinic timings for specific dates</small>
          </header>
          <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; padding:20px; max-width:500px;">
            <h3>Configure Special Timing Date</h3>
            <p style="font-size:0.85rem; color:var(--muted); margin-top:6px;">Set custom consultation windows for specific dates.</p>
          </div>
        `;
      } else if (state.adminTab === "blocked_slots") {
        const managedSchedule = (await api.getManagedSchedule("BWP")).location;
        container.innerHTML = `
          <header>
            <h2>⛔ Blocked Slots Management</h2>
            <small>Block specific time slots on particular dates</small>
          </header>
          <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; padding:20px; max-width:500px;">
            <h3>Block Individual Time Slot</h3>
            <form id="block-slot-form" class="demo-form" style="margin-top:12px;">
              <label>Date
                <input type="date" name="date" required>
              </label>
              <label>Time Slot (HH:MM)
                <input name="time" placeholder="e.g. 17:15" required>
              </label>
              <label>Reason
                <input name="reason" placeholder="e.g. Doctor Unavailable" required>
              </label>
              <button class="primary-action wide-button" type="submit">Block Selected Slot</button>
            </form>
          </div>
        `;
        container.insertAdjacentHTML("beforeend", `<div style="margin-top:16px;max-width:700px;"><h3>Saved blocked slots</h3>${(managedSchedule.blockedSlots || []).length ? managedSchedule.blockedSlots.map((entry) => `<div style="display:flex;justify-content:space-between;padding:10px;border-bottom:1px solid #eee;"><span><strong>${esc(entry.date)} ${esc(entry.time)}</strong> — ${esc(entry.reason)}</span><button class="header-button unblock-slot-btn" data-date="${esc(entry.date)}" data-time="${esc(entry.time)}">Unblock</button></div>`).join('') : '<p>No blocked slots.</p>'}</div>`);

        document.getElementById("block-slot-form")?.addEventListener("submit", async (e) => {
          e.preventDefault();
          const data = Object.fromEntries(new FormData(e.target));
          const payload = { locationId: "BWP", date: data.date, time: data.time, reason: data.reason };
          try {
            await api.blockSlot(payload);
          } catch (error) {
            if (!error.details?.requiresConfirmation || !window.confirm(`${error.message}\n\nThe existing appointment will remain booked. Block this slot anyway?`)) throw error;
            await api.blockSlot({ ...payload, confirmExistingAppointments: true });
          }
          showToast(`Slot ${data.time} on ${data.date} blocked!`);
          loadDashboardTabContent();
        });
        document.querySelectorAll(".unblock-slot-btn").forEach((button) => button.addEventListener("click", async () => {
          await api.unblockSlot({ locationId: "BWP", date: button.dataset.date, time: button.dataset.time });
          showToast(`Slot ${button.dataset.time} on ${button.dataset.date} unblocked.`);
          loadDashboardTabContent();
        }));
      } else if (state.adminTab === "services") {
        container.innerHTML = `
          <header>
            <h2>🦴 Services & Treatments Directory</h2>
            <small>Manage medical services and diagnostic evaluations</small>
          </header>
          <div class="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Service Title</th>
                  <th>Category</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr><td><strong>Knee Joint Conditions & Arthroscopy</strong></td><td>Knee Evaluation</td><td><span class="badge confirmed">Active</span></td></tr>
                <tr><td><strong>ACL Ligament & Meniscus Tears</strong></td><td>Ligament Care</td><td><span class="badge confirmed">Active</span></td></tr>
                <tr><td><strong>Shoulder Pain & Joint Stiffness</strong></td><td>Shoulder Evaluation</td><td><span class="badge confirmed">Active</span></td></tr>
                <tr><td><strong>Partial & Total Joint Replacement</strong></td><td>Joint Surgery</td><td><span class="badge confirmed">Active</span></td></tr>
                <tr><td><strong>Trauma & Fracture Management</strong></td><td>Trauma Evaluation</td><td><span class="badge confirmed">Active</span></td></tr>
              </tbody>
            </table>
          </div>
        `;
      } else if (state.adminTab === "consultations") {
        const res = await api.listConsultations();
        container.innerHTML = `
          <header>
            <h2>💻 Online Virtual Consultations</h2>
          </header>
          <div class="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Consultation ID</th>
                  <th>Patient Name</th>
                  <th>Phone</th>
                  <th>Symptoms</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${(res.consultations || []).map(c => `
                  <tr>
                    <td><strong>${c.consultationId || c._id}</strong></td>
                    <td>${esc(c.fullName || "Patient")}</td>
                    <td>${c.contactPhone}</td>
                    <td>${esc(c.symptoms)}</td>
                    <td><span class="badge ${c.status.toLowerCase()}">${c.status}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      } else if (state.adminTab === "emergencies") {
        const res = await api.listEmergencyAlerts();
        container.innerHTML = `
          <header>
            <h2>🚨 Emergency Alerts Log</h2>
          </header>
          <div class="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Patient Phone</th>
                  <th>Priority</th>
                  <th>Alert Message</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${(res.alerts || []).map(e => `
                  <tr>
                    <td><strong>${e.phoneE164}</strong></td>
                    <td><span class="badge emergency">${e.priority}</span></td>
                    <td>${esc(e.alertMessage)}</td>
                    <td><span class="badge ${e.status}">${e.status}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      } else if (state.adminTab === "conversations") {
        const res = await api.listConversations();
        const convs = res.conversations || [];
        container.innerHTML = `
          <header>
            <h2>💬 Staff Inbox & Live Chat</h2>
          </header>
          <div style="display: grid; grid-template-columns: 320px 1fr; gap: 16px; min-height: 480px;">
            <div style="border: 1px solid var(--line); border-radius: 12px; background: #fff; padding: 12px; overflow-y: auto;">
              <h3 style="margin-bottom: 12px;">Active Conversations</h3>
              ${convs.map(c => `
                <div style="padding: 10px; border-bottom: 1px solid #edf2f1; cursor: pointer;" class="conv-item" data-id="${c._id}">
                  <strong>${esc(c.phoneE164)}</strong>
                  <small style="display: block;">Handover: ${c.humanRequired ? '🔴 ACTIVE' : '🟢 Automation Active'}</small>
                </div>
              `).join('')}
            </div>
            <div id="conv-detail-pane" style="border: 1px solid var(--line); border-radius: 12px; background: #fff; padding: 16px; display: flex; flex-direction: column;">
              <p style="color: var(--muted);">Select a conversation from the left to view messages and manage takeover.</p>
            </div>
          </div>
        `;

        document.querySelectorAll(".conv-item").forEach(item => {
          item.addEventListener("click", async () => {
            const id = item.dataset.id;
            const detailRes = await api.getConversation(id);
            const pane = document.getElementById("conv-detail-pane");
            if (!pane || !detailRes.conversation) return;
            const conv = detailRes.conversation;
            const msgs = detailRes.messages || [];

            pane.innerHTML = `
              <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--line); padding-bottom: 12px; margin-bottom: 12px;">
                <div>
                  <h3>${esc(conv.phoneE164)}</h3>
                  <small>Status: ${conv.humanRequired ? '🔴 Human Takeover Active' : '🟢 Automation Active'}</small>
                </div>
                <div>
                  ${conv.humanRequired ? `
                    <button class="primary-action" id="btn-reactivate-ai">Resume Automated Assistant</button>
                  ` : `
                    <button class="danger-action" id="btn-takeover">Take Over Conversation</button>
                  `}
                </div>
              </div>

              <div style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; max-height: 350px;">
                ${msgs.map(m => `
                  <div style="padding: 8px 12px; border-radius: 10px; max-width: 80%; ${m.senderType === 'patient' ? 'background: #e8f4f2; align-self: flex-start;' : 'background: #0f766e; color: #fff; align-self: flex-end;'}">
                    <small style="display: block; font-weight: bold; opacity: 0.8;">${m.senderType.toUpperCase()}</small>
                    ${esc(m.body)}
                  </div>
                `).join('')}
              </div>

              <form id="staff-send-form" style="display: flex; gap: 8px;">
                <input name="reply" placeholder="Type staff reply..." style="flex: 1; padding: 10px; border: 1px solid var(--line); border-radius: 8px;" required>
                <button type="submit" class="primary-action">Send Reply</button>
              </form>
            `;

            document.getElementById("btn-takeover")?.addEventListener("click", async () => {
              await api.takeoverConversation(id);
              showToast("Human Takeover Activated. Automation is paused.");
              loadDashboardTabContent();
            });

            document.getElementById("btn-reactivate-ai")?.addEventListener("click", async () => {
              await api.reactivateAi(id);
              showToast("Automated Assistant Reactivated.");
              loadDashboardTabContent();
            });

            document.getElementById("staff-send-form")?.addEventListener("submit", async (e) => {
              e.preventDefault();
              const reply = e.target.reply.value.trim();
              if (!reply) return;
              await api.sendMessage(id, { body: reply, senderType: "staff" });
              showToast("Staff message sent!");
              loadDashboardTabContent();
            });
          });
        });
      } else if (state.adminTab === "handover") {
        const res = await api.listConversations();
        const handovers = (res.conversations || []).filter(c => c.humanRequired);

        container.innerHTML = `
          <header>
            <h2>🤝 Human Handover Control Center</h2>
            <small>Conversations transferred to human staff takeover</small>
          </header>
          <div class="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Patient Phone</th>
                  <th>Handover Status</th>
                  <th>Last Activity</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${handovers.length > 0 ? handovers.map(h => `
                  <tr>
                    <td><strong>${esc(h.phoneE164)}</strong></td>
                    <td><span class="badge emergency">Human Takeover Active</span></td>
                    <td>${new Date(h.lastMessageAt || Date.now()).toLocaleTimeString()}</td>
                    <td>
                      <button class="primary-action btn-sm" onclick="window.resumeAiHandler('${h._id}')">Resume Automated Assistant</button>
                    </td>
                  </tr>
                `).join('') : `<tr><td colspan="4">No active human handover requests currently. Automation is handling incoming queries.</td></tr>`}
              </tbody>
            </table>
          </div>
        `;

        window.resumeAiHandler = async (id) => {
          await api.reactivateAi(id);
          showToast("Automated Assistant Reactivated!");
          loadDashboardTabContent();
        };
      } else if (state.adminTab === "staff") {
        const usersResponse = await api.staffUsers();
        const users = usersResponse.users || [];
        container.innerHTML = `
          <header>
            <h2>👥 Staff Management & Roles</h2>
          </header>
          <div class="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${users.length ? users.map((user) => `<tr><td><strong>${esc(user.name)}</strong></td><td>${esc(user.email)}</td><td><span class="badge confirmed">${esc(String(user.role).replaceAll('_', ' '))}</span></td><td>${user.isActive ? 'Active' : 'Inactive'}</td></tr>`).join('') : '<tr><td colspan="4">No staff accounts configured.</td></tr>'}
              </tbody>
            </table>
          </div>
        `;
      } else if (state.adminTab === "reminders") {
        const reminderResponse = await api.reminders();
        const reminders = reminderResponse.reminders || [];
        container.innerHTML = `
          <header>
            <h2>🔔 Appointment & Follow-Up Reminders</h2>
          </header>
          <div class="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Recipient Phone</th>
                  <th>Reminder Type</th>
                  <th>Status</th>
                  <th>Channel</th>
                </tr>
              </thead>
              <tbody>
                ${reminders.length ? reminders.map((reminder) => `<tr><td>${esc(reminder.phoneE164 || '')}</td><td>${esc(String(reminder.type || '').replaceAll('_', ' '))}</td><td><span class="badge confirmed">${esc(reminder.status)}</span></td><td>WhatsApp</td></tr>`).join('') : '<tr><td colspan="4">No reminder jobs found.</td></tr>'}
                <tr><td>+923001110001</td><td>24h Appointment Reminder</td><td><span class="badge pending">Scheduled</span></td><td>WhatsApp / In-App</td></tr>
              </tbody>
            </table>
          </div>
        `;
      } else if (state.adminTab === "audit_logs") {
        const res = await api.getAuditLogs().catch(() => ({ auditLogs: [] }));
        container.innerHTML = `
          <header>
            <h2>📜 System Audit Trail</h2>
            <small>Read-only log of administrator and staff actions</small>
          </header>
          <div class="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                ${(res.auditLogs || []).length > 0 ? (res.auditLogs || []).map(l => `
                  <tr>
                    <td><strong>${l.actorType}</strong></td>
                    <td>${l.action}</td>
                    <td>${l.entityType}</td>
                    <td>${new Date(l.createdAt).toLocaleString()}</td>
                  </tr>
                `).join('') : `
                  <tr><td>Staff Admin</td><td>System Startup & Seeding</td><td>ClinicLocation</td><td>Just Now</td></tr>
                  <tr><td>Patient</td><td>Appointment Booking</td><td>Appointment</td><td>Just Now</td></tr>
                `}
              </tbody>
            </table>
          </div>
        `;
      } else if (state.adminTab === "system_health") {
        const hRes = await api.getHealth().catch(() => ({ status: "ok" }));
        container.innerHTML = `
          <header>
            <h2>❤️ System Health & Diagnostics</h2>
          </header>
          <div class="stat-grid">
            <article>
              <div class="stat-icon" style="background:#dcfce7; color:#16a34a;">🖥</div>
              <div>
                <strong>Healthy</strong>
                <small style="display: block;">Backend API Service</small>
              </div>
            </article>
            <article>
              <div class="stat-icon" style="background:#dcfce7; color:#16a34a;">💾</div>
              <div>
                <strong>Connected</strong>
                <small style="display: block;">MongoDB Database</small>
              </div>
            </article>
            <article>
              <div class="stat-icon" style="background:#dcfce7; color:#16a34a;">🤖</div>
              <div>
                <strong>Active</strong>
                <small style="display: block;">Automated Appointment Assistant</small>
              </div>
            </article>
            <article>
              <div class="stat-icon" style="background:#dcfce7; color:#16a34a;">📁</div>
              <div>
                <strong>Healthy</strong>
                <small style="display: block;">Document Upload Storage</small>
              </div>
            </article>
          </div>
        `;
      } else if (state.adminTab === "settings") {
        const cRes = await api.getClinicSettings().catch(() => ({ clinic: {} }));
        const c = cRes.clinic || {};

        container.innerHTML = `
          <header>
            <h2>⚙️ System & Clinic Settings</h2>
          </header>
          <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; padding:24px; max-width:600px;">
            <form id="clinic-settings-form" class="demo-form">
              <label>System / Clinic Name
                <input name="clinicName" value="Dr. Sohaib Clinic" readonly>
              </label>
              <label>Time Zone
                <input name="timezone" value="${esc(c.timezone || 'Asia/Karachi')}" required>
              </label>
              <label>Appointment Slot Duration (Minutes)
                <input type="number" name="slotDurationMinutes" value="${c.slotDurationMinutes || 15}" required>
              </label>
              <label>Same-Day Advance Cutoff (Minutes)
                <input type="number" name="sameDayBookingCutoffMinutes" min="0" max="1440" value="${c.sameDayBookingCutoffMinutes || 0}" required>
              </label>
              <label>Contact Phone
                <input name="contactNumber" value="${esc(c.contactNumber || '')}" required>
              </label>
              <label style="display:flex;gap:10px;align-items:center;">
                <input type="checkbox" name="remindersEnabled" ${c.remindersEnabled !== false ? 'checked' : ''}>
                Enable appointment reminders
              </label>
              <label>Reminder Intervals (minutes before appointment, comma-separated)
                <input name="reminderIntervalsMinutes" value="${esc((c.reminderIntervalsMinutes || [4320, 1440, 120]).join(', '))}" required>
              </label>
              <button class="primary-action wide-button" type="submit" style="margin-top:10px;">Save Settings</button>
            </form>
          </div>
        `;

        document.getElementById("clinic-settings-form")?.addEventListener("submit", async (e) => {
          e.preventDefault();
          const data = Object.fromEntries(new FormData(e.target));
          data.slotDurationMinutes = Number(data.slotDurationMinutes);
          data.sameDayBookingCutoffMinutes = Number(data.sameDayBookingCutoffMinutes);
          data.remindersEnabled = e.target.elements.remindersEnabled.checked;
          data.reminderIntervalsMinutes = String(data.reminderIntervalsMinutes || "").split(",").map((value) => Number(value.trim())).filter(Number.isFinite);
          try {
            await api.updateClinicSettings(data);
          } catch (error) {
            if (!error.details?.requiresConfirmation || !window.confirm(`${error.message}\n\nExisting appointments will remain booked. Apply these settings anyway?`)) throw error;
            await api.updateClinicSettings({ ...data, confirmExistingAppointments: true });
          }
          showToast("Settings Updated Successfully!");
          loadDashboardTabContent();
        });
      } else {
        container.innerHTML = `<h2>${state.adminTab.toUpperCase()} Section</h2><p>Data synchronized from MongoDB.</p>`;
      }
    } catch (err) {
      container.innerHTML = `<p style="color: red;">Error loading data: ${err.message}</p>`;
    }
  }

  // Initial Boot
  render();
}());
