const { DateTime } = require("luxon");
const { config } = require("../config/env");
const { normalizeTime } = require("../utils/time");

const EMERGENCY_RE = /\b(chest pain|major bleeding|heavy bleeding|severe breathing|severe pain|can(?:not|'t) breathe|unconscious|not breathing|heart attack|stroke)\b|سینے.{0,8}درد|شدید.{0,8}درد|خون.{0,8}(بہہ|بہت)|سانس.{0,8}(نہیں|مشکل)|بے ?ہوش/i;
const MEDICATION_RE = /\b(prescribe|prescription|medicine|medication|dose|dosage|tablet|dawai|dawa)\b|دوائی|دوا/i;
const DIAGNOSIS_RE = /\b(diagnos|what disease|what is wrong|report.{0,15}(mean|interpret|explain|summar))\b|رپورٹ.{0,12}(سمجھ|بتا)|بیماری.{0,8}(کیا|بتا)/i;

function futureDateForWeekday(name, now) {
  const weekdays = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7 };
  const target = weekdays[name.toLowerCase()];
  if (!target) return null;
  let days = (target - now.weekday + 7) % 7;
  if (days === 0) days = 7;
  return now.plus({ days }).toISODate();
}

function parseDate(text, reference = DateTime.now().setZone(config.clinicTimezone)) {
  const value = String(text || "").trim();
  const iso = value.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
  if (iso && DateTime.fromISO(iso).isValid) return iso;
  if (/\b(day after tomorrow|parson|parso)\b|پرسوں/i.test(value)) return reference.plus({ days: 2 }).toISODate();
  if (/\b(tomorrow|kal)\b|کل/i.test(value)) return reference.plus({ days: 1 }).toISODate();
  if (/\btoday\b|آج|\baaj\b/i.test(value)) return reference.toISODate();
  const weekday = value.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i)?.[1];
  return weekday ? futureDateForWeekday(weekday, reference) : null;
}

function parseTime(text) {
  const value = String(text || "");
  const matches = [...value.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.?m\.?|p\.?m\.?|baje|بجے)?\b/gi)];
  const match = matches.find((candidate) => {
    const hour = Number(candidate[1]);
    const before = value.slice(Math.max(0, candidate.index - 12), candidate.index);
    const beforeChar = value[candidate.index - 1] || "";
    const afterChar = value[candidate.index + candidate[0].length] || "";
    return hour <= 23 && beforeChar !== "-" && afterChar !== "-" && !/(?:age|aged|umar|ki age)\s*$/i.test(before);
  });
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const marker = String(match[3] || "").toLowerCase();
  const evening = /\b(pm|p\.m\.|evening|shaam|sham)\b|شام/i.test(value);
  if ((marker.includes("pm") || marker.includes("p.m") || evening || (!/am|a\.m/i.test(marker) && hour >= 1 && hour <= 8)) && hour < 12) hour += 12;
  const normalized = normalizeTime(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
  return normalized || null;
}

function relationship(text) {
  if (/\b(mother|mom|ammi|ami|walida)\b|والدہ|امی/i.test(text)) return "mother";
  if (/\b(father|dad|abbu|walid)\b|والد|ابو/i.test(text)) return "father";
  if (/\b(wife|biwi)\b|بیوی/i.test(text)) return "wife";
  if (/\b(husband|shohar)\b|شوہر/i.test(text)) return "husband";
  if (/\b(son|beta)\b|بیٹا/i.test(text)) return "son";
  if (/\b(daughter|beti)\b|بیٹی/i.test(text)) return "daughter";
  return "self";
}

