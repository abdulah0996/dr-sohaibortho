const { DateTime } = require("luxon");
const { config } = require("../config/env");
const { tr } = require("./translations");

// WhatsApp Cloud API interactive limits.
const LIST_MAX_ROWS = 10;
const ROW_TITLE_MAX = 24;
const ROW_DESC_MAX = 72;

function buttons(body, options) {
  return { kind: "buttons", body, buttons: options.slice(0, 3) };
}

// "16:30" -> "4:30 PM" so patients read a familiar clock, while the row id keeps HH:mm.
function displayTime(time) {
  const [rawHour, rawMinute] = String(time || "").split(":");
  const hour = Number(rawHour);
  if (!Number.isInteger(hour)) return String(time || "");
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${rawMinute} ${suffix}`;
}

// "2026-08-25" -> "Today" / "Tomorrow" / "Mon, 25 Aug" in the patient's language.
function displayDate(date, language = "en", timezone = config.clinicTimezone) {
  const lang = language === "ur" ? "ur" : "en";
  const parsed = DateTime.fromISO(String(date || ""), { zone: timezone });
  if (!parsed.isValid) return String(date || "");
  const today = DateTime.now().setZone(timezone).startOf("day");
  const days = Math.round(parsed.startOf("day").diff(today, "days").days);
  if (days === 0) return tr(lang, "dateToday");
  if (days === 1) return tr(lang, "dateTomorrow");
  const weekday = tr(lang, "weekdayShort").split(",")[parsed.weekday - 1] || "";
  const month = tr(lang, "monthShort").split(",")[parsed.month - 1] || "";
  return `${weekday}, ${parsed.day} ${month}`;
}

function list(body, rows, buttonText = "Select", sectionTitle = "Options") {
  return {
    kind: "list",
    body,
    buttonText: String(buttonText).slice(0, 20),
    sections: [{ title: String(sectionTitle).slice(0, 24), rows: rows.slice(0, 10) }]
  };
}

function text(body) {
  return { kind: "text", body };
}

function languageMessage() {
  return buttons(
    "🌐 *Language Selection / زبان کا انتخاب*\n\nPlease select your preferred language:\nبراہِ کرم اپنی پسندیدہ زبان منتخب کریں:",
    [
      { id: "LANG_EN", title: "🌐 English" },
      { id: "LANG_UR", title: "🌐 اردو" }
    ]
  );
}

function mainMenu(language = "en") {
  const lang = language === "ur" ? "ur" : "en";
  const rows = [
    {
      id: "MENU_BOOK",
      title: tr(lang, "menuBook").slice(0, 24),
      description: tr(lang, "menuBookDesc").slice(0, 72)
    },
    {
      id: "MENU_ASSESS",
      title: tr(lang, "menuAssess").slice(0, 24),
      description: tr(lang, "menuAssessDesc").slice(0, 72)
    },
    {
      id: "MENU_SERVICES",
      title: tr(lang, "menuServices").slice(0, 24),
      description: tr(lang, "menuServicesDesc").slice(0, 72)
    },
    {
      id: "MENU_UPLOAD",
      title: tr(lang, "menuUpload").slice(0, 24),
      description: tr(lang, "menuUploadDesc").slice(0, 72)
    },
    {
      id: "MENU_ABOUT",
      title: tr(lang, "menuAbout").slice(0, 24),
      description: tr(lang, "menuAboutDesc").slice(0, 72)
    },
    {
      id: "MENU_CLINIC",
      title: tr(lang, "menuClinic").slice(0, 24),
      description: tr(lang, "menuClinicDesc").slice(0, 72)
    },
    {
      id: "MENU_CHECK",
      title: tr(lang, "menuCheck").slice(0, 24),
      description: tr(lang, "menuCheckDesc").slice(0, 72)
    },
    {
      id: "MENU_RESCHEDULE",
      title: tr(lang, "menuReschedule").slice(0, 24),
      description: tr(lang, "menuRescheduleDesc").slice(0, 72)
    },
    {
      id: "MENU_STAFF",
      title: tr(lang, "menuStaff").slice(0, 24),
      description: tr(lang, "menuStaffDesc").slice(0, 72)
    },
    {
      id: "MENU_LANG",
      title: tr(lang, "menuLang").slice(0, 24),
      description: tr(lang, "menuLangDesc").slice(0, 72)
    }
  ];

  return list(
    tr(lang, "welcome"),
    rows,
    tr(lang, "openMenuButton"),
    lang === "ur" ? "کلینک مینو" : "Clinic Menu"
  );
}

function doctorProfileCard(language = "en") {
  const lang = language === "ur" ? "ur" : "en";
  return buttons(
    tr(lang, "doctorCardBody"),
    [
      { id: "MENU_BOOK", title: tr(lang, "menuBook").slice(0, 20) },
      { id: "MENU_SERVICES", title: tr(lang, "menuServices").slice(0, 20) },
      { id: "NAV_MAIN_MENU", title: tr(lang, "btnMainMenu").slice(0, 20) }
    ]
  );
}

function clinicInfoCard(language = "en") {
  const lang = language === "ur" ? "ur" : "en";
  return buttons(
    tr(lang, "clinicCardBody"),
    [
      { id: "MENU_BOOK", title: tr(lang, "menuBook").slice(0, 20) },
      { id: "MENU_STAFF", title: tr(lang, "menuStaff").slice(0, 20) },
      { id: "NAV_MAIN_MENU", title: tr(lang, "btnMainMenu").slice(0, 20) }
    ]
  );
}

function servicesCard(language = "en") {
  const lang = language === "ur" ? "ur" : "en";
  return buttons(
    tr(lang, "servicesBody"),
    [
      { id: "MENU_BOOK", title: tr(lang, "menuBook").slice(0, 20) },
      { id: "MENU_ABOUT", title: tr(lang, "menuAbout").slice(0, 20) },
      { id: "NAV_MAIN_MENU", title: tr(lang, "btnMainMenu").slice(0, 20) }
    ]
  );
}

// Dates come from the existing availability engine; this only presents them.
function dateList(language = "en", dates = []) {
  const lang = language === "ur" ? "ur" : "en";
  const rows = dates.slice(0, LIST_MAX_ROWS).map((entry) => {
    const count = Number(entry.availableSlots) || 0;
    const description = count === 1
      ? tr(lang, "slotsLeftOne")
      : tr(lang, "slotsLeftMany", { count });
    return {
      id: `AI_DATE_${entry.date}`,
      title: displayDate(entry.date, lang).slice(0, ROW_TITLE_MAX),
      description: description.slice(0, ROW_DESC_MAX)
    };
  });
  return list(tr(lang, "bookStep5Date"), rows, tr(lang, "pickDateButton"), tr(lang, "sectionDates"));
}

// Slots come from the existing availability engine; this only presents them.
function timeList(language = "en", date = "", slots = [], idPrefix = "AI_TIME_") {
  const lang = language === "ur" ? "ur" : "en";
  const rows = slots.slice(0, LIST_MAX_ROWS).map((slot) => ({
    id: `${idPrefix}${slot.time}`,
    title: `🕒 ${displayTime(slot.time)}`.slice(0, ROW_TITLE_MAX),
    description: tr(lang, "summaryDuration").slice(0, ROW_DESC_MAX)
  }));
  return list(
    tr(lang, "bookStep6Time", { date: displayDate(date, lang) }),
    rows,
    tr(lang, "pickTimeButton"),
    tr(lang, "sectionTimes")
  );
}

const CONCERN_OPTIONS = ["Fracture", "Joint", "Spine", "Sports", "Child", "FollowUp", "Other"];

// Lets patients tap a concern instead of typing one; "Other" still accepts free text.
function concernList(language = "en") {
  const lang = language === "ur" ? "ur" : "en";
  const rows = CONCERN_OPTIONS.map((key) => ({
    id: `AI_CONCERN_${key.toUpperCase()}`,
    title: tr(lang, `concern${key}`).slice(0, ROW_TITLE_MAX)
  }));
  return list(tr(lang, "bookStep3Concern"), rows, tr(lang, "pickConcernButton"), tr(lang, "sectionConcerns"));
}

module.exports = {
  buttons,
  list,
  text,
  languageMessage,
  mainMenu,
  doctorProfileCard,
  clinicInfoCard,
  servicesCard,
  dateList,
  timeList,
  concernList,
  displayTime,
  displayDate,
  CONCERN_OPTIONS
};
