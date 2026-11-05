import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Shell } from "@/components/Shell";
import { buildAccounting } from "@/lib/accounting";
import { longDate, usd } from "@/lib/ledger/describe";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Final account, Last Accounts" };

const PAGES = [
  { href: "/", label: "The estate" },
  { href: "/accounting", label: "Final account" },
  { href: "/replay", label: "Replay of a real run" },
];

export default async function AccountingPage() {
  const workspace = (await cookies()).get("la_workspace")?.value;
  const account = workspace ? await buildAccounting(workspace) : null;

  return (
    <Shell nav={PAGES}>
      {!account || account.lines.length === 0 ? (
        <header className="hero">
          <h1 className="headline"><span>Final account.</span> <mark>Nothing has moved yet.</mark></h1>
          <p className="hero-meta">Pay someone on the estate page, and each payment will be read back from PayPal here.</p>
        </header>
      ) : (
        <>
          <div className="topbar">
            <p className="today">
              As of <strong>{longDate(account.asOf)}</strong>
              {account.simulatedDate && <span className="simulated">Simulated date</span>}
            </p>
          </div>
          <header className="hero">
            <p className="hero-meta">Final account for the estate of {account.decedent}, for Dana&apos;s lawyer to review. Every line below was read back from PayPal just now.</p>
            <h1 className="headline">
              <span>{usd(account.totals.outCents)} paid out.</span>{" "}
              <mark>{account.allMatch ? "Every line matches PayPal." : "Some lines don't match PayPal yet."}</mark>
            </h1>
            <dl className="totals" aria-label="Totals from PayPal">
              <div><dt>Paid out</dt><dd className="figure">{usd(account.totals.outCents)}</dd></div>
              <div><dt>Received</dt><dd className="figure">{usd(account.totals.inCents)}</dd></div>
              <div><dt>PayPal fees</dt><dd className="figure">{usd(account.totals.feesCents)}</dd></div>
              <div className="safe"><dt>Left in the estate</dt><dd className="figure">{usd(account.totals.cashLeftCents)}</dd></div>
            </dl>
          </header>
          <section>
            <table className="ledger">
              <thead>
                <tr><th>To or from</th><th className="num">Ledger</th><th className="num">PayPal</th><th className="num hide-sm">Fee</th><th>PayPal ID</th><th>Status</th></tr>
              </thead>
              <tbody>
                {account.lines.map((l, i) => (
                  <tr key={`${l.paypalId}-${i}`}>
                    <td>{l.kind === "in" ? "From " : "To "}{l.who}</td>
                    <td className="num">{usd(l.ledgerCents)}</td>
                    <td className="num">{l.paypalCents === null ? "Not read" : usd(l.paypalCents)}</td>
                    <td className="num hide-sm">{usd(l.feeCents)}</td>
                    <td className="id">{l.paypalId ?? "None yet"}</td>
                    <td><span className={l.matches ? "badge paid" : "badge held"}>{l.paypalStatus.toLowerCase()}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
      <footer className="foot"><p>A hackathon demo for use alongside a lawyer. It isn&apos;t legal advice, and the people in it don&apos;t exist.</p></footer>
    </Shell>
  );
}
