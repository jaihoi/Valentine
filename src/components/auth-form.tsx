"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";

type User = {
  id: string;
  email: string;
  name: string | null;
};

type AuthMode = "login" | "register";

async function callApi(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(payload?.error ?? `Request failed with ${response.status}`);
  }
  return payload;
}

export function AuthForm({
  mode,
  redirectTo = "/",
}: {
  mode: AuthMode;
  redirectTo?: string;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "" });

  useEffect(() => {
    void (async () => {
      try {
        const result = await callApi("/api/auth/me", { method: "GET" });
        setUser(result.user as User);
      } catch {
        setUser(null);
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === "register") {
        await callApi("/api/auth/register", {
          method: "POST",
          body: JSON.stringify(form),
        });
      } else {
        await callApi("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({
            email: form.email,
            password: form.password,
          }),
        });
      }
      window.location.href = redirectTo;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <p className="auth-checking">Checking session...</p>
        </div>
      </div>
    );
  }

  if (user) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h2>Already signed in</h2>
          <p>
            You are signed in as <strong>{user.name ?? user.email}</strong>.
          </p>
          <div className="button-row">
            <Link className="flow-link-button" href="/">
              Go Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <p className="eyebrow">Love Concierge</p>
        <h1>{mode === "register" ? "Create Account" : "Welcome Back"}</h1>
        <p className="auth-subtitle">
          {mode === "register"
            ? "Sign up to start planning your perfect Valentine."
            : "Sign in to continue where you left off."}
        </p>

        {error && <p className="auth-error">{error}</p>}

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "register" && (
            <div className="flow-form-field">
              <label className="flow-label" htmlFor="auth-name">
                Name
              </label>
              <input
                id="auth-name"
                placeholder="Your name"
                value={form.name}
                onChange={(e) =>
                  setForm((s) => ({ ...s, name: e.target.value }))
                }
              />
            </div>
          )}

          <div className="flow-form-field">
            <label className="flow-label" htmlFor="auth-email">
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              placeholder="you@example.com"
              required
              value={form.email}
              onChange={(e) =>
                setForm((s) => ({ ...s, email: e.target.value }))
              }
            />
          </div>

          <div className="flow-form-field">
            <label className="flow-label" htmlFor="auth-password">
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              placeholder="Min 8 characters"
              required
              minLength={8}
              value={form.password}
              onChange={(e) =>
                setForm((s) => ({ ...s, password: e.target.value }))
              }
            />
          </div>

          <button type="submit" disabled={loading}>
            {loading
              ? "Please wait..."
              : mode === "register"
                ? "Create Account"
                : "Sign In"}
          </button>
        </form>

        <p className="auth-switch">
          {mode === "register" ? (
            <>
              Already have an account?{" "}
              <Link href="/login">Sign in</Link>
            </>
          ) : (
            <>
              Don&apos;t have an account?{" "}
              <Link href="/register">Create one</Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
