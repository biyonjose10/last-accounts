import { NextResponse } from "next/server";
import { buildState } from "@/lib/ledger/state";
import { store } from "@/lib/ledger/store";
import { syncPayments } from "@/lib/payments";
import { workspaceId } from "@/lib/session";

export async function GET() {
  const workspace = await workspaceId();
  await syncPayments(workspace);
  return NextResponse.json(buildState(await store().list(workspace)));
}
