import { auth } from "~/server/auth";
import { readPhoto } from "~/server/services/storage";

/** Scan photos are private: only signed-in household members can load them. */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { key } = await params;
  const photo = await readPhoto(key.join("/"));
  if (!photo) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(photo.bytes), {
    headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": "private, max-age=86400, immutable",
    },
  });
}
