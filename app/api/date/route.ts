import { NextResponse } from "next/server";
import { AFTER_WINDOW_DATE, START_DATE } from "@/fixtures/scenario";
import { canGoBack } from "@/lib/ledger/state";
import { store } from "@/lib/ledger/store";
import { workspaceId } from "@/lib/session";

/**
 * The demo's only time jump, always labelled as simulated. It can go back to the real date
 * only while nothing has moved since the jump.
 */
export async function POST(req: Request) {
  const workspace = await workspaceId();
  const body = await req.json().catch(() => ({}));
  const events = await store().list(workspace);
  // Each round trip gets its own key, so a double click can't jump twice but a later jump still counts.
  const trips = events.filter((e) => e.type === "date_reverted").length;

  if (body?.to === "start") {
    if (!canGoBack(events)) {
      return NextResponse.json(
        { ok: false, error: "Money has moved since the jump, so the date can't go back. Start the estate again instead." },
        { status: 409 },
      );
    }
    await store().append(workspace, "date_reverted", { to: START_DATE }, `date:back:${trips}`);
    return NextResponse.json({ ok: true, to: START_DATE });
  }

  await store().append(workspace, "date_advanced", { to: AFTER_WINDOW_DATE }, `date:after-window:${trips}`);
  return NextResponse.json({ ok: true, to: AFTER_WINDOW_DATE });
}
