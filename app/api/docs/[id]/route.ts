import { readFile } from "node:fs/promises";
import path from "node:path";
import { manifest } from "@/lib/reading";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = (await manifest()).find((d) => d.id === id);
  if (!doc) return new Response("Not found", { status: 404 });
  const bytes = await readFile(path.join(process.cwd(), "fixtures", "docs", path.basename(doc.file)));
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" } });
}
