import { AuthForm } from "@/components/auth-form";

export default function RegisterPage() {
  return (
    <main className="app-shell">
      <AuthForm mode="register" redirectTo="/" />
    </main>
  );
}
