import fs from "node:fs/promises";
import path from "node:path";
import { currentDatabaseUrl, one, run } from "./db";

/**
 * Image storage abstraction.
 * - GCS_BUCKET set -> Google Cloud Storage bucket
 * - DATABASE_URL is :memory: or remote libsql:///https:// (or STORAGE_BACKEND=db) -> `image_blobs` table
 * - Otherwise -> local filesystem under UPLOAD_DIR (resolved lazily per call)
 *
 * In all cases images are served through our own origin at /api/images/<key> so mainland-China
 * networks never need to reach storage.googleapis.com.
 */

type Backend = "gcs" | "db" | "disk";

function localRoot(): string {
  return path.resolve(process.env.UPLOAD_DIR ?? "./data/uploads");
}

function bucketName(): string | undefined {
  return process.env.GCS_BUCKET?.trim() || undefined;
}

function selectBackend(): Backend {
  if (bucketName()) return "gcs";
  if (process.env.STORAGE_BACKEND === "db") return "db";
  const dbUrl = currentDatabaseUrl();
  if (
    dbUrl === ":memory:" ||
    dbUrl.includes(":memory:") ||
    dbUrl.includes("mode=memory") ||
    dbUrl.startsWith("libsql://") ||
    dbUrl.startsWith("https://") ||
    dbUrl.startsWith("http://")
  ) {
    return "db";
  }
  return "disk";
}

function isSafeKey(key: string): boolean {
  return (
    Boolean(key) &&
    !key.includes("..") &&
    !key.startsWith("/") &&
    !key.includes("\\") &&
    !key.includes("\0")
  );
}

/** Magic-byte check for browser-safe raster upload formats supported by Gemini Vision. */
export function detectImageMime(bytes: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export async function putImage(key: string, bytes: Buffer, contentType: string): Promise<void> {
  if (!isSafeKey(key)) throw new Error("invalid image key");

  const backend = selectBackend();
  if (backend === "gcs") {
    const bucket = bucketName()!;
    const { Storage } = await import("@google-cloud/storage");
    await new Storage().bucket(bucket).file(key).save(bytes, {
      contentType,
      resumable: false,
      metadata: { cacheControl: "private, max-age=31536000" },
    });
    return;
  }

  if (backend === "db") {
    const payload = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    await run(
      `INSERT OR REPLACE INTO image_blobs (key, content_type, bytes, created_at) VALUES (?, ?, ?, ?)`,
      [key, contentType, payload, new Date().toISOString()],
    );
    return;
  }

  const root = localRoot();
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error("invalid image path");
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, bytes);
}

export async function getImage(key: string): Promise<Buffer | null> {
  if (!isSafeKey(key)) return null;

  const backend = selectBackend();
  if (backend === "gcs") {
    const bucket = bucketName()!;
    const { Storage } = await import("@google-cloud/storage");
    try {
      const [bytes] = await new Storage().bucket(bucket).file(key).download();
      return bytes;
    } catch {
      return null;
    }
  }

  if (backend === "db") {
    const row = await one<{ bytes: unknown }>(`SELECT bytes FROM image_blobs WHERE key = ?`, [key]);
    if (!row || row.bytes == null) return null;
    const raw = row.bytes;
    if (Buffer.isBuffer(raw)) return raw;
    if (raw instanceof ArrayBuffer) return Buffer.from(raw);
    if (ArrayBuffer.isView(raw)) return Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
    if (typeof raw === "string") return Buffer.from(raw, "base64");
    return null;
  }

  const root = localRoot();
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) return null;
  try {
    return await fs.readFile(full);
  } catch {
    return null;
  }
}

export async function deleteImage(key: string): Promise<void> {
  if (!isSafeKey(key)) return;

  const backend = selectBackend();
  if (backend === "gcs") {
    const bucket = bucketName()!;
    const { Storage } = await import("@google-cloud/storage");
    await new Storage()
      .bucket(bucket)
      .file(key)
      .delete({ ignoreNotFound: true })
      .catch(() => {});
    return;
  }

  if (backend === "db") {
    await run(`DELETE FROM image_blobs WHERE key = ?`, [key]).catch(() => {});
    return;
  }

  const root = localRoot();
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) return;
  await fs.unlink(full).catch(() => {});
}

/** Browser-loadable URL, always on our own origin. */
export function imageUrl(key: string): string {
  return `/api/images/${key}`;
}
