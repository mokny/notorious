import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sqlite } from "./client.js";

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

/** Minimal, dependency-free migration runner: applies each `NNNN_*.sql` file once, in order. */
function runMigrations(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = sqlite.prepare("SELECT name FROM _migrations").all() as { name: string }[];
  const appliedNames = new Set(appliedRows.map((row) => row.name));

  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (appliedNames.has(file)) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    // `PRAGMA foreign_keys` is a no-op once a transaction is already open, so it has to be
    // toggled here, before `sqlite.transaction()` opens one - see SQLite's own recommended
    // procedure for schema changes a plain ALTER TABLE can't express (e.g. dropping a NOT NULL
    // constraint, as migrations/0041_passkey_only_registration.sql does): rebuilding a table
    // that other tables hold a foreign key against is blocked by `DROP TABLE` while enforcement
    // is on, even though no row a still-enforced constraint would reject is ever actually deleted.
    sqlite.pragma("foreign_keys = OFF");
    const applyMigration = sqlite.transaction(() => {
      sqlite.exec(sql);
      sqlite
        .prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)")
        .run(file, new Date().toISOString());
    });
    try {
      applyMigration();
    } finally {
      sqlite.pragma("foreign_keys = ON");
    }
    console.warn(`Applied migration: ${file}`);
  }

  console.warn("Database is up to date.");
}

runMigrations();
