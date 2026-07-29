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
    const applyMigration = sqlite.transaction(() => {
      sqlite.exec(sql);
      sqlite
        .prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)")
        .run(file, new Date().toISOString());
    });
    applyMigration();
    console.warn(`Applied migration: ${file}`);
  }

  console.warn("Database is up to date.");
}

runMigrations();
