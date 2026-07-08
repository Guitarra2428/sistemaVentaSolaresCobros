const crypto = require("crypto");

function uid(prefix) {
  return `${prefix}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function currency(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

module.exports = { uid, currency };
