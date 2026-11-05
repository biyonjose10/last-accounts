"use client";

import { usd } from "@/lib/ledger/describe";
import type { EstateState, PaymentRecord } from "@/lib/ledger/state";
import { PaidBadge, type ReceiptRef } from "./Receipt";

/**
 * The estate's ending: where every dollar went, each payment one click from its receipt.
 * Shown once creditors and family are all paid, in place of the cash bridge.
 */
export function MoneyWent({ state, onOpen }: { state: EstateState; onOpen: (ref: ReceiptRef) => void }) {
  const paid = state.payments.filter((p) => p.status === "paid");
  const creditors = paid.filter((p) => p.target.kind === "claim");
  const family = paid.filter((p) => p.target.kind === "heir");
  const car = state.orders.find((o) => o.status === "captured");
  const sum = (ps: PaymentRecord[]) => ps.reduce((s, p) => s + p.amountCents, 0);
  const fees = paid.reduce((s, p) => s + (p.feeCents ?? 0), 0) + (car?.feeCents ?? 0);
  const left = state.plan.cashCents + state.feeReserveCents;

  const rows = [
    { key: "owed", label: "Creditors, in the order Florida law sets", cents: sum(creditors), items: creditors },
    { key: "safe", label: "The family", cents: sum(family), items: family },
    { key: "fees", label: "PayPal fees", cents: fees, items: [] as PaymentRecord[] },
    { key: "left", label: "Left in the estate", cents: left, items: [] as PaymentRecord[] },
  ];
  const total = rows.reduce((s, r) => s + Math.max(0, r.cents), 0) || 1;

  return (
    <div className="bridge went" role="group" aria-label="Where the money went">
      <div className="bridge-head">
        <h2 className="bridge-title">Where the money went</h2>
        <a className="went-link" href="/accounting">Final account, read back from PayPal</a>
      </div>
      <div className="went-bar" aria-hidden>
        {rows.map((r) => r.cents > 0 && <span key={r.key} className={`went-seg ${r.key}`} style={{ flexGrow: r.cents / total }} />)}
      </div>
      <ul className="went-rows">
        {rows.map((r) => (
          <li key={r.key}>
            <span className={`key ${r.key}`} aria-hidden />
            <span className="went-label">{r.label}</span>
            <span className="money">{usd(r.cents)}</span>
            {r.items.length > 0 && (
              <span className="went-receipts">
                {r.items.map((p) => (
                  <PaidBadge key={p.ledgerId} label={p.target.kind === "heir" ? p.payee.split(" ")[0]! : p.payee.split(",")[0]!} onOpen={() => onOpen({ ledgerIds: [p.ledgerId] })} />
                ))}
              </span>
            )}
          </li>
        ))}
        {car && (
          <li>
            <span className="key in" aria-hidden />
            <span className="went-label">Came in: Tom bought the car</span>
            <span className="money">+{usd(car.netCents ?? car.grossCents)}</span>
            <span className="went-receipts"><PaidBadge label="Car" onOpen={() => onOpen({ orderId: car.orderId })} /></span>
          </li>
        )}
      </ul>
    </div>
  );
}
