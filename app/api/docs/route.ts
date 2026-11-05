import { NextResponse } from "next/server";
import { INCOMING, manifest } from "@/lib/reading";

/** The fictional paperwork, without its answer key. */
export async function GET() {
  const docs = await manifest();
  return NextResponse.json(
    docs.map((d) => ({ id: d.id, title: d.title, kind: d.kind, incoming: INCOMING.has(d.id) })),
  );
}
