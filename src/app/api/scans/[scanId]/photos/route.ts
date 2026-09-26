import { NextResponse } from "next/server";

import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { photoUrl, savePhoto } from "~/server/services/storage";

// Photos are downscaled in the browser before upload, so this is generous.
const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png"]);

export async function POST(req: Request, { params }: { params: Promise<{ scanId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { scanId } = await params;
  const scan = await db.scan.findUnique({ where: { id: scanId } });
  if (!scan) return NextResponse.json({ error: "Scan not found." }, { status: 404 });
  if (scan.status !== "UPLOADING" && scan.status !== "FAILED") {
    return NextResponse.json({ error: "This scan is no longer taking photos." }, { status: 409 });
  }

  const form = await req.formData();
  const file = form.get("photo");
  const width = Number(form.get("width"));
  const height = Number(form.get("height"));
  if (!(file instanceof File) || !TYPES.has(file.type)) {
    return NextResponse.json({ error: "Expected a JPEG or PNG photo." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Photo is too large." }, { status: 413 });
  }

  const key = await savePhoto(Buffer.from(await file.arrayBuffer()), file.type, `scans/${scanId}`);
  const photo = await db.scanPhoto.create({
    data: {
      scanId,
      url: key,
      width: Number.isFinite(width) ? Math.round(width) : 0,
      height: Number.isFinite(height) ? Math.round(height) : 0,
    },
  });
  return NextResponse.json({ id: photo.id, src: photoUrl(key) });
}
