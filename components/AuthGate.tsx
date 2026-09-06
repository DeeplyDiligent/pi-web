"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";

type AuthState = "checking" | "authenticated" | "anonymous";

export function AuthGate() {
  const [state, setState] = useState<AuthState>("checking");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { authenticated?: boolean }) => {
        if (active) setState(body.authenticated ? "authenticated" : "anonymous");
      })
      .catch(() => {
        if (active) {
          setError("Pi Web could not check your session. Refresh the page and try again.");
          setState("anonymous");
        }
      });
    return () => { active = false; };
  }, []);

  const handleLogin = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || !password) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Sign in failed");
      setPassword("");
      setState("authenticated");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Sign in failed");
    } finally {
      setPending(false);
    }
  }, [password, pending]);

  const handleLogout = useCallback(async () => {
    await fetch("/api/logout", { method: "POST" }).catch(() => undefined);
    setState("anonymous");
    setPassword("");
    setError(null);
  }, []);

  if (state === "authenticated") return <AppShell onSignOut={handleLogout} />;

  if (state === "checking") {
    return (
      <main className="auth-page" aria-busy="true">
        <div className="auth-loading" aria-label="Checking session" />
      </main>
    );
  }

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={handleLogin}>
        <div className="auth-mark" aria-hidden="true">π</div>
        <h1>Pi Web</h1>
        <p>Enter the server password to continue.</p>
        <label htmlFor="pi-web-password">Password</label>
        <div className="auth-password-row">
          <input
            id="pi-web-password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            autoFocus
            disabled={pending}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "pi-web-login-error" : undefined}
          />
          <button
            type="button"
            className="auth-show-password"
            onClick={() => setShowPassword((visible) => !visible)}
            disabled={pending}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
        {error && <div id="pi-web-login-error" className="auth-error" role="alert">{error}</div>}
        <button className="auth-submit" type="submit" disabled={pending || !password}>
          {pending && <span className="auth-button-spinner" aria-hidden="true" />}
          {pending ? "Signing in" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
