import { NextResponse } from "next/server";
import { AFTER_WINDOW_DATE } from "@/fixtures/scenario";
import { store } from "@/lib/ledger/store";
import { workspaceId } from "@/lib/session";

/** The demo's only time jump. Always labelled as simulated. */
export async function POST() {
  const workspace = await workspaceId();
  await store().append(workspace, "date_advanced", { to: AFTER_WINDOW_DATE }, "date:after-window");
  return NextResponse.json({ ok: true, to: AFTER_WINDOW_DATE });
}
