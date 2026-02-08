import { Dashboard } from "@/components/dashboard";
import { redirect } from "next/navigation";

export default function DashboardPage() {
  if (process.env.NODE_ENV === "production") {
    redirect("/");
  }

  return (
    <main className="app-shell">
      <Dashboard />
    </main>
  );
}
