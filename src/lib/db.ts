import { createClient, type Client, type InValue } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";

export type { InValue };

/**
 * Thin data-access layer on top of libSQL.
 * - Dev / VM: DATABASE_URL=file:./data/math-sprout.db (SQLite file with WAL + FK cascade)
 * - Tests:    DATABASE_URL=:memory: or file::memory:?cache=shared via resetDbForTests()
 * - Prod:     DATABASE_URL=libsql://...turso.io + DATABASE_AUTH_TOKEN
 */

const BASE_SCHEMA_STMTS = [
  `CREATE TABLE IF NOT EXISTS mistakes (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    grade INTEGER,
    term TEXT,
    source TEXT,
    category TEXT,
    raw_image_key TEXT NOT NULL,
    image_sha256 TEXT,
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
    review_round INTEGER NOT NULL DEFAULT 0,
    next_review_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_mistakes_next_review ON mistakes(next_review_at)`,
  `CREATE TABLE IF NOT EXISTS variants (
    id TEXT PRIMARY KEY,
    mistake_id TEXT NOT NULL REFERENCES mistakes(id) ON DELETE CASCADE,
    level TEXT NOT NULL,
    stem TEXT NOT NULL,
    answer TEXT NOT NULL,
    explanation TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_variants_mistake ON variants(mistake_id)`,
  `CREATE TABLE IF NOT EXISTS attempts (
    id TEXT PRIMARY KEY,
    mistake_id TEXT NOT NULL REFERENCES mistakes(id) ON DELETE CASCADE,
    variant_id TEXT NOT NULL,
    round INTEGER NOT NULL DEFAULT 0,
    answered_at TEXT NOT NULL,
    user_answer TEXT NOT NULL,
    is_correct INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_attempts_mistake ON attempts(mistake_id)`,
  `CREATE TABLE IF NOT EXISTS image_blobs (
    key TEXT PRIMARY KEY,
    content_type TEXT NOT NULL,
    bytes BLOB NOT NULL,
    created_at TEXT NOT NULL
  )`,
];

let client: Client | null = null;
let ready: Promise<void> | null = null;

export function currentDatabaseUrl(): string {
  return process.env.DATABASE_URL ?? "file:./data/math-sprout.db";
}

function isMemoryUrl(url: string): boolean {
  return url === ":memory:" || url.includes(":memory:") || url.includes("mode=memory");
}

export function db(): Client {
  if (client) return client;
  const url = currentDatabaseUrl();
  if (url.startsWith("file:") && !isMemoryUrl(url)) {
    const filePath = url.slice("file:".length).split("?")[0];
    if (filePath) {
      fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
    }
  }
  client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  return client;
}

async function applyPragmasAndMigrations(c: Client, url: string): Promise<void> {
  if (url === ":memory:" || url.startsWith("file:")) {
    await c.execute("PRAGMA busy_timeout = 5000");
    if (!isMemoryUrl(url)) {
      await c.execute("PRAGMA journal_mode = WAL");
    }
    await c.execute("PRAGMA foreign_keys = ON");
  } else {
    await c.execute("PRAGMA foreign_keys = ON").catch(() => {});
  }

  for (const stmt of BASE_SCHEMA_STMTS) {
    await c.execute(stmt);
  }

  // Idempotent column migrations on `mistakes` for pre-Phase-2 SQLite files.
  const mistakeColsRes = await c.execute("PRAGMA table_info(mistakes)");
  const mistakeCols = new Set(mistakeColsRes.rows.map((r) => String(r.name)));
  if (!mistakeCols.has("review_round")) {
    await c.execute("ALTER TABLE mistakes ADD COLUMN review_round INTEGER NOT NULL DEFAULT 0");
  }
  if (!mistakeCols.has("image_sha256")) {
    await c.execute("ALTER TABLE mistakes ADD COLUMN image_sha256 TEXT");
  }
  await c.execute("CREATE INDEX IF NOT EXISTS idx_mistakes_sha256 ON mistakes(image_sha256)");

  // Idempotent migration on `attempts`: ensure `round` column AND `ON DELETE CASCADE` FK exist.
  const attemptColsRes = await c.execute("PRAGMA table_info(attempts)");
  const attemptCols = new Set(attemptColsRes.rows.map((r) => String(r.name)));
  const attemptFksRes = await c.execute("PRAGMA foreign_key_list(attempts)");
  const hasCascadeFk = attemptFksRes.rows.some(
    (r) => String(r.table) === "mistakes" && String(r.on_delete).toUpperCase() === "CASCADE",
  );

  if (!attemptCols.has("round") || !hasCascadeFk) {
    const roundExpr = attemptCols.has("round") ? "COALESCE(round, 0)" : "0";
    await c.batch(
      [
        `DROP TABLE IF EXISTS attempts_migrating`,
        `CREATE TABLE attempts_migrating (
          id TEXT PRIMARY KEY,
          mistake_id TEXT NOT NULL REFERENCES mistakes(id) ON DELETE CASCADE,
          variant_id TEXT NOT NULL,
          round INTEGER NOT NULL DEFAULT 0,
          answered_at TEXT NOT NULL,
          user_answer TEXT NOT NULL,
          is_correct INTEGER NOT NULL
        )`,
        `INSERT INTO attempts_migrating (id, mistake_id, variant_id, round, answered_at, user_answer, is_correct)
         SELECT id, mistake_id, variant_id, ${roundExpr}, answered_at, user_answer, is_correct
         FROM attempts
         WHERE mistake_id IN (SELECT id FROM mistakes)`,
        `DROP TABLE attempts`,
        `ALTER TABLE attempts_migrating RENAME TO attempts`,
        `CREATE INDEX IF NOT EXISTS idx_attempts_mistake ON attempts(mistake_id)`,
      ],
      "write",
    );
  }
}

/** Idempotently applies pragmas, schema, and migrations once per client lifecycle. */
export async function ensureSchema(): Promise<void> {
  if (!ready) {
    const c = db();
    const url = currentDatabaseUrl();
    ready = applyPragmasAndMigrations(c, url).catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

export async function run(sql: string, args: InValue[] = []) {
  await ensureSchema();
  return db().execute({ sql, args });
}

export async function batchWrite(stmts: { sql: string; args?: InValue[] }[]): Promise<void> {
  if (stmts.length === 0) return;
  await ensureSchema();
  await db().batch(
    stmts.map((s) => ({ sql: s.sql, args: s.args ?? [] })),
    "write",
  );
}

export async function all<T = Record<string, unknown>>(sql: string, args: InValue[] = []): Promise<T[]> {
  const res = await run(sql, args);
  return res.rows as unknown as T[];
}

export async function one<T = Record<string, unknown>>(sql: string, args: InValue[] = []): Promise<T | null> {
  const rows = await all<T>(sql, args);
  return rows[0] ?? null;
}

/**
 * Replaces the active database client (defaults to isolated in-memory SQLite) and
 * re-applies the full schema + PRAGMAs for zero-mock vertical-slice tests.
 */
export async function resetDbForTests(url = ":memory:"): Promise<void> {
  if (client) {
    try {
      client.close();
    } catch {
      // Ignore close errors on already-closed clients.
    }
  }
  client = null;
  ready = null;
  process.env.DATABASE_URL = url;

  const c = db();
  if (isMemoryUrl(url)) {
    await c.execute("PRAGMA foreign_keys = OFF").catch(() => {});
    for (const tbl of ["attempts", "variants", "mistakes", "image_blobs"]) {
      await c.execute(`DROP TABLE IF EXISTS ${tbl}`);
    }
  }
  await ensureSchema();
}
