# Last Accounts: plan for the PayPal AI Hackathon

Saved as `C:\Users\biyon\projects\paypal-ai-hack\PLAN.md` once approved. No code before that.

## Context

Sir is entering solo to win cash. Deadline Fri 13 Nov 01:30 IST; own target Thu 12 Nov 18:00 IST. Sir picked **Last Accounts** and a **new free Gemini key in its own Google project**.

**Why this idea:** no public repos found for it (searched 5 Nov), while my other favourites each have 3–4. It scored highest on the five criteria, and fits the pattern of sir's earlier win: a deep niche problem.

**Prize targets:** Most Impactful, Most Creative, Best Demo Delivery or Grand, plus Bryntum, with APIMatic as a cheap extra. Honest odds: about 15% for any main prize, about 25% for any sponsor prize. No cash is still the most likely outcome.

## The product

**One line:** the person settling a parent's estate can't accidentally pay the wrong person first.

**User:** Dana, a fictional first-time personal representative in Florida. Her mother left about $212,000, three heirs (one abroad), a car and a pile of creditor letters. Dana has a lawyer for filings, but the money and the personal risk are hers.

**Pitch correction:** I earlier said "too small for a lawyer". That's unsafe, because Florida generally appears to require an attorney in formal administration (to verify in Phase 1). So the product **sits alongside the lawyer** and doesn't replace one. It always says it isn't legal advice.

