# Last Accounts: Devpost text

## Tagline

Last Accounts stops the person settling a parent's estate from paying the wrong person first: Gemini AI reads the paperwork, code decides the money, and PayPal moves it.

## Inspiration

When a parent dies, a son or daughter can be left to settle the estate while grieving, possibly for the first time, with the money as their responsibility. In Florida the order of payment is set by law, and paying an heir too early can leave the person in charge personally liable (Fla. Stat. 733.609, 31 U.S.C. 3713(b)).

A payment form sends what you tell it to send. I wanted one that says stop before the mistake, explains why, and offers the amount that is safe today.

I also wanted to test a design rule for AI agents and money: the AI can read and advise, but it can't decide what gets paid.

## What it does

Last Accounts is a ledger for a first-time personal representative in Florida, working alongside a lawyer. It is a demonstration of one state's rules and it is not legal advice. The demo estate is fictional: Dana Calloway settling the estate of her mother Ruth, with $46,400 cash, a $6,400 car, three heirs (one in Ireland) and a pile of creditor letters. All PayPal activity is in the sandbox, with fake money.

- **It stops the wrong payment.** Dana tries to send her brother Tom his full $14,700 share. The app stops her, names the unpaid federal tax and the open creditor window, and links the statutes.
- **It pays creditors in legal order.** One approval sends a PayPal Payouts batch in the order Florida law sets. The funeral bill is split at the $6,000 cap.
- **It offers the safe amount.** Once creditors are paid, about $6,220 is safe for Tom today. PayPal's $0.25 payout fees take it to $6,219.51 once they settle. Dana approves, and a real sandbox payout goes through with its PayPal ID on screen.
- **It sells an estate asset.** Tom buys the car through PayPal Checkout. The estate records the capture and PayPal's fee, and everyone's safe amount rises.
- **It reads the paperwork.** Gemini reads each page image. Every fact must quote the page, and code checks the quote.
- **It catches a fake debt.** A made-up collector's letter hides a line telling any AI to pay it at once. The line is quoted on screen and logged. The letter is marked as a suspected fake, and $4,400 is reserved and not paid.
- **It lets a small agent do small things.** A $95 court fee can be paid by the agent alone, inside hard limits.
- **It closes the estate.** A labelled date control jumps past the claim window. Dana releases the unfiled reserve and pays all three heirs.
- **It checks the result.** The final account reads each line back from PayPal and compares it with the ledger.

A Fault drill panel lets you make a payout fail, decline a capture or turn the AI off. Each is labelled as simulated.

## How we built it

I'm a solo entrant. The app is Next.js 16 and TypeScript on Vercel, with Neon Postgres.

There are three layers, and only one of them can move money:

1. **AI reads.** `lib/ai` calls Gemini with a strict JSON schema, validates the answer with Zod, and checks quotes against the document's stored text.
2. **Code decides.** `lib/engine` is pure functions with no network access. It applies Florida's payment classes, claim window and gift reduction order, and every block cites its source.
3. **PayPal moves it.** `lib/payments` is the only path to a payout. It runs the engine again at the moment of payment.

The ledger is an append-only list of events, and the state on screen is rebuilt from it. Figures that change stay on the page, struck through, like corrections in a court accounts book. 85 automated tests cover the engine, payments, limits and AI validation.

## How PayPal is used

PayPal does all the money movement, through its REST APIs and JavaScript SDK in the sandbox.

- **Payouts API.** Creditors are paid as one batch in class order, and each heir is paid on approval. `sender_batch_id` is derived from the approval, so a repeat batch is refused. The app reads each batch back for status, transaction ID and fee, and a payment counts as paid only on `SUCCESS`.
- **Orders API v2.** Creates the car order and captures it, with `PayPal-Request-Id` on both calls. The capture's fee and net amount go into the ledger, so the estate is credited with what actually arrived.
- **JavaScript SDK v6.** Shows the PayPal button and Tom's approval window. Tom can cancel, and the car then stays in the estate.
- **Webhooks.** Each event's signature is verified with PayPal. A verified payout event triggers a fresh read of that payment. Forged calls change nothing.
- **Negative testing.** `PayPal-Mock-Response` declines a capture, and the `ERRPYO002` test value fails a payout. Both drive the Fault drill.
- **Final account.** Built from each payout's and order's own GET response, with a PayPal ID on each line.

