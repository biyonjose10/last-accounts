# Last Accounts

Last Accounts stops the person settling a parent's estate from paying the wrong person first. AI (Google Gemini) reads the paperwork, plain code decides who may be paid and how much, and PayPal moves the money.

- **Hosted demo:** https://last-accounts.vercel.app
- **Video:** VIDEO_URL

## The problem

When someone dies, a family member may be named to settle the estate. In Florida that person is the personal representative, and they may never have done it before.

The order of payment is set by law. Costs of running the estate come first, then the funeral up to $6,000, then federal debts, then the last illness, and so on. Heirs come after creditors. Pay an heir too early and the money can run short, and the representative can be personally liable for the loss (Fla. Stat. 733.609, 31 U.S.C. 3713(b)).

Meanwhile a relative is asking for their share, letters keep arriving, and some of those letters may not be genuine.

## Who it's for

A first-time personal representative in Florida who already has a lawyer for the filings and is handling the money themselves. The demo follows Dana Calloway, who is settling the estate of her mother, Ruth. Dana, Ruth, the other heirs, the creditors and the estate are all fictional.

This is a demonstration of one state's rules, for use alongside a lawyer. It is not legal advice.

## Try the hosted demo (about 3 minutes)

**This is fake money.** Everything runs in the PayPal sandbox. The code refuses to start a PayPal call against any host other than a sandbox one.

You need a desktop browser and this sandbox login for Tom, the brother who buys the car:

- Email: `TOM_SANDBOX_EMAIL`
- Password: `TOM_SANDBOX_PASSWORD`

Steps:

1. Open https://last-accounts.vercel.app. There is no sign-up. You get your own fictional estate. The totals read: **Cash in the estate** $46,400.00, **Owed to creditors** $21,400.00, **Held back** $10,560.00, **Safe to distribute today** $14,440.00.
2. In **Pay an heir**, leave **Who** on Tom Calloway. **Amount, USD** is filled in with his full share, 14700.00. Click **Send payment**.
3. A red panel opens: **Stop. This could put the money on you.** It names the unpaid US Treasury claim and the creditor window, open until December 1, 2026, and links each statute. It also says nothing can safely go to Tom yet.
4. Under **Creditors, in the order Florida law sets**, click **Approve: pay 5 claims in legal order**. This sends one sandbox Payouts batch for $21,400. Wait a few seconds until each line shows **Paid** with a PayPal transaction ID. The funeral home appears twice: $6,000 in Class 2 and the $2,240 above the cap in Class 8.
5. Click **Send payment** again. The panel now offers an approval for the safe amount, **Approve $6,219.51 to Tom Calloway**. That is $6,220 less the PayPal fees on the creditor payouts (five at $0.25). If you click before those fees settle, it shows $6,220.00. Approve it. This is a real sandbox payout, and its ID appears under **Latest payment**.
6. Look at **Who gets paid, and when**, the money timeline. Each row is a person or creditor, and each bar comes from the ledger.
7. In **Tom wants to keep the car**, click the PayPal button and sign in as Tom. Close the PayPal window once if you want to see the cancel path: *Tom cancelled. Nothing was paid, and the car stays in the estate.* Then buy it. The section changes to **Sold to Tom.**, with the amount paid, PayPal's fee, what reached the estate and the capture ID. Figures that changed stay on the page, struck through.
8. In **The paperwork**, click **Read** beside the will. Gemini reads the page image. Each fact shows its quote, tagged **On the page** or **Not on the page, ignored**.
9. Under **New in the post**, click **Open and read** beside the Northgate Recovery Partners demand letter. You should see **This letter tries to instruct software.**, with the hidden line quoted, and *Suspected fake. $4,400.00 reserved, and not paid.*
10. Click **Open and read** beside the Clerk of Court notice. This is the agent's one job with money: if the $95 fee is accepted, it is paid without approval. **The record** shows it as *Paid under its limits*.
11. Near the top, click **Simulate: jump past the window**. The date moves to December 2, 2026 and is labelled **Simulated date**. On the Northgate row, click **Nothing was filed in court by the deadline: release this reserve**.
12. In **Pay an heir**, choose Aoife Calloway, click **Send payment**, then **Approve $2,000.00**. Do the same for Dana Calloway and Tom Calloway, waiting for each to confirm. If cents have moved because a fee settled, the panel offers the exact safe amount instead.
13. In the footer, click **Final account**. Every line is read back from PayPal at that moment and compared with the ledger.

To try the failures, use **Fault drill**. Each one is labelled as simulated.

