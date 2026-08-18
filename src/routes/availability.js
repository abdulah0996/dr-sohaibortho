const express = require("express");
const { z } = require("zod");
const { ClinicLocation } = require("../models");
const {
  getAvailableSlots,
  getAvailableDates,
  blockDate,
  unblockDate,
  blockSlot,
  unblockSlot
} = require("../services/availabilityService");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");
const { asyncHandler } = require("../utils/asyncHandler");
const { badRequest } = require("../utils/errors");
const { audit } = require("../services/auditService");
const { getLocation } = require("../services/locationService");
const { updateLocation } = require("../services/scheduleService");

const router = express.Router();

function validate(schema, body) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw badRequest("Validation failed", parsed.error.flatten());
  return parsed.data;
}

// GET /api/availability/cities
router.get("/cities", asyncHandler(async (req, res) => {
  const locations = await ClinicLocation.find().sort({ displayOrder: 1 }).lean();
  const cities = locations.map(loc => ({
    city: loc.city,
    clinicName: loc.clinicName,
    code: loc.code,
    status: loc.status,
    address: loc.fullAddress,
    bookingEnabled: loc.status === "Active"
  }));
  res.json({ success: true, cities, locations });
}));

// GET /api/availability/dates
router.get("/dates", asyncHandler(async (req, res) => {
  const input = validate(z.object({
    locationId: z.string().min(2).max(24).optional(),
    days: z.coerce.number().int().min(1).max(60).optional()
  }), req.query);
  res.json({ success: true, dates: await getAvailableDates(input.locationId || "BWP", input.days) });
}));

// GET /api/availability/slots
router.get("/slots", asyncHandler(async (req, res) => {
  const input = validate(z.object({
    locationId: z.string().min(2).max(24).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  }), req.query);
  res.json({ success: true, slots: await getAvailableSlots(input.locationId || "BWP", input.date) });
}));

router.get("/manage/:locationId", requireAuth, requirePermission("availability.manage"), asyncHandler(async (req, res) => {
  const location = await getLocation(String(req.params.locationId).slice(0, 24));
  res.json({ success: true, location });
}));

router.put("/schedule", requireAuth, requirePermission("availability.manage"), asyncHandler(async (req, res) => {
  const input = validate(z.object({
    locationId: z.string().min(2).max(24),
    timezone: z.string().min(3).max(80).optional(),
    slotDurationMinutes: z.coerce.number().int().min(5).max(240).optional(),
    sameDayBookingCutoffMinutes: z.coerce.number().int().min(0).max(1440).optional(),
    weeklyHours: z.array(z.object({
      day: z.coerce.number().int().min(1).max(7),
      isOpen: z.boolean(),
      start: z.string().regex(/^\d{2}:\d{2}$/),
      end: z.string().regex(/^\d{2}:\d{2}$/)
    })).length(7).optional(),
    confirmExistingAppointments: z.boolean().optional()
  }).strict(), req.body);
  const location = await getLocation(input.locationId);
  const result = await updateLocation(location._id, input, { confirmExistingAppointments: input.confirmExistingAppointments === true });
  await audit({ actorType: "staff", action: "availability.schedule_updated", entityType: "location", entityId: String(location._id), req });
  res.json({ success: true, location: result.location, conflictingAppointmentsPreserved: result.conflictingAppointmentsPreserved });
}));

router.post("/block-date", requireAuth, requirePermission("availability.manage"), asyncHandler(async (req, res) => {
  const input = validate(z.object({
    locationId: z.string().min(2),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().min(2).max(500),
    confirmExistingAppointments: z.boolean().optional()
  }).strict(), req.body);
  const blockedDate = await blockDate({ ...input, staffUser: req.user });
  await audit({ actorType: "staff", action: "availability.date_blocked", entityType: "location", entityId: input.locationId, metadata: { date: input.date }, req });
  res.status(201).json({ success: true, blockedDate });
}));

router.post("/unblock-date", requireAuth, requirePermission("availability.manage"), asyncHandler(async (req, res) => {
  const input = validate(z.object({ locationId: z.string().min(2), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict(), req.body);
  const blockedDate = await unblockDate(input.locationId, input.date);
  await audit({ actorType: "staff", action: "availability.date_unblocked", entityType: "location", entityId: input.locationId, metadata: { date: input.date }, req });
  res.json({ success: true, blockedDate });
}));

router.post("/block-slot", requireAuth, requirePermission("availability.manage"), asyncHandler(async (req, res) => {
  const input = validate(z.object({
    locationId: z.string().min(2),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}$/),
    reason: z.string().min(2).max(500),
    confirmExistingAppointments: z.boolean().optional()
  }).strict(), req.body);
  const blockedSlot = await blockSlot({ ...input, staffUser: req.user });
  await audit({ actorType: "staff", action: "availability.slot_blocked", entityType: "location", entityId: input.locationId, metadata: { date: input.date, time: input.time }, req });
  res.status(201).json({ success: true, blockedSlot });
}));

router.post("/unblock-slot", requireAuth, requirePermission("availability.manage"), asyncHandler(async (req, res) => {
  const input = validate(z.object({
    locationId: z.string().min(2),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}$/)
  }).strict(), req.body);
  const blockedSlot = await unblockSlot(input.locationId, input.date, input.time);
  await audit({ actorType: "staff", action: "availability.slot_unblocked", entityType: "location", entityId: input.locationId, metadata: { date: input.date, time: input.time }, req });
  res.json({ success: true, blockedSlot });
}));

module.exports = router;