**The rule that makes it serious (all read from primary sources on 5 Nov):**
- Payment order and the $6,000 funeral cap: [Fla. Stat. 733.707](http://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0700-0799/0733/Sections/0733.707.html)
- Claim window, 3 months from first publication or 30 days from service, whichever is later: [733.702](http://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0700-0799/0733/Sections/0733.702.html)
- Which gifts are reduced first: [733.805](http://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0700-0799/0733/Sections/0733.805.html)
- Personal liability for breach of duty: [733.609](http://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0700-0799/0733/Sections/0733.609.html)
- Personal liability for paying others before the US government: [31 USC 3713(b)](https://www.law.cornell.edu/uscode/text/31/3713)
- Recipients of improper payments may have to return them: [733.812](https://flsenate.gov/laws/statutes/2000/733.812)
- The demo estate must exceed $150,000 to avoid summary administration: [735.201](http://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0700-0799/0735/Sections/0735.201.html)

**The core design: AI reads the paper, code decides the money.** The AI can never set an amount. A letter that says "pay immediately" changes nothing, and the video shows this.

### The one flow
1. Dana drops in the will, statement and letters. AI extracts the facts, each tied to a quote checked against the document.
2. The ledger shows what's owed, what's held and what's safe to pay today.
3. **The moment:** she tries to pay her brother $62,000. It stops her, names the open claim window and the reason, then offers the safe amount. She approves it, and a real sandbox Payout goes through.
4. Her brother buys the car from the estate through PayPal Checkout (a real order and capture), and his share is adjusted.
5. A new creditor letter arrives. AI flags it as a suspected fake debt, money is reserved and never paid, and the figures are struck through and corrected in place.
6. A clearly labelled date control moves to the end of the claim window. The final batch pays all heirs.
7. The final accounting is built from PayPal's own records, each line carrying a PayPal ID.

### Roles
- **PayPal:** Orders (create, approve, capture), Payouts (batches, item status), Balances (funds check), Transaction Search (accounting), Webhooks, negative testing, JS SDK v6.
- **Agent Toolkit:** only for read-only agent tools, and only named in Built With if it passes a real test.
- **Hosted MCP:** not used. It was still reported broken on 4 Nov.
- **AI (Gemini):**
  - Reader: extracts facts and quotes from documents.
  - Triage: classes each claim as valid, needs proof, time-barred or suspected fake.
  - Clerk: picks the next action from a fixed list, with amounts always coming from the engine.
- **Removal test:** without PayPal it's only advice and no money moves. Without AI nobody reads the letters and the engine has no inputs.
- **Bryntum Scheduler Community:** the money timeline, one row per person, showing claim windows and payouts. [Version 8.0.0, MIT](https://registry.npmjs.org/@bryntum/scheduler-community/latest). Whether Community qualifies for the prize is unstated, so I'll draft a Discord question for sir's approval.
- **APIMatic Context Plugin:** installed at the start so Claude Code really uses it while building. Only claimed if that's true.

### Agent limits (requirement 3)
- Auto-pay only for Class 1 administration costs, at most $500 per item and $1,000 per day.
- Everything else needs Dana's approval.
- Duplicate protection: a unique ledger key in the database, a deterministic `sender_batch_id` (PayPal [rejects repeats for 30 days](https://developer.paypal.com/docs/payouts/standard/integrate-api/customize/)) and `PayPal-Request-Id` on orders.
- The ledger is append-only, and every agent action is logged with its reason.

### Failure handling (requirement 4)
A visible "Fault drill" panel, with each drill labelled as simulated.

| Case | How it's triggered | What the product does |
|---|---|---|
| Buyer cancels | Closes the PayPal approval | Car returns to the estate, plan recalculates |
| Capture fails | `PayPal-Mock-Response` | Order flagged, no credit given, retry offered |
| Payout fails | [`ERRPYO` test values](https://developer.paypal.com/docs/payouts/standard/integrate-api/test-and-go-live) | Item stays owed, nothing marked paid |
| Model error or rate limit | Forced error or real 429 | Saved reading for seeded documents, manual entry for uploads, **money stays held** |
| Prompt injection in a letter | Seeded letter | Ignored, and logged as suspicious |

### Hosted demo limits (requirement 5)
- **Access:** open the URL and get a fresh seeded estate. No sign-up. Sandbox buyer logins go in the testing instructions.
- **AI cost:** $0 by construction, because the Google project has no billing. [Limits are per project](https://aistudio.google.com/docs/rate-limits), which is why it needs its own. A cap still applies: 2 live reads per visitor and a daily total.
- **Live payouts:** a capped number of sessions per day, plus a floor on the sandbox balance.
- **Past a cap:** replays the last real run, labelled as a replay, with its real PayPal IDs.
- **Privacy:** a notice says not to upload real documents. Free-tier inputs may be used by Google (to confirm in the terms). Visitor IPs are stored only as hashes.

## Look (requirement 8)
Derived from a court accounts ledger: ruled lines rather than cards, with corrections struck through and never erased.

| Role | Value |
|---|---|
| Ink | `#14231F` |
| Paper (cool, not cream) | `#F3F5F2` |
| Rule lines | `#BCC8C2` |
| Paid | `#1E7A5A` |
| Held | `#C08A1E` |
| Stop | `#8E2B36` |

- **Type roles:** Newsreader for headings and the deceased's name, IBM Plex Sans for interface text, IBM Plex Mono with tabular figures for amounts and PayPal IDs.
- **Motion:** only one effect, the strike-through correction.
- **Branding:** no PayPal blue or logo. Text says "via PayPal sandbox". All names are fictional, with no real company marks.

## Stack and files
Next.js and TypeScript on Vercel (free), Neon Postgres (free, no card), `@google/genai`, Zod, Vitest, Playwright for local end-to-end runs.

```
projects/paypal-ai-hack/
  PLAN.md  DEMO.md  features.json  progress.md  README.md  LICENSE (MIT)  .env.example
  lib/engine/     rules-fl.ts, plan.ts   pure code, no network, cites a statute for every block
  lib/ai/         reader.ts, triage.ts, clerk.ts, fallback.ts
  lib/paypal/     client.ts, orders.ts, payouts.ts, reporting.ts, webhooks.ts
  lib/ledger/     append-only store, idempotency keys, agent log
  lib/limits/     per-visitor limits, daily caps, replay switch
  app/            estate/ page, api/ routes, webhook route, fault drill
  components/     Ledger, MoneyTimeline (Bryntum), ReadingPane, ApprovalBar, PayButton
  fixtures/       fictional will, statement and letters, plus saved readings
  tests/          engine, ledger, limits, AI validation, e2e
  docs/evidence/  verification proof
```

**Main interfaces**
- `planEstate(facts, claims, asOf) -> { safeNow, reserves, perHeir, blocks[] }`, with each block carrying its citation.
- `readDocument(file) -> Facts | AiUnavailable`. Quotes must appear in the document text or the fact is marked unverified.
- `triageClaim(claim, facts) -> { class, reasons }`, which contains no amount field.
- `nextAction(event) -> one allowed action + reason`
- `payBatch(ledgerEntryId, items)`, `createOrder`, `captureOrder`, `getBalances`, `searchTransactions`, `verifyWebhook`

## Schedule (IST)

| Phase | When | Done means |
|---|---|---|
| **0. Go/no-go** | Thu 5–Fri 6 Nov | Real order, capture and payout from sir's account; DEMO.md written |
| 1. Engine | Fri 6 | Florida rules and demo scenario pass tests; attorney rule checked |
| 2. Ledger and payouts | Fri 6–Sat 7 | The stop moment works with real payouts and approvals |
| 3. Reader and agent | Sat 7 | Live document read, validation, injection test, fallback |
| 4. Checkout | Sat 7–Sun 8 | Car buyout on SDK v6, cancel, capture failure, webhooks |
| 5. Deployed | **Sun 8, 23:59** | Timeline, limits and replay live; full run in a fresh browser |
| Second entry decision | Mon 9, 12:00 | Fault Line only if the main entry is done and sir approves |
| 6. Polish | Mon 9–Wed 11 | Accounting page, README, red team, APIMatic evidence |
| Freeze | **Wed 11, 12:00** | Features stop |
| 7. Video | **Wed 11, 23:59** | Finished; sir uploads it as Public |
| 8. Evidence | Thu 12, 18:00 | All checks shown; sir submits |

**Phase 0 steps**
1. Sir creates the PayPal developer account, a US sandbox business account (the estate) and US personal accounts (heirs).
2. Sir pastes keys into `.env` himself. I never go looking for keys.
3. Test order, approve, capture.
4. Test a Payouts batch, Balances, Transaction Search (a new token can take up to 9 hours) and the maximum sandbox balance.

**Stop rule:** if sign-up or sandbox access fails from India, I tell sir at once and draft a Discord post for his approval.

**If Payouts fail:** fall back to Dana approving each payment in PayPal Checkout with the heir as payee. It's slower but still real money movement in the sandbox.

Each phase is tested and committed, staging named paths only. The leak-checker runs before every push. The repo stays private until sir approves making it public. `features.json` and `progress.md` let a fresh session resume.

**Graphify:** I'll remind sir once the repo exists and offer to run it.

## Risks

| Risk | Plan |
|---|---|
| Payouts blocked in sandbox | Tested first, with the fallback above |
| "Why PayPal, not an estate bank account?" | Heirs abroad, instant receipts. State the real-world gap openly in the README |
| Wrong law | One state only, every rule cited and tested, "not legal advice" on screen |
| Free-tier AI limits hit during judging | Saved readings, caps and replay keep the demo usable |
| Sandbox balance drains by 15 Dec | Balance floor and capped sessions switch to replay; maximum balance tested in Phase 0 |
| Bryntum Community not eligible | Ask on Discord; the timeline still helps Design |
| Scope creep | DEMO.md decides. Anything the video doesn't show is cut |
| Video trademark question | Recheck the forum before filming. PayPal is named as organisers advise, with no other company's marks |

## Demo script (2:50 target; full voiceover in DEMO.md)

| Time | Shot | Point |
|---|---|---|
| 0:00 | Dana's kitchen table of letters, then the ledger | "Your mother died in March. You're the executor. You could end up paying for a mistake with your own money." |
| 0:12 | She tries to pay Tom $62,000 | **Blocked**, with the reason and the statute |
| 0:25 | Safe amount approved | Real payout, with its PayPal ID shown |
| 0:40 | Documents being read | AI quotes highlighted in the source |
| 1:05 | Timeline and payment order | Who is paid first and why |
| 1:20 | Tom buys the car in PayPal Checkout | Real capture, his share adjusts |
| 1:40 | New letter arrives | Suspected fake debt, injection ignored, figures struck through |
| 2:00 | Fault drill, labelled | Failed capture, AI down: money stays held |
| 2:15 | Labelled date jump, final batch | All heirs paid; sandbox activity shown |
| 2:30 | Final accounting | Built from PayPal records |
| 2:40 | Close | Who it's for, built with PayPal and Gemini, hosted URL |

## End-to-end check (sir's verification list)
Evidence goes to `docs/evidence/`.
1. Full run on the hosted URL in a fresh browser, with matching transactions in the sandbox.
2. Every failure case triggered on purpose, with results.
3. Spend limits exceeded on purpose, using free routes, and the fallback run with AI unavailable. Guards are tested without spending.
4. Clean clone run from the README alone.
5. Licence showing on the GitHub page, and a clean leak-checker result.
6. Video under 3:00, Public, and every claim checked against the running build.
7. Live rules and submission form checked item by item.

Tests are never edited to pass. Anything that can't be made to work is cut and reported.

## Finish
Deployed app, public-ready repo, video script with voiceover and shot list, Devpost text, evidence. **I stop there.** Sir approves going public, uploads the video and submits.
