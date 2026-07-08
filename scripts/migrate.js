#!/usr/bin/env node
require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const MIGRATIONS_DIR = path.join(__dirname, "..", "db", "migrations");

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     VARCHAR(100) PRIMARY KEY,
      applied_at  TIMESTAMP NOT NULL DEFAULT now()
    )
  `);

  const { rows } = await client.query("SELECT version FROM schema_migrations");
  const applied = new Set(rows.map((r) => r.version));

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  = skip ${file} (ya aplicada)`);
      continue;
    }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    console.log(`  > aplicar ${file}`);
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations(version) VALUES ($1)", [file]);
      await client.query("COMMIT");
      ran++;
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`  ! error en ${file}:`, err.message);
      throw err;
    }
  }

  await client.end();
  console.log(`Migración completada. ${ran} archivo(s) aplicado(s), ${files.length - ran} omitidos.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
