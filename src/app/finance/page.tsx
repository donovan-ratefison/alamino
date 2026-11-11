import { Suspense } from "react";
import FinanceDashboard from "@/components/finance/dashboard";
import { Loading } from "@/components/ui";

export default function FinancePage() {
  return <Suspense fallback={<Loading text="Loading financial workspace?" />}><FinanceDashboard /></Suspense>;
}
