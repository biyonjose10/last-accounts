import { EstateApp } from "@/components/EstateApp";

export const dynamic = "force-dynamic";

export default function Page() {
  // A PayPal client ID is designed to be public. The secret never reaches the browser.
  return <EstateApp clientId={process.env.PAYPAL_CLIENT_ID ?? ""} />;
}
