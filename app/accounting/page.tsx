import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { buildAccounting } from "@/lib/accounting";
import { longDate, usd } from "@/lib/ledger/describe";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Final account, Last Accounts" };

export default async function AccountingPage() {
  const workspace = (await cookies()).get("la_workspace")?.value;
  const account = workspace ? await buildAccounting(workspace) : null;

  return (
    <main className="sheet">
      <div className="bar">
        <span><strong>Last Accounts</strong> · <Link href="/">Back to the ledger</Link></span>
        <span className="sandbox-tag">PayPal sandbox. Fictional estate, fake money.</span>
      </div>
      {!account || account.lines.length === 0 ? (
        <header className="masthead"><h1>Final account</h1><p>Nothing has moved in this estate yet.</p></header>
      ) : (
        <>
          <header className="masthead">
            <h1>Final account: estate of {account.decedent}</h1>
            <p>
              Every line below was read back from PayPal just now, for Dana&apos;s lawyer to review.{" "}
              {account.allMatch ? "All lines match the ledger." : "Some lines don't match the ledger yet. See the status column."}
            </p>
            <div className="date-row">
              <span>As of <strong>{longDate(account.asOf)}</strong></span>
              {account.simulatedDate && <span className="simulated">Simulated date</span>}
            </div>
          </header>
          <div className="totals" aria-label="Totals from PayPal">
            <div className="total"><h3>Paid out</h3><span className="figure">{usd(account.totals.outCents)}</span></div>
            <div className="total"><h3>Received</h3><span className="figure">{usd(account.totals.inCents)}</span></div>
            <div className="total"><h3>PayPal fees</h3><span className="figure">{usd(account.totals.feesCents)}</span></div>
            <div className="total safe"><h3>Left in the estate</h3><span className="figure">{usd(account.totals.cashLeftCents)}</span></div>
          </div>
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
                    <td><span className={l.matches ? "state paid" : "state held"}>{l.paypalStatus.toLowerCase()}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
      <footer className="foot"><p>A hackathon demo for use alongside a lawyer. It isn&apos;t legal advice, and the people in it don&apos;t exist.</p></footer>
    </main>
  );
}
