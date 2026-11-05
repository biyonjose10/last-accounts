import { NextResponse } from "next/server";
import { newWorkspace } from "@/lib/session";

/** Starts a fresh fictional estate. The old record stays as it was. */
export async function POST() {
  await newWorkspace();
  return NextResponse.json({ ok: true });
}
