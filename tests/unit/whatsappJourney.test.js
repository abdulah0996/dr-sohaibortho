const test = require("node:test");
const assert = require("node:assert/strict");
const { DateTime } = require("luxon");

process.env.NODE_ENV = "test";

const { createConversationOrchestrator } = require("../../src/conversation/orchestrator");
const { mainMenu, doctorProfileCard, clinicInfoCard, displayTime, displayDate } = require("../../src/conversation/messages");
const { copy } = require("../../src/conversation/translations");

// WhatsApp Cloud API interactive limits.
const LIST_MAX_ROWS = 10;
const ROW_TITLE_MAX = 24;
const ROW_DESC_MAX = 72;
const BUTTON_TEXT_MAX = 20;

const CLINIC = [{ _id: "clinic-1", code: "BWP", clinicName: "Iqbal Hospital", city: "Bahawalpur", status: "Active" }];

function memorySessions() {
  const records = new Map();
  return {
    findOne: async ({ phoneE164 }) => records.get(phoneE164) || null,
    create: async (value) => {
      const record = { _id: `session-${records.size + 1}`, ...value, async save() { records.set(this.phoneE164, this); return this; } };
      records.set(record.phoneE164, record);
      return record;
    }
  };
}

function futureDates(count) {
  const today = DateTime.now().setZone("Asia/Karachi").startOf("day");
  return Array.from({ length: count }, (_, index) => ({
    date: today.plus({ days: index + 1 }).toISODate(),
    availableSlots: 12
  }));
}

// Mon-Thu 16:30-20:30 at 20-minute spacing is 12 real slots.
function twelveSlots() {
  return Array.from({ length: 12 }, (_, index) => {
    const minutes = 16 * 60 + 30 + index * 20;
    return { time: `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}` };
  });
}

function orchestratorWith({ dates = futureDates(12), slots = twelveSlots(), understand } = {}) {
  return createConversationOrchestrator({
    models: { ConversationSession: memorySessions(), Appointment: { countDocuments: async () => 2 } },
    tools: {
      get_clinic_information: async () => CLINIC,
      get_available_dates: async () => dates,
      get_available_slots: async () => slots,
      create_appointment: async () => ({ appointmentId: "DS-2026-1234", tokenNumber: "007", patient: "p1", async save() { return this; } }),
      request_staff_handoff: async () => undefined
    },
    understand: understand || (async () => ({
      intent: "book", language: "en", patientFor: "self", patientName: null, age: null,
      concern: null, clinic: null, preferredDate: null, preferredTime: null,
      appointmentId: null, reportsAvailable: null, confidence: 0.9
    }))
  });
}

function assertWhatsAppListLimits(message) {
  assert.equal(message.kind, "list");
  assert.ok(message.buttonText.length <= BUTTON_TEXT_MAX, `button text too long: ${message.buttonText}`);
  for (const section of message.sections) {
    assert.ok(section.rows.length <= LIST_MAX_ROWS, `too many rows: ${section.rows.length}`);
    for (const row of section.rows) {
      assert.ok(row.title.length <= ROW_TITLE_MAX, `row title too long: ${row.title}`);
      if (row.description) assert.ok(row.description.length <= ROW_DESC_MAX, `row description too long: ${row.description}`);
    }
  }
}

test("the main menu is a WhatsApp interactive list in both languages and respects Meta limits", () => {
  for (const lang of ["en", "ur"]) {
    const menu = mainMenu(lang);
    assertWhatsAppListLimits(menu);
    assert.equal(menu.sections[0].rows[0].id, "MENU_BOOK");
    const ids = menu.sections[0].rows.map((row) => row.id);
    for (const required of ["MENU_BOOK", "MENU_ABOUT", "MENU_CLINIC", "MENU_STAFF", "MENU_LANG"]) {
      assert.ok(ids.includes(required), `${lang} menu missing ${required}`);
    }
  }
});

test("booking opens with a tappable date list built from the availability engine", async () => {
  const handle = orchestratorWith();
  const reply = await handle({ phoneE164: "+923001234567", text: "Book", replyId: "MENU_BOOK" });
  assertWhatsAppListLimits(reply);
  const rows = reply.sections[0].rows;
  assert.equal(rows.length, LIST_MAX_ROWS, "12 open dates must be capped at the WhatsApp maximum of 10");
  assert.ok(rows.every((row) => /^AI_DATE_\d{4}-\d{2}-\d{2}$/.test(row.id)));
  assert.match(rows[0].description, /slots available/i);
});

