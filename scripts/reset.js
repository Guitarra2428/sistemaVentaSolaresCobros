#!/usr/bin/env node
// Drop TODAS las tablas del schema `public`. Solo dev/staging.
// En NODE_ENV=production requiere variable ALLOW_DB_RESET=yes.
require("dotenv").config();
const { Client } = require("pg");

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DB_RESET !== "yes") {
    console.error("Reset bloqueado en producción. Define ALLOW_DB_RESET=yes para forzar.");
    process.exit(2);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("Reseteando schema public...");
  await client.query("DROP SCHEMA public CASCADE");
  await client.query("CREATE SCHEMA public");
  await client.query("GRANT ALL ON SCHEMA public TO CURRENT_USER");
  await client.query("GRANT ALL ON SCHEMA public TO PUBLIC");
  await client.end();
  console.log("Schema `public` recreado.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
