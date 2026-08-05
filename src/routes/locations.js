const express = require("express");
const { z } = require("zod");
const { ClinicLocation } = require("../models");
const { listLocations } = require("../services/locationService");
const { requireAuth, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../utils/asyncHandler");
const { badRequest, notFound } = require("../utils/errors");

const router = express.Router();
const schema = z.object({
  clinicName: z.string().min(2).max(160), city: z.string().min(2).max(100),
  code: z.string().regex(/^[A-Za-z0-9]{2,10}$/), fullAddress: z.string().min(2).max(500),
  contactNumber: z.string().max(50).optional(), isActive: z.boolean(), bookingEnabled: z.boolean(),
  timezone: z.string().min(3), slotDurationMinutes: z.number().int().min(5).max(240),
  appointmentFee: z.number().min(0).optional(), displayOrder: z.number().int().optional(),
  weeklyHours: z.array(z.object({ day: z.number().int().min(1).max(7), isOpen: z.boolean(), start: z.string(), end: z.string() }))
});

router.get("/public", asyncHandler(async (req, res) => res.json({ success: true, locations: await listLocations() })));
router.get("/bookable", asyncHandler(async (req, res) => res.json({ success: true, locations: await listLocations({ bookableOnly: true }) })));
router.get("/", requireAuth, asyncHandler(async (req, res) => res.json({ success: true, locations: await listLocations() })));
router.post("/", requireAuth, requireRole("super_admin", "admin"), asyncHandler(async (req, res) => {
  const parsed = schema.safeParse(req.body); if (!parsed.success) throw badRequest("Validation failed", parsed.error.flatten());
  res.status(201).json({ success: true, location: await ClinicLocation.create({ ...parsed.data, code: parsed.data.code.toUpperCase() }) });
}));
router.put("/:id", requireAuth, requireRole("super_admin", "admin"), asyncHandler(async (req, res) => {
  const parsed = schema.partial().safeParse(req.body); if (!parsed.success) throw badRequest("Validation failed", parsed.error.flatten());
  const location = await ClinicLocation.findByIdAndUpdate(req.params.id, { $set: parsed.data }, { new: true, runValidators: true });
  if (!location) throw notFound("Clinic location was not found."); res.json({ success: true, location });
}));

module.exports = router;
