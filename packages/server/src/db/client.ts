import fs from "node:fs";
import path from "node:path";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { env } from "../env.js";
import * as schema from "./schema.js";

fs.mkdirSync(path.dirname(env.databasePath), { recursive: true });
fs.mkdirSync(env.filesDir, { recursive: true });

export const sqlite: DatabaseType = new Database(env.databasePath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export type Db = typeof db;
