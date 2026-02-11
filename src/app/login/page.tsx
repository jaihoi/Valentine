import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  return (
    <main className="app-shell">
      <AuthForm mode="login" redirectTo="/" />
    </main>
  );
}