- Tick **Make the next heir payout fail**, then pay an heir. The row shows **Failed, still owed**.
- Before buying the car, tick **Decline the car payment at capture**, then buy it. No credit is given. Untick the box, then click **Retry the capture**.
- Tick **Turn the AI off**, then read a document. A saved reading is shown, and a new letter is held for Dana.

The footer also has **Start this estate again** and **Replay of a real run**.

## How it works

**AI reads the paper, code decides the money, PayPal moves it.**

1. **AI reads.** Gemini reads an image of each fictional document and returns structured facts. Each fact must carry a quote, and code checks the quote against the document's stored text.
2. **Code decides.** A pure function (`lib/engine/plan.ts`) works out what is owed, what is reserved and what is safe today. Every block it raises cites its source. The check runs again at the moment of payment, so an old approval can't get past it.
3. **PayPal moves it.** Approved payments go out through Payouts. A payment counts as paid only when PayPal's own record says `SUCCESS`.

### The rules the engine applies

| Rule | Source |
|---|---|
| Payment order, and the $6,000 funeral cap | Fla. Stat. 733.707 |
| Claim window: 3 months from first publication or 30 days from service, whichever is later | Fla. Stat. 733.702 |
| Which gifts are reduced first | Fla. Stat. 733.805 |
| Personal liability for breach of duty | Fla. Stat. 733.609 |
| Personal liability for paying others before the US government | 31 U.S.C. 3713(b) |
| Recipients of improper payments may have to return them | Fla. Stat. 733.812 |

While the window is open the app also holds back 20% of the estate's starting value for claims not yet seen. That margin is my own policy, not law, and the app labels it that way.

### The fictional estate's figures

The estate has $46,400 cash and a $6,400 car, $52,800 in all. Accepted claims total $21,400, which leaves $31,400 for heirs. Aoife gets her $2,000 gift, and Dana and Tom split the rest, so Tom's share shows $14,700. The 20% margin is $10,560, so $14,440 of cash can go to heirs today. After Aoife's $2,000, that leaves $6,220 each for Dana and Tom once creditors are paid.

### Which PayPal capability does what

| PayPal capability | What it does here |
|---|---|
| Orders API v2 | Creates the $6,400 car order and captures it after Tom approves. Reads the order back for the final account. |
| JavaScript SDK v6 | Shows the PayPal button and the buyer approval window for the car. |
| Payouts API | Pays creditors as one batch in legal order and each heir on approval. Reads each batch back for status, transaction ID and fee. |
| Webhooks | Verifies each event's signature with PayPal. A verified payout event triggers a fresh read of that payment. Forged calls change nothing. |
| Negative testing | `PayPal-Mock-Response` declines a capture, and the `ERRPYO002` test value fails a payout, for the Fault drill. |

The final account at `/accounting` is built from each payout's and order's own GET response. I tested the Balances and Transaction Search APIs with `scripts/sandbox-proof.mjs`, but they lagged in the sandbox, so the running app doesn't use them.

### Gemini's three jobs

| Job | What it does | What it can't do |
|---|---|---|
| Reader | Pulls facts and quotes from a page image, and reports any text aimed at software. | Quotes not on the page are marked and ignored. |
| Triage | Classes a new letter as `valid`, `needs_proof` or `suspected_fake`. | Code can make the result harsher, never kinder. Text aimed at software always means `suspected_fake`. A figure that can't be confirmed on the page can't be `valid`. |
| Clerk | Picks one next step from a fixed list: `pay_administration_cost`, `reserve_and_request_proof`, `ask_dana`, `log_only`. | It picks a step, never an amount. Code checks the step against the agent limits and can overrule it. |

Answers must match a Zod schema or they are thrown away. No schema has a field that can order a payment. Gemini does report the figure printed on a letter, but a figure not confirmed on the page goes to `needs_proof`, and held claims are never paid. The default model is `gemini-3.5-flash`.

### Agent limits

The agent can pay without approval only if all of these are true:

- The claim is a Class 1 administration cost.
- Triage accepted it as `valid`.
- It is at most $500.
- It keeps the agent within $1,000 a day. The demo counts every auto-payment in the estate towards this, which is stricter.

Everything else waits for Dana. The limits are plain code in `lib/agent/limits.ts`, so no model output can widen them. Every action goes in an append-only record, shown on the page as **The record**.

### Duplicate protection

