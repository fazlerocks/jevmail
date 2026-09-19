import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";
import { env } from "@/lib/env";

function open() {
  const file = env.databaseUrl.replace(/^file:/, "");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db;
}

// Reuse across hot reloads in dev.
const g = globalThis as unknown as { __jevmailDb?: ReturnType<typeof open> };
export const db = g.__jevmailDb ?? (g.__jevmailDb = open());
export type Db = typeof db;
export { schema };
