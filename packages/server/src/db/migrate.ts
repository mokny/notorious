import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sqlite } from "./client.js";
import { repoRoot } from "../env.js";

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");
// repo-root/modules/<id>/migrations - same file-naming/tracking convention
// as migrationsDir above, just one directory per module (see
// modules/moduleRegistry/loader.ts) so each module can ship/version its own
// schema independently of the core migration sequence.
const modulesDir = path.join(repoRoot, "modules");

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

/**
 * Same apply-once-in-order logic as `runMigrations` above, but per module
 * folder under `/modules`, tracked in `module_migrations` (moduleId,
 * filename) instead of the shared `_migrations` table - see
 * db/schema.ts's `moduleMigrations` doc comment. Runs for every module
 * found on disk regardless of whether any workspace has enabled it yet.
 */
function runModuleMigrations(): void {
  if (!fs.existsSync(modulesDir)) return;

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS module_migrations (
      module_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      applied_at TEXT NOT NULL,
      PRIMARY KEY (module_id, filename)
    );
  `);

  const moduleIds = fs
    .readdirSync(modulesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "dist" && entry.name !== "node_modules")
    .map((entry) => entry.name);

  for (const moduleId of moduleIds) {
    const moduleMigrationsDir = path.join(modulesDir, moduleId, "migrations");
    if (!fs.existsSync(moduleMigrationsDir)) continue;

    const appliedRows = sqlite
      .prepare("SELECT filename FROM module_migrations WHERE module_id = ?")
      .all(moduleId) as { filename: string }[];
    const appliedNames = new Set(appliedRows.map((row) => row.filename));

    const files = fs
      .readdirSync(moduleMigrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const file of files) {
      if (appliedNames.has(file)) continue;

      const sql = fs.readFileSync(path.join(moduleMigrationsDir, file), "utf8");
      sqlite.pragma("foreign_keys = OFF");
      const applyMigration = sqlite.transaction(() => {
        sqlite.exec(sql);
        sqlite
          .prepare("INSERT INTO module_migrations (module_id, filename, applied_at) VALUES (?, ?, ?)")
          .run(moduleId, file, new Date().toISOString());
      });
      try {
        applyMigration();
      } finally {
        sqlite.pragma("foreign_keys = ON");
      }
      console.warn(`Applied module migration: ${moduleId}/${file}`);
    }
  }
}

runMigrations();
runModuleMigrations();