- **Ledger key.** Each approval has a unique key, enforced by a unique database index, so a double click pays once.
- **Payouts.** `sender_batch_id` is derived from the approval, so PayPal rejects a repeat batch.
- **Orders.** Create and capture calls carry `PayPal-Request-Id`. A repeat capture returned the same capture ID in my sandbox test, so the code checks the capture itself and not just the success code.
- **Stale approvals.** An approval is tied to the number of money events so far. If two different payments are approved at once, the first wins. The second is undone before PayPal is called, and Dana is told to check the amount again.
- **Retries.** Only calls that are safe to repeat are retried: reads, and writes that carry an idempotency key or a fixed batch ID.

### Failure handling

| What goes wrong | What the app does |
|---|---|
| Tom cancels in PayPal | Order marked cancelled. The car stays in the estate. |
| Capture declined | No credit given. The car stays, and **Retry the capture** is offered. |
| Payout fails, or PayPal later reports it failed or returned | The money is counted back. The item shows **Failed, still owed**. |
| PayPal can't be reached, or gives no clear answer | Nothing is marked paid. The money stays held, and the app asks again with the same batch ID, so it can't pay twice. |
| AI switched off (drill) | A saved reading is shown. New letters become `needs_proof` and wait for Dana. |
| AI rate limited, unreachable or returns a bad answer | The saved reading and judgement from an earlier real run are used and labelled. The agent pays nothing alone on a saved reading, so a letter waits for Dana or stays reserved. |
| Prompt injection in a letter | Quoted on screen and logged. The letter becomes `suspected_fake`, and its amount is reserved. |
| Sandbox balance empty | The app says so, marks nothing paid and links to the replay. |

### Demo limits

These keep the public demo free and working. They live in `lib/limits.ts` and `lib/reading.ts`.

| Limit | Value |
|---|---|
| Fresh estates per visitor per day | 5 |
| Estates that may start moving money, per day, all visitors | 6 |
| Estates that may start moving money, per visitor per day | 3 |
| Live AI reads per estate | 4 |
| Live AI reads per visitor per day | 12 |
| Live AI reads per day, all visitors | 60 |

An estate already moving money may finish. Past the read limits, saved readings from a real run are used. Past the money limits, the app links to `/replay`, a read-only view of a real sandbox run with its real PayPal IDs, labelled as a replay. Visitor IP addresses are stored only as hashes.

## Run it locally from a clean clone

I used Node.js 22.18. You need a free PayPal developer account. A Gemini key is optional.

### 1. Install

```
git clone https://github.com/biyonjose10/last-accounts last-accounts
cd last-accounts
npm ci
cp .env.example .env
```

### 2. Create the sandbox accounts

Log in at https://developer.paypal.com. Go to **Testing Tools > Sandbox Accounts** and create these. Set the country yourself, because the default accounts follow your own country and mine were in India.

| Account | Type | Country | Used for |
|---|---|---|---|
| Estate | Business | US | Sends all payouts and receives the car payment |
| Tom | Personal | US | Heir, and buys the car |
| Dana | Personal | US | Heir |
| Aoife | Personal | Ireland | Heir abroad |
| Creditors | Personal | US | All creditors in the fictional estate share this account |

Open each account to see its email. Tom's email and password are what you type into the PayPal window.

### 3. Create the sandbox app

Go to **Apps & Credentials**, choose **Sandbox** and create an app linked to the Estate account. PayPal refuses the word "account" in app names, so I called mine "Estate Ledger". Copy the client ID and secret into `.env`.

### 4. Fill in `.env`

| Variable | Needed locally? | What it is |
|---|---|---|
| `PAYPAL_CLIENT_ID` | Yes | The sandbox app's client ID. It is sent to the browser for the PayPal button, which is how PayPal designed it. |
| `PAYPAL_CLIENT_SECRET` | Yes | The sandbox app's secret. Stays on the server. |
| `PAYPAL_API_BASE` | Yes | Leave it as `https://api-m.sandbox.paypal.com`. Don't blank it. The app refuses any host that isn't under `.sandbox.paypal.com`. |
| `SANDBOX_HEIR_TOM_EMAIL` | Yes | Tom's sandbox email. |
| `SANDBOX_HEIR_DANA_EMAIL` | Yes | Dana's sandbox email. |
| `SANDBOX_HEIR_NIECE_EMAIL` | Yes | Aoife's sandbox email. |
| `SANDBOX_CREDITOR_EMAIL` | Yes | The Creditors sandbox email. |
| `GEMINI_API_KEY` | No | Key from Google AI Studio. Use a new project with no billing, not a shared key. Without it, the app uses the saved readings in `fixtures/readings/`. |
| `DATABASE_URL` | No | Neon Postgres connection string. Leave it empty and the app uses an in-memory store. With it, tables are created on first use. |
| `PAYPAL_WEBHOOK_ID` | No | ID from the webhook script below. Without it, `/api/webhook` returns 503. PayPal can't reach localhost anyway, and the page reads PayPal's status every 4 seconds while a payment is unfinished. |
| `SESSION_SECRET` | No | Any long random string, used to hash visitor IP addresses. Falls back to a fixed value if empty. |

