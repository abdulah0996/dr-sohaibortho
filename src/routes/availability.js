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
const { asyncHandler } = require("../utils/asyncHandler");
const { badRequest } = require("../utils/errors");

const router = express.Router();

function validate(schema, body) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw badRequest("Validation failed", parsed.error.flatten());
  return parsed.data;
}

// GET /api/availability/cities
router.get("/cities", asyncHandler(async (req, res) => {
  const locations = await ClinicLocation.find({ isActive: true }).sort({ displayOrder: 1 }).lean();
  const cities = locations.map(loc => ({
    city: loc.city,
    clinicName: loc.clinicName,
    code: loc.code,
    status: loc.bookingEnabled ? "Active" : "Coming Soon",
    address: loc.fullAddress,
    bookingEnabled: loc.bookingEnabled
  }));
  res.json({ success: true, cities, locations });
}));

// GET /api/availability/dates
router.get("/dates", asyncHandler(async (req, res) => {
  const locationId = req.query.locationId || "BWP";
  res.json({ success: true, dates: await getAvailableDates(locationId, req.query.days) });
}));

// GET /api/availability/slots
router.get("/slots", asyncHandler(async (req, res) => {
  const locationId = req.query.locationId || "BWP";
  if (!req.query.date) throw badRequest("date query parameter is required.");
  res.json({ success: true, slots: await getAvailableSlots(locationId, req.query.date) });
}));

router.post("/block-date", requireAuth, asyncHandler(async (req, res) => {
  const input = validate(z.object({
    locationId: z.string().min(2),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().max(500).optional()
  }), req.body);
  const blockedDate = await blockDate({ ...input, staffUser: req.user });
  res.status(201).json({ success: true, blockedDate });
}));

router.post("/unblock-date", requireAuth, asyncHandler(async (req, res) => {
  const input = validate(z.object({ locationId: z.string().min(2), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), req.body);
  const blockedDate = await unblockDate(input.locationId, input.date);
  res.json({ success: true, blockedDate });
}));

router.post("/block-slot", requireAuth, asyncHandler(async (req, res) => {
  const input = validate(z.object({
    locationId: z.string().min(2),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}$/),
    reason: z.string().max(500).optional()
  }), req.body);
  const blockedSlot = await blockSlot({ ...input, staffUser: req.user });
  res.status(201).json({ success: true, blockedSlot });
}));

router.post("/unblock-slot", requireAuth, asyncHandler(async (req, res) => {
  const input = validate(z.object({
    locationId: z.string().min(2),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}$/)
  }), req.body);
  const blockedSlot = await unblockSlot(input.locationId, input.date, input.time);
  res.json({ success: true, blockedSlot });
}));

module.exports = router;
