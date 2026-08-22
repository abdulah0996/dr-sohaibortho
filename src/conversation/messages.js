const { DateTime } = require("luxon");
const { config } = require("../config/env");
const { tr } = require("./translations");

// WhatsApp Cloud API interactive limits.
const LIST_MAX_ROWS = 10;
const ROW_TITLE_MAX = 24;
const ROW_DESC_MAX = 72;
const BUTTON_TEXT_MAX = 20;
const SECTION_TITLE_MAX = 24;

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

// Single source of truth for the approved menu. Ordering here drives the
// interactive list, the plain-text fallback and the numeric fallback routing,
// so the three can never drift apart.
const MAIN_MENU_PRIMARY = [
  { id: "MENU_BOOK", key: "menuBook" },
  { id: "MENU_ASSESS", key: "menuAssess" },
  { id: "MENU_SERVICES", key: "menuServices" },
  { id: "MENU_UPLOAD", key: "menuUpload" },
  { id: "MENU_ABOUT", key: "menuAbout" },
  { id: "MENU_CLINIC", key: "menuClinic" },
  { id: "MENU_STAFF", key: "menuStaff" },
  { id: "MENU_LANG", key: "menuLang" }
];

const MAIN_MENU_APPOINTMENT = [
  { id: "MENU_CHECK", key: "menuCheck" },
  { id: "MENU_RESCHEDULE", key: "menuReschedule" }
];

const MAIN_MENU_ORDER = [...MAIN_MENU_PRIMARY, ...MAIN_MENU_APPOINTMENT];

function menuRow(lang, item) {
  return {
    id: item.id,
    title: tr(lang, item.key).slice(0, ROW_TITLE_MAX),
    description: tr(lang, `${item.key}Desc`).slice(0, ROW_DESC_MAX)
  };
}

function mainMenu(language = "en") {
  const lang = language === "ur" ? "ur" : "en";
  return {
    kind: "list",
    body: tr(lang, "welcome"),
    buttonText: tr(lang, "openMenuButton").slice(0, BUTTON_TEXT_MAX),
    sections: [
      {
        title: tr(lang, "menuSectionMain").slice(0, SECTION_TITLE_MAX),
        rows: MAIN_MENU_PRIMARY.map((item) => menuRow(lang, item))
      },
      {
        title: tr(lang, "menuSectionAppointment").slice(0, SECTION_TITLE_MAX),
        rows: MAIN_MENU_APPOINTMENT.map((item) => menuRow(lang, item))
      }
    ]
  };
}

// Used only when WhatsApp rejects an interactive list, so the patient is never
// left without a usable reply. Rows are read back off the message that failed,
// which keeps the fallback ordering identical to the interactive one.
function listFallbackText(message, language = "en") {
  const lang = language === "ur" ? "ur" : "en";
  const rows = (message?.sections || []).flatMap((section) => section.rows || []);
  const lines = rows.map((row, index) => `${index + 1}. ${row.title}`);
  return text(`${message?.body || ""}\n\n${tr(lang, "menuFallbackIntro")}\n\n${lines.join("\n")}\n\n${tr(lang, "menuFallbackHint")}`);
}

function mainMenuFallbackText(language = "en") {
  return listFallbackText(mainMenu(language), language);
}

// Maps a bare "3" from the text fallback back to its stable menu id.
function menuIdFromNumber(value) {
  const index = Number(String(value || "").trim());
  if (!Number.isInteger(index) || index < 1 || index > MAIN_MENU_ORDER.length) return "";
  return MAIN_MENU_ORDER[index - 1].id;
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
  mainMenuFallbackText,
  listFallbackText,
  menuIdFromNumber,
  CONCERN_OPTIONS,
  MAIN_MENU_PRIMARY,
  MAIN_MENU_APPOINTMENT,
  MAIN_MENU_ORDER
};