`GEMINI_MODEL` isn't in `.env.example`. Set it only to override `gemini-3.5-flash`.

Never put live PayPal credentials here.

### 5. Fund the Estate account

Go to **Testing Tools > Sandbox Accounts > Estate** and click the pencil beside **PayPal balance**. The form refuses $100,000 or more, so enter something under that, such as 99000.

A full run spends about $46,400 of the sandbox balance, so one fill gives about two full runs. Do this again when payouts return `INSUFFICIENT_FUNDS`. Dashboard sessions expire quickly, so you may need to log in again.

### 6. Check the keys, then run

```
node --env-file=.env scripts/sandbox-proof.mjs token
npm run dev
```

The first command prints your app's relevant scopes. Look for a line containing `payouts`. If there isn't one, turn on Payouts in the app's settings on the dashboard. The script writes results to `scripts/.proof/`, which is ignored by git.

Open http://localhost:3000 and follow the steps above, using your own Tom login.

With the in-memory store, restarting the server empties the ledger but your browser keeps its estate cookie. After a restart, click **Start this estate again**, so new approvals don't collide with payouts PayPal has already seen.

### Run the tests

```
npm test
npm run typecheck
```

`npm test` runs 85 tests in `tests/`. They call neither PayPal nor Gemini for real, so they need no keys.

### Scripts

**Register the webhook.** It needs a public HTTPS address, so point it at a deployed copy, not localhost. Run it once, then put the ID it prints into `PAYPAL_WEBHOOK_ID`.

```
node --env-file=.env scripts/create-webhook.mjs https://your-app.vercel.app
```

**Record saved readings.** This runs Gemini over each document in `fixtures/docs/` and saves the results in `fixtures/readings/`, for use when the AI is unavailable. It uses about 14 free-tier calls if nothing is recorded. It skips documents that already have a file, and all ten are already in the repo, so delete a file to record it again.

```
npx --yes tsx --env-file=.env scripts/record-readings.ts
```

**Export the replay.** This saves the latest complete run (car captured and date jumped) from the database to `fixtures/replay/run.json`. It needs `DATABASE_URL`, so it doesn't work with the in-memory store. Point `--env-file` at whichever file holds that variable. I keep mine in `.env.local`.

```
npx --yes tsx --env-file=.env.local scripts/export-replay.ts
```

**Deploy (optional).** The hosted copy runs on Vercel with Neon Postgres, with every variable above set in Vercel. It doesn't auto-deploy. Use a real `DATABASE_URL` there, because the in-memory store is meant for local runs and tests.

```
npx --yes vercel@65.5.0 --prod --yes
```

## Honest limits

- **One state.** Only Florida's rules are modelled.
- **Fictional.** The estate, people, firms, debts and documents are invented. Please don't enter real information.
- **A real estate would usually use a bank account.** A production version would need a PayPal business account in the estate's name, plus legal review. I haven't verified that PayPal would allow this.
- **Scale.** I cut the estate from about $212,000 to $52,800 so a full run fits in one sandbox fill. An estate this small may be eligible for Florida's shorter summary administration (Fla. Stat. 735.201, as I read it, $150,000 or less). The demo follows the longer route anyway, with a published notice to creditors.
- **Captured funds weren't spendable.** Money captured in the sandbox did not become spendable balance, at least not within hours. So the ledger counts the car-sale cash, while the sandbox balance is refilled by hand.
- **Fees are observed, not looked up.** The app sets aside $0.25 per US payout and $20 for the payout to Ireland, which is what the sandbox charged on 5 November 2026. Actual fees come from PayPal's records.
- **Fixed documents.** There is no upload. The starting claims and estate figures are seeded from `fixtures/scenario.ts`. Reading the starting documents shows the facts but doesn't change the figures. Only the two letters under **New in the post** add claims from a reading.
- **Quote checks need known text.** Quotes are checked against text stored with each fictional document. Real documents would need their own text extraction.
- **No login.** A cookie identifies each visitor's estate, and whoever holds it acts as Dana.
- **Hosted MCP isn't used.** It was reported broken, so the app calls PayPal's REST APIs directly.
- **Bryntum.** The timeline uses Bryntum Scheduler Community. That edition has no time ranges feature, so the shared band and the Today line are my own elements.

## Licence

MIT. See `LICENSE`.

Built with Claude Code.