function extractName(text, relation) {
  const value = String(text || "");
  const patterns = relation === "self"
    ? [/\b(?:i am|my name is|patient is)\s+([a-z][a-z .'-]{1,70}?)(?=\s+(?:age|aged|ko|needs?|has|for|on|at)\b|[,.]|$)/i]
    : [/\b(?:mother|mom|ammi|ami|walida|father|dad|abbu|wife|biwi|husband|son|daughter)\s+(?:is\s+|ka naam\s+|ki\s+)?([a-z][a-z .'-]{1,70}?)(?=\s+(?:age|aged|ki age|ko|needs?|has|for|on|at)\b|[,.]|$)/i];
  for (const pattern of patterns) {
    const found = value.match(pattern)?.[1]?.trim();
    if (found) return found.replace(/\s+/g, " ");
  }
  return null;
}

function inferIntent(text) {
  if (EMERGENCY_RE.test(text)) return "emergency";
  if (/\b(human|person|reception|receptionist|staff|agent|talk to someone)\b|انسان|ریسپشن/i.test(text)) return "handoff";
  if (/\b(cancel|cancellation|cancel kar|mansookh)\b|منسوخ/i.test(text)) return "cancel";
  if (/\b(reschedul(?:e|ing)?|shift|move|change.{0,12}(appointment|time)|waqt badal)\b|وقت.{0,8}بدل/i.test(text)) return "reschedule";
  if (/\b(location|lokation|address|direction|clinic kahan|hospital kahan)\b|پتہ|لوکیشن/i.test(text)) return "clinic_info";
  if (/\b(queue|token|visit status|appointment status|kitni dair|delay)\b|کتنی دیر|ٹوکن/i.test(text)) return "visit_status";
  if (MEDICATION_RE.test(text) || DIAGNOSIS_RE.test(text)) return "medical_advice";
  if (/\b(appointment|apointment|appoinment|appointmnt|book|follow[- ]?up|dikhana|checkup|consult)\b|اپائنٹمنٹ|دکھانا|معائنہ/i.test(text)) return "booking";
  if (/^(hi|hello|hey|salam|assalam|aoa|السلام)/i.test(String(text).trim())) return "greeting";
  return "unknown";
}

function extractConcern(text) {
  const value = String(text || "");
  if (/\breports? (?:are )?ready\b.*\bfollow[- ]?up\b/i.test(value)) return "Follow-up with previous reports";
  const roman = value.match(/\b(?:mujhe|unko|isko|patient ko)\s+(.{3,160}?)\s+(?:hai|hain)\b/i)?.[1];
  if (roman && !/appointment|dikhana|chahiye/i.test(roman)) return roman.trim();
  const english = value.match(/\b(?:has|have|having|with)\s+(.{3,160}?)(?=\s+(?:and|on|at|for)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|\d)|[,.]|$)/i)?.[1];
  if (english) return english.trim();
  const symptom = value.match(/\b((?:(?:for|since|from)\s+[^,.]{1,40}\s+)?(?:stomach|chest|back|knee|shoulder|joint|bone|neck|abdominal)\s+(?:pain|ache)|fever|injury|fracture|follow[- ]?up)\b/i)?.[1];
  return symptom?.trim() || null;
}

function fallbackInterpret(text) {
  const value = String(text || "").slice(0, 2000);
  const relation = relationship(value);
  const ageMatch = value.match(/\b(?:age|aged|umar|ki age)\s*(?:is\s*)?(\d{1,3})\b|\b(\d{1,3})\s*(?:years? old|saal)\b/i);
  const appointmentId = value.match(/\bDS-20\d{2}-\d{4,}\b/i)?.[0]?.toUpperCase() || null;
  const reportsAvailable = /\b(reports? (?:are )?ready|reports? available|report hai|reports hain)\b|رپورٹ.{0,8}(تیار|ہے|ہیں)/i.test(value) ? true : null;
  return {
    intent: inferIntent(value),
    language: /[\u0600-\u06ff]/.test(value) ? "ur" : (/\b(meri|mera|ko|chahiye|karni|kar dein|baje|kal|dikhana|hai)\b/i.test(value) ? "roman_ur" : "en"),
    confidence: 0.62,
    patient_relationship: relation,
    patient_name: extractName(value, relation),
    age: Number(ageMatch?.[1] || ageMatch?.[2]) || null,
    concern: extractConcern(value),
    preferred_clinic: /iqbal/i.test(value) ? "BWP" : null,
    preferred_date: parseDate(value),
    preferred_time: parseTime(value),
    appointment_id: appointmentId,
    reports_available: reportsAvailable,
    safety: EMERGENCY_RE.test(value) ? "emergency" : (MEDICATION_RE.test(value) ? "medication" : (DIAGNOSIS_RE.test(value) ? "diagnosis" : "none"))
  };
}

module.exports = { EMERGENCY_RE, fallbackInterpret, inferIntent, parseDate, parseTime };
