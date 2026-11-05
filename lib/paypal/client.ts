// Thin PayPal REST client. Sandbox only, by construction.

const BASE = process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";

export function assertSandbox(base: string = BASE): void {
  const host = new URL(base).hostname;
  if (!host.endsWith(".sandbox.paypal.com")) {
    throw new Error("Refusing to run: PAYPAL_API_BASE is not a PayPal sandbox host.");
  }
}

export interface PayPalResult<T = any> {
  ok: boolean;
  status: number;
  debugId: string | null;
  json: T;
}

export class PayPalUnavailable extends Error {}

const RETRYABLE = /CONNECT_TIMEOUT|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|SOCKET/;

/** Retries only what's safe: dropped connections, and 5xx when the call carries an idempotency key. */
async function send(url: string, init: RequestInit, safeToRepeat: boolean, tries = 4): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(25_000) });
      if (res.status >= 500 && safeToRepeat && attempt < tries) {
        await new Promise((r) => setTimeout(r, 800 * attempt));
        continue;
      }
      return res;
    } catch (err) {
      const code = String((err as { cause?: { code?: string } }).cause?.code ?? "");
      const timedOut = (err as Error).name === "TimeoutError";
      const retry = safeToRepeat && (RETRYABLE.test(code) || timedOut);
      if (!retry || attempt >= tries) {
        throw new PayPalUnavailable(`PayPal could not be reached (${code || (err as Error).name}).`);
      }
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }
}

let cached: { token: string; expires: number } | undefined;

async function accessToken(): Promise<string> {
  assertSandbox();
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new PayPalUnavailable("PayPal keys aren't configured.");
  const res = await send(
    `${BASE}/v1/oauth2/token`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    },
    true,
  );
  const body = await res.json();
  if (!res.ok) throw new PayPalUnavailable(`PayPal refused the keys (${res.status}).`);
  cached = { token: body.access_token, expires: Date.now() + body.expires_in * 1000 };
  return cached.token;
}

export async function paypal<T = any>(
  path: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string>; safeToRepeat?: boolean } = {},
): Promise<PayPalResult<T>> {
  const token = await accessToken();
  const method = options.method ?? "GET";
  const res = await send(
    `${BASE}${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    },
    options.safeToRepeat ?? method === "GET",
  );
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { ok: res.ok, status: res.status, debugId: res.headers.get("paypal-debug-id"), json };
}

export const toValue = (cents: number) => (cents / 100).toFixed(2);
export const toCents = (value: string) => Math.round(Number(value) * 100);
