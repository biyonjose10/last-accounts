import { NextResponse } from "next/server";
import { store } from "@/lib/ledger/store";
import { mayStartEstate, requestIp, visitorKey } from "@/lib/limits";
import { newWorkspace } from "@/lib/session";

/** Starts a fresh fictional estate. The old record stays as it was. */
export async function POST(req: Request) {
  const allowed = await mayStartEstate(store(), visitorKey(requestIp(req.headers)));
  if (!allowed) {
    return NextResponse.json({ ok: false, message: "That's enough fresh estates for today. You can keep using this one." }, { status: 429 });
  }
  await newWorkspace();
  return NextResponse.json({ ok: true });
}
