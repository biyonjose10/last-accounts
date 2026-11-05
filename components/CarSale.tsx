"use client";

import { useEffect, useRef, useState } from "react";
import { usd } from "@/lib/ledger/describe";
import type { EstateState } from "@/lib/ledger/state";
import { PaidBadge } from "./Receipt";

declare global {
  interface Window {
    paypal?: {
      createInstance(args: { clientId: string; components: string[] }): Promise<{
        findEligibleMethods(args: { currencyCode: string }): Promise<{ isEligible(method: string): boolean }>;
        createPayPalOneTimePaymentSession(callbacks: {
          onApprove(data: { orderId: string }): Promise<void> | void;
          onCancel(data?: { orderId?: string }): Promise<void> | void;
          onError(error: unknown): void;
        }): { start(options: { presentationMode: string }, order: Promise<{ orderId: string }>): Promise<void> };
      }>;
    };
  }
}

const SDK = "https://www.sandbox.paypal.com/web-sdk/v6/core";

let sdkLoading: Promise<void> | undefined;

/** Loads once. Loading PayPal's script twice makes it register its custom elements twice. */
function loadSdk(): Promise<void> {
  if (window.paypal) return Promise.resolve();
  sdkLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SDK;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("PayPal's checkout couldn't load."));
    document.head.appendChild(script);
  });
  return sdkLoading;
}

export function CarSale({
  state,
  clientId,
  simulateDecline,
  onChange,
  onReceipt,
}: {
  state: EstateState;
  clientId: string;
  simulateDecline: boolean;
  onChange: () => Promise<unknown>;
  onReceipt: (orderId: string) => void;
}) {
  const car = state.facts.otherAssets.find((a) => a.id === "car");
  const captured = state.orders.find((o) => o.status === "captured");
  const failedOrder = [...state.orders].reverse().find((o) => o.status === "capture_failed");
  const lastOrder = state.orders[state.orders.length - 1];

  const box = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "fail"; text: string } | null>(null);
  const [retryOrder, setRetryOrder] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // The latest drill setting, read when PayPal calls back.
  const drill = useRef(simulateDecline);
  drill.current = simulateDecline;
  const refresh = useRef(onChange);
  refresh.current = onChange;
  const showReceipt = useRef(onReceipt);
  showReceipt.current = onReceipt;
  const declines = useRef(0);

  async function capture(orderId: string) {
    const res = await fetch("/api/order/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, drill: drill.current }),
    });
    const json = await res.json();
    if (json.ok) {
      setRetryOrder(null);
      setMessage({ kind: "ok", text: "Payment captured. The estate now holds cash in place of the car." });
      await refresh.current();
      showReceipt.current(orderId);
      return;
    } else {
      setRetryOrder(orderId);
      declines.current += 1;
      const again = declines.current > 1 ? ` Declined again (attempt ${declines.current}).` : "";
      const hint = json.simulated ? " Turn off the decline drill below, then retry." : "";
      setMessage({
        kind: "fail",
        text: `${json.simulated ? "Simulated decline. " : ""}${json.message}. No credit has been given, and the car stays in the estate for now.${again}${hint}`,
      });
    }
    await refresh.current();
  }

  useEffect(() => {
    if (!car || !clientId) return;
    let stopped = false;
    (async () => {
      try {
        await loadSdk();
        const sdk = await window.paypal!.createInstance({ clientId, components: ["paypal-payments"] });
        const methods = await sdk.findEligibleMethods({ currencyCode: "USD" });
        if (!methods.isEligible("paypal")) throw new Error("PayPal isn't available here.");
        const session = sdk.createPayPalOneTimePaymentSession({
          onApprove: async ({ orderId }) => capture(orderId),
          onCancel: async (data) => {
            setMessage({ kind: "fail", text: "Tom cancelled. Nothing was paid, and the car stays in the estate." });
            const id = data?.orderId ?? null;
            if (id) {
              await fetch("/api/order/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: id }) });
            }
            await refresh.current();
          },
          onError: () => setMessage({ kind: "fail", text: "PayPal's window hit a problem. Nothing was paid." }),
        });
        if (stopped || !box.current) return;
        const button = document.createElement("paypal-button");
        button.addEventListener("click", async () => {
          setMessage(null);
          const order = fetch("/api/order", { method: "POST" }).then(async (r) => {
            const j = await r.json();
            if (!r.ok || !j.orderId) throw new Error(j.error ?? "No order");
            return { orderId: j.orderId as string };
          });
          try {
            await session.start({ presentationMode: "auto" }, order);
          } catch {
            setMessage({ kind: "fail", text: "PayPal's window couldn't open. Nothing was paid." });
          }
          order.then(() => refresh.current()).catch(() => {});
        });
        box.current.replaceChildren(button);
        setReady(true);
      } catch (e) {
        setMessage({ kind: "fail", text: (e as Error).message });
      }
    })();
    return () => {
      stopped = true;
    };
    // The SDK only needs setting up once, while the car is unsold.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(car), Boolean(captured), clientId]);

  return (
    <section id="car" aria-labelledby="car-heading">
      <div className="section-head"><h2 id="car-heading">Tom wants to keep the car</h2></div>
      {captured ? (
        <p className="section-note">
          <PaidBadge label="Sold to Tom" onOpen={() => onReceipt(captured.orderId)} /> {usd(captured.grossCents)} paid, {usd(captured.feeCents ?? 0)} PayPal fee, {usd(captured.netCents ?? 0)} reached the estate. Capture <span className="id">{captured.captureId}</span>
        </p>
      ) : (
        <>
          <p className="section-note">
            A car can&apos;t pay a creditor. If Tom buys it at the appraised value of {car ? usd(car.valueCents) : ""} through PayPal, the estate holds cash instead, and everyone&apos;s safe amount rises. Sign in as Tom, using the sandbox login in the instructions.
          </p>
          <div className="row-actions">
            <div ref={box} style={{ minWidth: 240, minHeight: 44 }} aria-label="Pay with PayPal" />
            {!ready && !message && <span className="section-note">Loading PayPal…</span>}
            {retryOrder && (
              <button className="secondary" onClick={() => capture(retryOrder)}>Retry the capture</button>
            )}
          </div>
        </>
      )}
      {message && <div className={`notice ${message.kind}`} role="status" key={message.text}><p>{message.text}</p></div>}
      {!captured && !message && failedOrder && lastOrder?.status === "capture_failed" && (
        <div className="notice fail"><p>The last capture failed: {failedOrder.failure}. No credit was given.</p></div>
      )}
    </section>
  );
}