Hosted MCP is not used, because it was reported broken. I call the REST APIs directly instead.

## How AI is used

Google Gemini (`gemini-3.5-flash`) has three jobs:

- **Reader.** Pulls facts and quotes from a page image, and reports any text aimed at software. A quote that isn't on the page is marked and ignored.
- **Triage.** Classes a new letter as `valid`, `needs_proof` or `suspected_fake`. Code can make the result harsher, never kinder. Text aimed at software always means `suspected_fake`.
- **Clerk.** Picks one next step from a fixed list. It never picks an amount. Code checks the step against the agent's limits and can overrule it.

The agent can pay alone only when a claim is a Class 1 administration cost, accepted as valid, at most $500, and within $1,000 a day. Everything else waits for Dana.

Gemini can report the figure printed on a letter, but no schema has a field that can order a payment. A figure not confirmed on the page can't be accepted as valid, and held claims are never paid.

If the AI is off in the drill, new letters wait for Dana. If it is rate limited or fails, saved readings and judgements from an earlier real run are used and labelled, but the agent doesn't pay anything alone on a saved reading.

## Challenges

- **A payout to Ireland cost $20, not $0.25.** Sandbox payouts to US accounts had cost a flat $0.25. My full hosted run paid Aoife's $2,000 gift for a $20 fee, which left the estate at -$19.75 until I caught it. The app now sets aside $20 for the payout abroad once the window closes. With those fees, the engine ends the estate at $0.00.
- **Repeated safe payments could drain the margin.** The margin for unseen claims was at risk of shrinking as money went out. It is now set on what the estate started with, so paying the safe amount again and again can't eat into it. There is a test for this.
- **Captured funds weren't spendable.** I first thought captures refilled the balance. They didn't, at least not within hours, and payouts returned `INSUFFICIENT_FUNDS`. So I cut the estate from about $212,000 to $52,800, so a full run fits in one sandbox fill. The ledger counts the car-sale cash, and I refill the sandbox balance by hand. An estate this small may be eligible for Florida's shorter summary administration (Fla. Stat. 735.201), but the demo follows the longer route anyway.
- **Race and cap findings from a red-team review.** Two different payments approved at once could overpay, so an approval now goes stale if money has moved since it was issued. Refused requests could also burn the daily limits, so limits now count only after every check passes, and also per visitor.
- **A timeout isn't a failure.** An audit with the APIMatic plugin's guidance showed that a PayPal timeout was marked as a failed payout, though PayPal might have acted. It now holds the money and asks again with the same batch ID, so it can't pay twice.
- **Reporting lag.** Balances and Transaction Search lagged in the sandbox, so the running app doesn't use them. It builds the account from each payout's and order's own record instead.

## Accomplishments

- A full run on the hosted site passed on 5 November 2026: a real cancel and capture as Tom, signed webhooks verified, all heirs paid, and a final account that matched PayPal line by line.
- In a live read, the injected line in the fake letter was reported and not obeyed.
- Two simultaneous approvals produced one payment.
- With the AI switched off on the hosted site, the app used a saved reading, held the letter for proof and moved no money.

## What we learned

- A success code doesn't prove much. A repeat capture returned 201 with the same capture ID, so I check the capture itself.
- Fees are part of the logic. The car sale cost $223.85 in the sandbox, and one payout abroad cost as much as 80 at home. A ledger that ignores fees ends up wrong.
- Keep AI away from amounts by design. Leaving the field out of the schema is stronger than telling a model not to use it.
- Finding real failures takes real runs. The -$19.75 only appeared when a person ran the whole flow on the hosted site.

