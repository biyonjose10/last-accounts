# Progress

Resume here: read PLAN.md, this file, features.json, then `git log`.

## Rules for any session
- Sandbox only. Never real money or live PayPal credentials.
- Sir pastes keys into `.env` himself. Never go looking for keys on the machine.
- Stage named paths, never `git add -A`. Leak-checker before every push.
- Ask first: spending money, public repo, video upload, Devpost submit, Discord or forum posts, other projects.
- AI never sets an amount. Code decides the money.
- Keep Gemini calls few. Test guards without spending.

## Key dates (IST)
- Sun 8 Nov 23:59: deployed and working end to end
- Mon 9 Nov 12:00: second entry decision
- Wed 11 Nov 12:00: feature freeze
- Wed 11 Nov 23:59: video finished and uploaded
- Thu 12 Nov 18:00: submitted (hard deadline Fri 13 Nov 01:30)

## Status

### 2026-11-05: Phase 0 started
- Project created. `scripts/sandbox-proof.mjs` written, not yet run.
- Waiting on sir: PayPal developer account, sandbox accounts, keys in `.env`.

### 2026-11-05: Phase 0 sandbox proof
Everything below was run from sir's account against the sandbox.

**Works**
- Dashboard access from India. Default sandbox accounts are IN, so we made US ones: Estate (business), Tom (personal). App name is "Estate Ledger" because PayPal bans "account" in app names.
- Order, buyer approval, capture. Simulated decline with `PayPal-Mock-Response`. Payouts, duplicate rejection.
- Card-funded orders complete with no buyer approval. **They do NOT add spendable balance** (see below).

**Traps found**
- Balance form refuses $100,000 or more.
- Balances and Transaction Search lag. They showed $5,000 and a refresh time before the account's activity. Never show them as live. Build accounting from each payout's and order's own GET response; use reporting only as a later cross-check.
- Repeat capture returns 201 with the SAME capture ID. Check the capture ID; a success code alone doesn't prove anything.
- Payout fee was a flat $0.25 at $25, $1 and $6,000. Order fees are percentage-based (about 2.59% + $0.49 on the $25,000 card order). The engine must count fees.
- PayPal returned one 500 on a card order; the next succeeded. Node fetch also had two connect timeouts. Retry with the same `PayPal-Request-Id` or `sender_batch_id`.
- Sandbox login form ignores scripted values. Real keystrokes work.

**Still to do in Phase 0:** recheck Balances and Transaction Search; Dana and Aoife accounts before the final-batch phase.

**Correction, 5 Nov evening:** the earlier "refill works" note was wrong. The dashboard's balance matched the sum with every capture left out: $23,070.75 on the Estate. Neither the test-card orders nor Tom's $14.40 capture became spendable, at least not within hours. Payouts then return INSUFFICIENT_FUNDS.
**How to refill:** Testing Tools > Sandbox Accounts > Estate > pencil beside PayPal balance. Must be under $100,000.
**Design result:** the estate was cut from about $212,000 to about $52,800 so a full run fits in one fill, with two full runs per fill. Car-sale cash counts in the ledger, but isn't spendable in the sandbox, which is fine because the balance stays well above it.

**Sir still owes:** Tom's and Estate's passwords stay in his own note; they go in the judges' instructions only for Tom.

### 2026-11-05 night: deployed
- Live: https://last-accounts.vercel.app (Vercel project last-accounts; deploy with `npx --yes vercel@65.5.0 --prod --yes`, no auto-deploy).
- Database: Neon `last-accounts-db`, created through the Vercel integration; DATABASE_URL lives in Vercel and .env.local.
- PayPal webhook registered at /api/webhook; ID in Vercel and .env.
- PayPal dashboard sessions expire quickly. Refill the Estate with the pencil on its sandbox account page; it must be under $100,000.
- Still to do: sir's car test as Tom, record fixtures/replay/run.json from a real run, final account on real data, webhook seen arriving.

### 2026-11-05 late: full hosted run passed
- Sir bought the car as Tom on the live site: cancel and capture both real. Webhooks verified. Final account matched PayPal line by line.
- Found by that run: a payout to Ireland cost $20.00, not $0.25, which left the estate at -$19.75. Fee reserve now sets aside $20 for a payout abroad.
- Red team found two real gaps, both fixed: limits could be burned by refused requests (limits now count only after every check passes, and per visitor), and two different payments at once could overpay (an approval is now stale if money moved since it was issued).
- Replay saved at fixtures/replay/run.json via scripts/export-replay.ts. Re-export after the final filmed run.
- Still to do: capture-failure drill on hosted site (needs sir as Tom), exceed limits live, fresh browser check, README, APIMatic, video, Devpost.
