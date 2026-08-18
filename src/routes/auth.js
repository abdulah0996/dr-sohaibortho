const express = require("express");
const { z } = require("zod");
const {
  login,
  refresh,
  logout,
  publicStaffUser,
  createStaffUser,
  listStaffUsers,
  updateStaffUser
} = require("../services/authService");
const { audit } = require("../services/auditService");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");
const { authLimiter } = require("../middleware/security");
const { requireObjectIdParam } = require("../middleware/validation");
const { asyncHandler } = require("../utils/asyncHandler");
const { badRequest } = require("../utils/errors");

const router = express.Router();

function validate(schema, body) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw badRequest("Validation failed", parsed.error.flatten());
  return parsed.data;
}

const staffSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  role: z.enum(["super_admin", "doctor", "receptionist", "clinic_staff"]).optional()
});

router.post("/login", authLimiter, asyncHandler(async (req, res) => {
  const input = validate(z.object({
    email: z.string().email(),
    password: z.string().min(1)
  }), req.body);
  let result;
  try {
    result = await login(input, req, res);
  } catch (error) {
    await audit({
      actorType: "system",
      action: error.code === "FORBIDDEN" ? "staff.login_locked" : "staff.login_failed",
      entityType: "staff",
      metadata: { outcome: "denied" },
      req
    });
    throw error;
  }
  await audit({ actorType: "staff", actorStaff: result.user.id, actorRole: result.user.role, action: "staff.login", entityType: "staff", entityId: String(result.user.id), req });
  res.json({ success: true, ...result });
}));

router.post("/refresh", asyncHandler(async (req, res) => {
  const result = await refresh(req, res);
  res.json({ success: true, ...result });
}));

router.post("/logout", asyncHandler(async (req, res) => {
  await logout(req, res);
  res.json({ success: true });
}));

router.get("/me", requireAuth, asyncHandler(async (req, res) => {
  res.json({ success: true, user: publicStaffUser(req.user) });
}));

router.get("/users", requireAuth, requirePermission("users.manage"), asyncHandler(async (req, res) => {
  const users = await listStaffUsers();
  await audit({ actorType: "staff", action: "staff.list_viewed", entityType: "staff", metadata: { resultCount: users.length }, req });
  res.json({ success: true, users });
}));

router.post("/users", requireAuth, requirePermission("users.manage"), asyncHandler(async (req, res) => {
  const input = validate(staffSchema, req.body);
  const user = await createStaffUser(input);
  await audit({ actorType: "staff", actorStaff: req.user._id, action: "staff.created", entityType: "staff", entityId: user._id.toString(), req });
  res.status(201).json({ success: true, user: publicStaffUser(user) });
}));

router.patch("/users/:id", requireAuth, requirePermission("users.manage"), requireObjectIdParam("id", "Staff user was not found."), asyncHandler(async (req, res) => {
  const input = validate(z.object({
    name: z.string().min(2).max(120).optional(),
    role: z.enum(["super_admin", "doctor", "receptionist", "clinic_staff"]).optional(),
    isActive: z.boolean().optional()
  }), req.body);
  const user = await updateStaffUser(req.params.id, input);
  await audit({ actorType: "staff", actorStaff: req.user._id, action: "staff.updated", entityType: "staff", entityId: req.params.id, req });
  res.json({ success: true, user });
}));

module.exports = router;
