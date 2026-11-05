"use client";

export interface Drills {
  failNextPayout: boolean;
  declineNextCapture: boolean;
  aiOff: boolean;
}

const ITEMS: { key: keyof Drills; label: string; note: string }[] = [
  { key: "failNextPayout", label: "Make the next heir payout fail", note: "PayPal's own test value rejects it." },
  { key: "declineNextCapture", label: "Decline the car payment at capture", note: "PayPal's test header declines the payment." },
  { key: "aiOff", label: "Turn the AI off", note: "Letters fall back to saved readings." },
];

/** Every failure here is simulated and labelled. PayPal's own negative testing values drive the first two. */
export function FaultDrill({ drills, onChange }: { drills: Drills; onChange: (d: Drills) => void }) {
  const toggle = (key: keyof Drills) => onChange({ ...drills, [key]: !drills[key] });
  return (
    <section id="drill" aria-labelledby="drill-heading">
      <div className="section-head">
        <h2 id="drill-heading">Fault drill</h2>
        <span className="simulated">Simulated failures</span>
      </div>
      <p className="section-note">Try what happens when things go wrong. In every case, money stays where it is and nothing is marked paid.</p>
      <ul className="switches">
        {ITEMS.map((it) => (
          <li key={it.key}>
            <label className="switch">
              <input type="checkbox" role="switch" checked={drills[it.key]} onChange={() => toggle(it.key)} />
              <span className="track" aria-hidden><span className="knob" /></span>
              <span className="switch-text">
                {it.label}
                <span className="reason">{it.note}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
