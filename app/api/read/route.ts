import { NextResponse } from "next/server";
import { z } from "zod";
import { processDocument } from "@/lib/reading";
import { workspaceId } from "@/lib/session";

const Body = z.object({ docId: z.string().max(40), aiOff: z.boolean().optional() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const workspace = await workspaceId();
  return NextResponse.json(await processDocument(workspace, parsed.data.docId, { aiOff: parsed.data.aiOff }));
}
