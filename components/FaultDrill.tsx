"use client";

export interface Drills {
  failNextPayout: boolean;
  declineNextCapture: boolean;
  aiOff: boolean;
}

/** Every failure here is simulated and labelled. PayPal's own negative testing values drive the first two. */
export function FaultDrill({ drills, onChange }: { drills: Drills; onChange: (d: Drills) => void }) {
  const toggle = (key: keyof Drills) => onChange({ ...drills, [key]: !drills[key] });
  return (
    <section aria-labelledby="drill-heading">
      <div className="section-head">
        <h2 id="drill-heading">Fault drill</h2>
        <span className="simulated">Simulated failures</span>
      </div>
      <p className="section-note">Try what happens when things go wrong. In every case, money stays where it is and nothing is marked paid.</p>
      <div className="drills">
        <label className="drill"><input type="checkbox" checked={drills.failNextPayout} onChange={() => toggle("failNextPayout")} /> Make the next heir payout fail</label>
        <label className="drill"><input type="checkbox" checked={drills.declineNextCapture} onChange={() => toggle("declineNextCapture")} /> Decline the car payment at capture</label>
        <label className="drill"><input type="checkbox" checked={drills.aiOff} onChange={() => toggle("aiOff")} /> Turn the AI off</label>
      </div>
    </section>
  );
}
