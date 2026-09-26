import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { get, put } from "@vercel/blob";

import { env } from "~/env";

/**
 * Scan photos are photos of someone's home, so they are stored privately and
 * only served through the authenticated /api/photos route. Stored "urls" are
 * storage keys, not public links.
 *
 * Production uses private Vercel Blob. Without a Blob token (local dev), files
 * go to ./.data/uploads.
 */

const LOCAL_ROOT = path.join(process.cwd(), ".data", "uploads");

function useBlob() {
  return !!env.BLOB_READ_WRITE_TOKEN;
}

export async function savePhoto(
  bytes: Buffer,
  contentType: string,
  folder: string,
): Promise<string> {
  const ext = contentType === "image/png" ? "png" : "jpg";
  const key = `${folder}/${randomUUID()}.${ext}`;
  if (useBlob()) {
    await put(key, bytes, { access: "private", contentType });
  } else {
    const file = path.join(LOCAL_ROOT, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
  }
  return key;
}

export async function readPhoto(
  key: string,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (key.includes("..")) return null;
  if (useBlob()) {
    const result = await get(key, { access: "private" });
    if (!result || result.statusCode !== 200) return null;
    const bytes = Buffer.from(await new Response(result.stream).arrayBuffer());
    return { bytes, contentType: result.blob.contentType };
  }
  try {
    const bytes = await readFile(path.join(LOCAL_ROOT, key));
    return { bytes, contentType: key.endsWith(".png") ? "image/png" : "image/jpeg" };
  } catch {
    return null;
  }
}

/** URL the app uses to display a stored photo. */
export function photoUrl(key: string | null | undefined): string | null {
  return key ? `/api/photos/${key}` : null;
}
