const { env } = require("../config/env");

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "X-XSS-Protection": "0",
  "Content-Security-Policy":
    "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data:; " +
    "connect-src 'self'; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self';"
};

function applySecurityHeaders(res) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(name, value);
  }
  if (env.isProd) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

function isOriginAllowed(origin) {
  if (!origin) return true;                // mismo origen o CLI
  if (env.CORS_ORIGINS.length === 0) return false;
  return env.CORS_ORIGINS.includes(origin);
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (env.CORS_ORIGINS.length === 0) return; // sin lista blanca → sin CORS
  if (origin && isOriginAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Max-Age", "600");
  }
}

module.exports = { applySecurityHeaders, applyCors, isOriginAllowed };
