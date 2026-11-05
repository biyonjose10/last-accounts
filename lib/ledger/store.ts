// Append-only event store. Neon Postgres when DATABASE_URL is set, memory otherwise (local runs and tests).
// Events are never updated or deleted. A unique key on (workspace, key) stops a double click paying twice.

import { neon } from "@neondatabase/serverless";

export interface LedgerEvent {
  seq: number;
  at: string;
  type: string;
  data: any;
  key: string | null;
}

export interface Store {
  append(workspace: string, type: string, data: unknown, key?: string): Promise<{ event: LedgerEvent; duplicate: boolean }>;
  list(workspace: string): Promise<LedgerEvent[]>;
  /** Adds one to a counter unless it has reached the limit. Returns false at the limit. */
  bump(counter: string, limit: number): Promise<boolean>;
  count(counter: string): Promise<number>;
  /** Which estate a payment belongs to, for PayPal events that arrive on their own. */
  findWorkspaceByLedger(ledgerIdPrefix: string): Promise<string | null>;
}

class MemoryStore implements Store {
  private events = new Map<string, LedgerEvent[]>();
  private counters = new Map<string, number>();

  async append(workspace: string, type: string, data: unknown, key?: string) {
    const list = this.events.get(workspace) ?? [];
    const found = key ? list.find((e) => e.key === key) : undefined;
    if (found) return { event: found, duplicate: true };
    const event: LedgerEvent = { seq: list.length + 1, at: new Date().toISOString(), type, data, key: key ?? null };
    list.push(event);
    this.events.set(workspace, list);
    return { event, duplicate: false };
  }
  async list(workspace: string) {
    return [...(this.events.get(workspace) ?? [])];
  }
  async bump(counter: string, limit: number) {
    const n = this.counters.get(counter) ?? 0;
    if (n >= limit) return false;
    this.counters.set(counter, n + 1);
    return true;
  }
  async count(counter: string) {
    return this.counters.get(counter) ?? 0;
  }
  async findWorkspaceByLedger(ledgerIdPrefix: string) {
    for (const [workspace, list] of this.events) {
      if (list.some((e) => e.type === "payment_requested" && String(e.data?.ledgerId ?? "").startsWith(ledgerIdPrefix))) return workspace;
    }
    return null;
  }
}

class NeonStore implements Store {
  private sql;
  private ready?: Promise<unknown>;

  constructor(url: string) {
    this.sql = neon(url);
  }
  private init() {
    this.ready ??= (async () => {
      await this.sql`CREATE TABLE IF NOT EXISTS ledger_events (
        workspace text NOT NULL, seq bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(),
        type text NOT NULL, data jsonb NOT NULL, key text)`;
      await this.sql`CREATE UNIQUE INDEX IF NOT EXISTS ledger_events_key ON ledger_events (workspace, key) WHERE key IS NOT NULL`;
      await this.sql`CREATE INDEX IF NOT EXISTS ledger_events_ws ON ledger_events (workspace, seq)`;
      await this.sql`CREATE TABLE IF NOT EXISTS counters (name text PRIMARY KEY, n integer NOT NULL)`;
    })();
    return this.ready;
  }
  private row(r: any): LedgerEvent {
    return { seq: Number(r.seq), at: new Date(r.at).toISOString(), type: r.type, data: r.data, key: r.key };
  }
  async append(workspace: string, type: string, data: unknown, key?: string) {
    await this.init();
    const rows = await this.sql`INSERT INTO ledger_events (workspace, type, data, key)
      VALUES (${workspace}, ${type}, ${JSON.stringify(data)}::jsonb, ${key ?? null})
      ON CONFLICT (workspace, key) WHERE key IS NOT NULL DO NOTHING RETURNING *`;
    if (rows[0]) return { event: this.row(rows[0]), duplicate: false };
    const existing = await this.sql`SELECT * FROM ledger_events WHERE workspace = ${workspace} AND key = ${key ?? ""}`;
    return { event: this.row(existing[0]), duplicate: true };
  }
  async list(workspace: string) {
    await this.init();
    const rows = await this.sql`SELECT * FROM ledger_events WHERE workspace = ${workspace} ORDER BY seq`;
    return rows.map((r) => this.row(r));
  }
  async bump(counter: string, limit: number) {
    await this.init();
    const rows = await this.sql`INSERT INTO counters (name, n) VALUES (${counter}, 1)
      ON CONFLICT (name) DO UPDATE SET n = counters.n + 1 WHERE counters.n < ${limit} RETURNING n`;
    return rows.length > 0;
  }
  async count(counter: string) {
    await this.init();
    const rows = await this.sql`SELECT n FROM counters WHERE name = ${counter}`;
    return rows[0] ? Number(rows[0].n) : 0;
  }
  async findWorkspaceByLedger(ledgerIdPrefix: string) {
    await this.init();
    const rows = await this.sql`SELECT workspace FROM ledger_events
      WHERE type = 'payment_requested' AND data->>'ledgerId' LIKE ${`${ledgerIdPrefix}%`} LIMIT 1`;
    return rows[0] ? String(rows[0].workspace) : null;
  }
}

const globalStore = globalThis as unknown as { __lastAccountsStore?: Store };

export function store(): Store {
  globalStore.__lastAccountsStore ??= process.env.DATABASE_URL
    ? new NeonStore(process.env.DATABASE_URL)
    : new MemoryStore();
  return globalStore.__lastAccountsStore;
}

export function newMemoryStore(): Store {
  return new MemoryStore();
}