test("choosing a date offers every real 20-minute slot as a list, not three buttons", async () => {
  const handle = orchestratorWith();
  const phoneE164 = "+923001234567";
  const dateReply = await handle({ phoneE164, text: "Book", replyId: "MENU_BOOK" });
  const dateId = dateReply.sections[0].rows[0].id;

  const timeReply = await handle({ phoneE164, text: "Date", replyId: dateId });
  assertWhatsAppListLimits(timeReply);
  const rows = timeReply.sections[0].rows;
  assert.equal(rows.length, LIST_MAX_ROWS);
  assert.equal(rows[0].id, "AI_TIME_16:30");
  assert.match(rows[0].title, /4:30 PM/);
  assert.match(rows[0].description, /20 min/i);
});

test("a date or time that was never offered is refused and re-prompted, never booked", async () => {
  const handle = orchestratorWith();
  const phoneE164 = "+923001234567";
  await handle({ phoneE164, text: "Book", replyId: "MENU_BOOK" });

  const forgedDate = await handle({ phoneE164, text: "Date", replyId: "AI_DATE_1999-01-01" });
  assert.equal(forgedDate.kind, "list");
  assert.ok(forgedDate.sections[0].rows.every((row) => row.id.startsWith("AI_DATE_")));

  const realDate = (await handle({ phoneE164, text: "Book", replyId: "MENU_BOOK" })).sections[0].rows[0].id;
  await handle({ phoneE164, text: "Date", replyId: realDate });
  const forgedTime = await handle({ phoneE164, text: "Time", replyId: "AI_TIME_03:00" });
  assert.equal(forgedTime.kind, "list");
  assert.ok(forgedTime.sections[0].rows.every((row) => row.id.startsWith("AI_TIME_")));
});

test("the patient taps a concern instead of typing one, and Something Else still accepts free text", async () => {
  const handle = orchestratorWith();
  const phoneE164 = "+923001234567";
  const dateId = (await handle({ phoneE164, text: "Book", replyId: "MENU_BOOK" })).sections[0].rows[0].id;
  const timeId = (await handle({ phoneE164, text: "Date", replyId: dateId })).sections[0].rows[0].id;
  await handle({ phoneE164, text: "Time", replyId: timeId });
  const concernPrompt = await handle({ phoneE164, text: "Ali Raza" });

  assertWhatsAppListLimits(concernPrompt);
  const ids = concernPrompt.sections[0].rows.map((row) => row.id);
  assert.ok(ids.includes("AI_CONCERN_JOINT"));
  assert.ok(ids.includes("AI_CONCERN_OTHER"));

  const reports = await handle({ phoneE164, text: "Joint", replyId: "AI_CONCERN_JOINT" });
  assert.equal(reports.buttons[0].id, "AI_REPORTS_YES");

  const other = orchestratorWith();
  const otherDate = (await other({ phoneE164, text: "Book", replyId: "MENU_BOOK" })).sections[0].rows[0].id;
  const otherTime = (await other({ phoneE164, text: "Date", replyId: otherDate })).sections[0].rows[0].id;
  await other({ phoneE164, text: "Time", replyId: otherTime });
  await other({ phoneE164, text: "Ali Raza" });
  const typed = await other({ phoneE164, text: "Other", replyId: "AI_CONCERN_OTHER" });
  assert.equal(typed.kind, "text");
  assert.match(typed.body, /describe/i);
});

