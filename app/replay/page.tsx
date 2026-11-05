import type { Metadata } from "next";
import { ReplayView } from "@/components/ReplayView";

export const metadata: Metadata = { title: "Replay of a real run, Last Accounts" };

export default function ReplayPage() {
  return <ReplayView />;
}
