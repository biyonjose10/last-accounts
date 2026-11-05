// Each visitor gets a private fictional estate, identified by a cookie. No sign-up.

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "la_workspace";

export async function workspaceId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  if (existing && /^[0-9a-f-]{36}$/.test(existing)) return existing;
  const id = randomUUID();
  jar.set(COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 60, path: "/" });
  return id;
}

export async function newWorkspace(): Promise<string> {
  const jar = await cookies();
  const id = randomUUID();
  jar.set(COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 60, path: "/" });
  return id;
}