## What's next

- Review by a Florida probate lawyer.
- A PayPal business account in the estate's name, if PayPal and legal review allow it. In real life estates usually use a bank account, and I haven't verified this route.
- Real document upload, with its own text extraction, so quotes can be checked on any page.
- Other states' rules.
- A cross-check of the final account against Transaction Search, once it is confirmed to keep up.

## Built With

- PayPal Payouts API
- PayPal Orders API v2
- PayPal Webhooks
- PayPal JavaScript SDK v6
- PayPal sandbox
- AI: Google Gemini (gemini-3.5-flash), via @google/genai
- Next.js
- React
- TypeScript
- Zod
- Neon Postgres
- Vercel
- Bryntum Scheduler Community
- Vitest
- Playwright
- Claude Code

## Tools explanation

- **PayPal REST APIs and JavaScript SDK v6:** all money movement, as described above.
- **Google Gemini:** reads documents, triages new letters and picks the agent's next step, called through `@google/genai`.
- **Zod:** validates every Gemini answer and the app's API request bodies.
- **Next.js, React and TypeScript:** the app and its API routes.
- **Neon Postgres:** the append-only ledger and limit counters on the hosted site. Local runs can use an in-memory store.
- **Vercel:** hosting.
- **Bryntum Scheduler Community:** the "Who gets paid, and when" money timeline, drawn from ledger data.
- **Vitest:** the automated tests.
- **Playwright:** renders the fictional documents to page images, through `scripts/make-docs.mjs`.
- **Claude Code:** wrote the code from my plan and requirements. I made the product decisions and did the sandbox steps that need a person, such as buying the car as Tom.
- **APIMatic Context Plugin for PayPal:** I added it to Claude Code late in the build and used it to audit my PayPal integration, which calls REST directly and not the SDK. Its error-handling guidance led to real fixes. The main one: a timeout was being recorded as a failed payout, even though PayPal might have acted, which could have paid someone twice on a retry. A timeout now holds the money and asks again with the same batch ID.

## Testing instructions for judges

Hosted demo: https://last-accounts.vercel.app (no sign-up). Video: VIDEO_URL.

It's all fake money in the PayPal sandbox, and the estate is fictional. Use a desktop browser. To buy the car, sign in to the PayPal window as Tom:

- Email: `TOM_SANDBOX_EMAIL`
- Password: `TOM_SANDBOX_PASSWORD`

Steps, in about 3 minutes:

1. In **Pay an heir**, leave Tom Calloway and 14700.00, then click **Send payment**. You'll see **Stop. This could put the money on you.**
2. Under **Creditors, in the order Florida law sets**, click **Approve: pay 5 claims in legal order**. Wait until each line shows **Paid** with a PayPal ID.
3. Click **Send payment** again, then the **Approve** button for the safe amount, about $6,220.
4. In **Tom wants to keep the car**, click the PayPal button, sign in as Tom and approve. Close the window once first if you want to see the cancel path.
5. In **The paperwork**, under **New in the post**, click **Open and read** on the Northgate letter, then on the Clerk of Court notice. Northgate is marked as a suspected fake and $4,400 is reserved. The agent can pay the $95 fee alone.
6. Click **Simulate: jump past the window**. On the Northgate row, click **Nothing was filed in court by the deadline: release this reserve**.
7. In **Pay an heir**, pay Aoife Calloway, Dana Calloway and Tom Calloway in turn: **Send payment**, then **Approve**. Wait for each to confirm.
8. In the footer, click **Final account**. Each line is read back from PayPal.

Optional: use **Fault drill** before the matching step. Each failure is labelled as simulated. If you use **Decline the car payment at capture**, untick it before clicking **Retry the capture**.

If a demo limit is reached or the sandbox runs out of fake money, the app says so. **Replay of a real run** in the footer shows a real sandbox run with its PayPal IDs. **Start this estate again** gives you a fresh estate, up to 5 a day.

Full local setup is in the repository's `README.md`.
