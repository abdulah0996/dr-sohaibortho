const copy = {
  en: {
    language: "Please select your language.",
    welcome: "Welcome to Dr. Sohaib’s Appointment Assistant.",
    consent: "To arrange your appointment with Dr. Sohaib at Iqbal Hospital Bahawalpur, we will use your details for booking and reminders. Do you agree?",
    location: "Select a clinic location. (Bahawalpur - Iqbal Hospital is active. Bahawalnagar & Rahim Yar Khan are Coming Soon).",
    name: "Please enter the patient's full name.",
    invalidName: "Please enter a valid full name (2–160 characters).",
    reason: "Select a brief consultation reason.",
    date: "Select an available appointment date (Monday to Thursday).",
    time: "Select an available time slot (4:30 PM to 8:30 PM).",
    noAppointment: "No active upcoming appointment was found for this WhatsApp number.",
    staff: "Your message has been sent to Dr. Sohaib's clinic staff. Automated AI responses are now paused.",
    emergency: "EMERGENCY NOTICE: If this is a life-threatening medical emergency, please visit the nearest Emergency Room or call emergency services immediately. An alert has also been raised for Dr. Sohaib's team.",
    error: "We could not complete that request. Please try again or speak to clinic staff."
  },
  ur: {
    language: "براہِ کرم اپنی زبان منتخب کریں۔",
    welcome: "ڈاکٹر صہیب کے اپوائنٹمنٹ اسسٹنٹ میں خوش آمدید۔",
    consent: "ڈاکٹر صہیب کے ساتھ اقبال ہسپتال بہاولپور میں اپوائنٹمنٹ اور ریمائنڈر کے لیے ہم آپ کی معلومات استعمال کریں گے۔ کیا آپ رضامند ہیں؟",
    location: "کلینک کی جگہ منتخب کریں۔ (اقبال ہسپتال بہاولپور فعال ہے۔ بہاولنگر اور رحیم یار خان جلد آرہے ہیں)۔",
    name: "براہِ کرم مریض کا پورا نام درج کریں۔",
    invalidName: "براہِ کرم درست نام درج کریں (2 سے 160 حروف)۔",
    reason: "معائنہ کی وجہ منتخب کریں۔",
    date: "دستیاب تاریخ منتخب کریں (پیر سے جمعرات)۔",
    time: "دستیاب وقت منتخب کریں (شام 4:30 سے رات 8:30)۔",
    noAppointment: "اس واٹس ایپ نمبر پر ڈاکٹر صہیب کے ساتھ کوئی فعال اپوائنٹمنٹ نہیں ملی۔",
    staff: "آپ کا پیغام ڈاکٹر صہیب کے کلینک عملے کو موصول ہو گیا ہے۔ خودکار اے آئی فی الحال روک دی گئی ہے۔",
    emergency: "ہنگامی اطلاع: اگر یہ شدید ایمرجنسی ہے تو فوراً قریبی ہسپتال تشریف لے جائیں۔ ڈاکٹر صہیب کی ٹیم کو بھی الرٹ جاری کر دیا گیا ہے۔",
    error: "درخواست مکمل نہیں ہو سکی۔ براہ کرم دوبارہ کوشش کریں یا عملے سے رابطہ کریں۔"
  }
};

function tr(language, key) {
  return copy[language === "ur" ? "ur" : "en"][key] || copy.en[key] || key;
}

module.exports = { copy, tr };