test("selecting Urdu keeps the whole booking journey in Urdu", async () => {
  const handle = orchestratorWith();
  const phoneE164 = "+923001234567";
  const menu = await handle({ phoneE164, text: "Urdu", replyId: "LANG_UR" });
  assert.match(menu.body, /السلام علیکم/);

  const dateReply = await handle({ phoneE164, text: "Book", replyId: "MENU_BOOK" });
  assert.match(dateReply.body, /تاریخ/);
  assert.equal(dateReply.buttonText, copy.ur.pickDateButton);
  assert.equal(dateReply.sections[0].title, copy.ur.sectionDates);

  const timeReply = await handle({ phoneE164, text: "Date", replyId: dateReply.sections[0].rows[0].id });
  assert.match(timeReply.body, /وقت/);
  assert.equal(timeReply.buttonText, copy.ur.pickTimeButton);

  const namePrompt = await handle({ phoneE164, text: "Time", replyId: timeReply.sections[0].rows[0].id });
  assert.match(namePrompt.body, /نام/);

  const concernPrompt = await handle({ phoneE164, text: "عاصمہ بی بی" });
  assert.equal(concernPrompt.sections[0].title, copy.ur.sectionConcerns);
});

test("Roman Urdu and Urdu date words still reach the slot picker", async () => {
  for (const phrase of ["kal", "آج"]) {
    const handle = orchestratorWith({
      understand: async () => ({
        intent: "book", language: "roman_ur", patientFor: "self", patientName: null, age: null,
        concern: null, clinic: null, preferredDate: phrase, preferredTime: null,
        appointmentId: null, reportsAvailable: null, confidence: 0.9
      })
    });
    const reply = await handle({ phoneE164: "+923001234567", text: `Mujhe ${phrase} appointment chahiye` });
    assert.equal(reply.kind, "list", `"${phrase}" should resolve to a date and offer times`);
    assert.ok(reply.sections[0].rows.every((row) => row.id.startsWith("AI_TIME_")));
  }
});

test("clinic and doctor cards state the authoritative clinic facts in both languages", () => {
  const en = `${doctorProfileCard("en").body}\n${clinicInfoCard("en").body}\n${copy.en.welcome}\n${copy.en.confirmedBody}`;
  assert.match(en, /Dr\. Shoaib/);
  assert.match(en, /Iqbal Hospital/);
  assert.match(en, /Noor Mahal Road/);
  assert.match(en, /Bahawalpur/);
  assert.match(en, /4:30 PM\s*[–-]\s*8:30 PM/);
  assert.match(en, /8:00 PM\s*[–-]\s*9:00 PM/);
  assert.match(en, /20 minutes/);

  const ur = `${doctorProfileCard("ur").body}\n${clinicInfoCard("ur").body}\n${copy.ur.welcome}`;
  assert.match(ur, /ڈاکٹر شعیب/);
  assert.match(ur, /اقبال ہسپتال/);
  assert.match(ur, /نور محل روڈ/);
  assert.match(ur, /بہاولپور/);
  assert.match(ur, /4:30/);
  assert.match(ur, /8:30/);
  assert.match(ur, /20 منٹ/);
});

test("no patient-facing copy advertises the wrong clinic hours", () => {
  for (const lang of ["en", "ur"]) {
    const all = Object.values(copy[lang]).join("\n");
    assert.doesNotMatch(all, /9:00 AM/i, `${lang} copy must not advertise a 9:00 AM opening`);
    assert.doesNotMatch(all, /5:00 PM/i, `${lang} copy must not advertise a 5:00 PM closing`);
  }
});

test("times read as a familiar clock and dates read as Today/Tomorrow", () => {
  assert.equal(displayTime("16:30"), "4:30 PM");
  assert.equal(displayTime("20:10"), "8:10 PM");
  assert.equal(displayTime("09:00"), "9:00 AM");
  assert.equal(displayTime("12:00"), "12:00 PM");

  const today = DateTime.now().setZone("Asia/Karachi").startOf("day");
  assert.equal(displayDate(today.toISODate(), "en"), "Today");
  assert.equal(displayDate(today.plus({ days: 1 }).toISODate(), "en"), "Tomorrow");
  assert.equal(displayDate(today.toISODate(), "ur"), "آج");
  assert.match(displayDate(today.plus({ days: 5 }).toISODate(), "en"), /^[A-Z][a-z]{2}, \d{1,2} [A-Z][a-z]{2}$/);
});

test("English and Urdu translation tables stay in full key parity", () => {
  const en = Object.keys(copy.en).sort();
  const ur = Object.keys(copy.ur).sort();
  assert.deepEqual(ur, en, "every English key must have an Urdu counterpart");
  for (const key of en) {
    assert.ok(String(copy.ur[key] || "").trim().length > 0, `Urdu copy missing for ${key}`);
  }
});
