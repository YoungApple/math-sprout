import fs from "node:fs/promises";
import path from "node:path";

/**
 * Image storage abstraction.
 * - Dev:  files under ./data/uploads
 * - Prod: Google Cloud Storage bucket (GCS_BUCKET)
 *
 * In both cases images are served through our own origin at /api/images/<key>.
 * We deliberately do NOT hand out storage.googleapis.com signed URLs: that host is
 * unreachable from mainland China, whereas our domain (via Cloudflare) is.
 */

const LOCAL_ROOT = path.resolve(process.env.UPLOAD_DIR ?? "./data/uploads");

function bucketName(): string | undefined {
  return process.env.GCS_BUCKET || undefined;
}

export async function putImage(key: string, bytes: Buffer, contentType: string): Promise<void> {
  const bucket = bucketName();
  if (bucket) {
    const { Storage } = await import("@google-cloud/storage");
    await new Storage().bucket(bucket).file(key).save(bytes, {
      contentType,
      resumable: false,
      metadata: { cacheControl: "private, max-age=31536000" },
    });
    return;
  }
  const full = path.join(LOCAL_ROOT, key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, bytes);
}

export async function getImage(key: string): Promise<Buffer | null> {
  if (key.includes("..")) return null; // path traversal guard
  const bucket = bucketName();
  if (bucket) {
    const { Storage } = await import("@google-cloud/storage");
    try {
      const [bytes] = await new Storage().bucket(bucket).file(key).download();
      return bytes;
    } catch {
      return null;
    }
  }
  const full = path.join(LOCAL_ROOT, key);
  if (!full.startsWith(LOCAL_ROOT)) return null;
  try {
    return await fs.readFile(full);
  } catch {
    return null;
  }
}

/** Browser-loadable URL, always on our own origin. */
export function imageUrl(key: string): string {
  return `/api/images/${key}`;
}
