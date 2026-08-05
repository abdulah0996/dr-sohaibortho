const express = require("express");
const mongoose = require("mongoose");
const { isEmailConfigured } = require("../services/ownerEmailOutboxService");
const { asyncHandler } = require("../utils/asyncHandler");

const router = express.Router();

router.get("/", (req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.json({
    success: ready,
    status: ready ? "ok" : "degraded",
    database: ready ? "connected" : "not_connected",
    uptime: process.uptime()
  });
});

router.get("/email", (req, res) => {
  const configured = isEmailConfigured();
  res.json({
    enabled: configured,
    configured: configured,
    status: configured ? "enabled" : "disabled"
  });
});

router.get("/ready", asyncHandler(async (req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({
    success: ready,
    database: ready ? "connected" : "not_connected"
  });
}));

module.exports = router;
