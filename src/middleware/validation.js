const mongoose = require("mongoose");
const { notFound } = require("../utils/errors");

function requireObjectIdParam(name = "id", message = "Resource not found") {
  return (req, res, next) => {
    if (!mongoose.Types.ObjectId.isValid(String(req.params[name] || ""))) {
      return next(notFound(message));
    }
    return next();
  };
}

module.exports = { requireObjectIdParam };
