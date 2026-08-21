const { tr } = require("./translations");

function buttons(body, options) {
  return { kind: "buttons", body, buttons: options.slice(0, 3) };
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

module.exports = {
  buttons,
  list,
  text,
  languageMessage,
  mainMenu,
  doctorProfileCard,
  clinicInfoCard,
  servicesCard
};
