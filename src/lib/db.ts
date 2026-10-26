import { createClient, type Client, type InValue } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";

/**
 * Thin data-access layer on top of libSQL.
 * - Dev:  DATABASE_URL=file:./data/math-sprout.db (plain SQLite file)
 * - Prod: DATABASE_URL=libsql://...turso.io + DATABASE_AUTH_TOKEN
 * The same SQL works against both, so there is a single schema to maintain.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS mistakes (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  grade INTEGER,
  term TEXT,
  source TEXT,
  category TEXT,
  raw_image_key TEXT NOT NULL,
  stem_text TEXT,
  student_answer TEXT,
  correct_answer TEXT,
  error_category TEXT,
  root_cause TEXT,
  knowledge_points TEXT NOT NULL DEFAULT '[]',
  hints TEXT NOT NULL DEFAULT '[]',
  svg_diagram TEXT,
  review_status TEXT NOT NULL DEFAULT 'PENDING',
  review_stage INTEGER NOT NULL DEFAULT 0,
  next_review_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mistakes_next_review ON mistakes(next_review_at);

CREATE TABLE IF NOT EXISTS variants (
  id TEXT PRIMARY KEY,
  mistake_id TEXT NOT NULL REFERENCES mistakes(id) ON DELETE CASCADE,
  level TEXT NOT NULL,
  stem TEXT NOT NULL,
  answer TEXT NOT NULL,
  explanation TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_variants_mistake ON variants(mistake_id);

CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  mistake_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  answered_at TEXT NOT NULL,
  user_answer TEXT NOT NULL,
  is_correct INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attempts_mistake ON attempts(mistake_id);
`;

let client: Client | null = null;
let ready: Promise<void> | null = null;

export function db(): Client {
  if (client) return client;
  const url = process.env.DATABASE_URL ?? "file:./data/math-sprout.db";
  if (url.startsWith("file:")) {
    const file = url.slice("file:".length);
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  }
  client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  return client;
}

/** Idempotently applies the schema once per process. */
export async function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const c = db();
      for (const stmt of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) {
        await c.execute(stmt);
      }
    })();
  }
  return ready;
}

export async function run(sql: string, args: InValue[] = []) {
  await ensureSchema();
  return db().execute({ sql, args });
}

export async function all<T = Record<string, unknown>>(sql: string, args: InValue[] = []): Promise<T[]> {
  const res = await run(sql, args);
  return res.rows as unknown as T[];
}

export async function one<T = Record<string, unknown>>(sql: string, args: InValue[] = []): Promise<T | null> {
  const rows = await all<T>(sql, args);
  return rows[0] ?? null;
}
