"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";

type User = {
  id: string;
  email: string;
  name: string | null;
};

type AuthMode = "login" | "register";
type AuthField = "name" | "email" | "password";
type AuthFieldErrors = Partial<Record<AuthField, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const maybeError =
      payload && typeof payload === "object" && "error" in payload
        ? (payload as { error?: string })
        : null;
    throw new Error(maybeError?.error ?? `Request failed with ${response.status}`);
  }
  return payload;
}

function validateField(
  mode: AuthMode,
  field: AuthField,
  form: { name: string; email: string; password: string },
): string | undefined {
  if (field === "name") {
    if (mode !== "register") return undefined;
    if (!form.name.trim()) return "Name is required.";
    return undefined;
  }

  if (field === "email") {
    if (!form.email.trim()) return "Email is required.";
    if (!EMAIL_PATTERN.test(form.email.trim())) return "Enter a valid email address.";
    return undefined;
  }

  if (!form.password) return "Password is required.";
  if (form.password.length < 8) return "Password must be at least 8 characters.";
  return undefined;
}

function validateForm(
  mode: AuthMode,
  form: { name: string; email: string; password: string },
): AuthFieldErrors {
  return {
    name: validateField(mode, "name", form),
    email: validateField(mode, "email", form),
    password: validateField(mode, "password", form),
  };
}

function getSummaryItems(fieldErrors: AuthFieldErrors, apiError: string | null): string[] {
  const items = Object.values(fieldErrors).filter(
    (message): message is string => Boolean(message),
  );
  if (apiError) items.push(apiError);
  return items;
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
  const [apiError, setApiError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [form, setForm] = useState({ name: "", email: "", password: "" });

  useEffect(() => {
    void (async () => {
      try {
        const result = (await callApi("/api/auth/me", { method: "GET" })) as {
          user: User;
        };
        setUser(result.user);
      } catch {
        setUser(null);
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  function setFieldValue(field: AuthField, value: string) {
    const nextForm = { ...form, [field]: value };
    setForm(nextForm);
    setApiError(null);

    if (attemptedSubmit || fieldErrors[field]) {
      setFieldErrors((current) => ({
        ...current,
        [field]: validateField(mode, field, nextForm),
      }));
    }
  }

  function validateSingleField(field: AuthField) {
    setFieldErrors((current) => ({
      ...current,
      [field]: validateField(mode, field, form),
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setApiError(null);
    setAttemptedSubmit(true);

    const validationErrors = validateForm(mode, form);
    setFieldErrors(validationErrors);
    const hasValidationErrors = Object.values(validationErrors).some(Boolean);
    if (hasValidationErrors) return;

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
      setApiError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const summaryItems = getSummaryItems(fieldErrors, apiError);

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
        <div className="auth-layout">
          <div className="auth-card auth-card--primary">
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
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-layout">
        <div className="auth-card auth-card--primary">
          <p className="eyebrow">Love Concierge</p>
          <h1>{mode === "register" ? "Create Account" : "Welcome Back"}</h1>
          <p className="auth-subtitle">
            {mode === "register"
              ? "Sign up to start planning your perfect Valentine."
              : "Sign in to continue where you left off."}
          </p>

          {summaryItems.length > 0 && (
            <div className="auth-error-summary" role="alert" data-testid="auth-error-summary">
              <p>Fix the following to continue:</p>
              <ul>
                {summaryItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          <form
            className="auth-form"
            onSubmit={handleSubmit}
            data-testid={`auth-${mode}-form`}
            noValidate
          >
            {mode === "register" && (
              <div className="flow-form-field">
                <label className="flow-label auth-label" htmlFor="auth-name">
                  Name
                </label>
                <input
                  id="auth-name"
                  data-testid="auth-name"
                  placeholder="Your name"
                  value={form.name}
                  disabled={loading}
                  onBlur={() => validateSingleField("name")}
                  onChange={(e) => setFieldValue("name", e.target.value)}
                  aria-invalid={Boolean(fieldErrors.name)}
                  aria-describedby={fieldErrors.name ? "auth-name-help auth-name-error" : "auth-name-help"}
                />
                <p id="auth-name-help" className="auth-help">
                  Use the name you want shown across your flows.
                </p>
                {fieldErrors.name && (
                  <p id="auth-name-error" className="auth-field-error" data-testid="auth-name-error">
                    {fieldErrors.name}
                  </p>
                )}
              </div>
            )}

            <div className="flow-form-field">
              <label className="flow-label auth-label" htmlFor="auth-email">
                Email
              </label>
              <input
                id="auth-email"
                data-testid="auth-email"
                type="email"
                placeholder="you@example.com"
                required
                value={form.email}
                disabled={loading}
                onBlur={() => validateSingleField("email")}
                onChange={(e) => setFieldValue("email", e.target.value)}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? "auth-email-help auth-email-error" : "auth-email-help"}
              />
              <p id="auth-email-help" className="auth-help">
                We&apos;ll use this for sign in and session recovery.
              </p>
              {fieldErrors.email && (
                <p id="auth-email-error" className="auth-field-error" data-testid="auth-email-error">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            <div className="flow-form-field">
              <label className="flow-label auth-label" htmlFor="auth-password">
                Password
              </label>
              <div className="auth-password-row">
                <input
                  id="auth-password"
                  data-testid="auth-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Min 8 characters"
                  required
                  minLength={8}
                  value={form.password}
                  disabled={loading}
                  onBlur={() => validateSingleField("password")}
                  onChange={(e) => setFieldValue("password", e.target.value)}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={
                    fieldErrors.password
                      ? "auth-password-help auth-password-error"
                      : "auth-password-help"
                  }
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  data-testid="auth-password-toggle"
                  onClick={() => setShowPassword((current) => !current)}
                  disabled={loading}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <p id="auth-password-help" className="auth-help">
                Use at least 8 characters.
              </p>
              {fieldErrors.password && (
                <p
                  id="auth-password-error"
                  className="auth-field-error"
                  data-testid="auth-password-error"
                >
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <button type="submit" disabled={loading} data-testid="auth-submit">
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

        <aside className="auth-side-panel" aria-label="Auth guidance">
          <p className="eyebrow">Quick Start</p>
          <h2>{mode === "register" ? "What you unlock" : "Pick up where you left off"}</h2>
          <ul>
            <li>Guided flows with focused steps</li>
            <li>Saved outputs and reusable partner context</li>
            <li>Faster retries with built-in flow history</li>
          </ul>
        </aside>
      </div>
    </div>
  );
}
