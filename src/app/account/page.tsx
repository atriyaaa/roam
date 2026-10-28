"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const inputStyles =
  "mt-2 w-full rounded-2xl border border-foreground/20 bg-background px-4 py-3 outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/20";

export default function AccountPage() {
  const [supabase] = useState(() => createClient());
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    let authChanged = false;

    const confirmationFailed =
      new URLSearchParams(window.location.search).get("confirmation") === "failed";

    if (confirmationFailed) {
      setError(
        "We couldn’t complete that email confirmation. If you already confirmed your email, try logging in. Otherwise, sign up again to request another confirmation.",
      );
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      authChanged = true;
      setUser(session?.user ?? null);
      setLoading(false);
    });

    async function loadUser() {
      try {
        const { data, error: authError } = await supabase.auth.getUser();

        if (!active || authChanged) return;

        setUser(data.user);

        if (authError && authError.name !== "AuthSessionMissingError") {
          setError("Your session couldn’t be checked. Try refreshing or logging in.");
        }
      } catch {
        if (active && !authChanged) {
          setError("We couldn’t connect to your account. Check your connection.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadUser();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  function switchMode(nextMode: "login" | "signup") {
    setMode(nextMode);
    setPassword("");
    setConfirmPassword("");
    setError("");
    setNotice("");
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setError("");
    setNotice("");

    if (mode === "signup" && password !== confirmPassword) {
      setError("Your passwords don’t match.");
      return;
    }

    setBusy(true);

    try {
      if (mode === "signup") {
        const { data, error: signupError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });

        if (signupError) throw signupError;

        setPassword("");
        setConfirmPassword("");

        if (data.session) {
          setUser(data.user);
          setNotice("Your account is ready.");
        } else {
          setMode("login");
          setNotice(
            "Check your inbox for a confirmation email. Open the link in this browser, then return here to log in. If you already have an account, log in instead.",
          );
        }
      } else {
        const { data, error: loginError } =
          await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });

        if (loginError) throw loginError;

        setUser(data.user);
        setPassword("");
        setNotice("Welcome back.");
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "We couldn’t complete that request. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    if (busy) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const { error: logoutError } = await supabase.auth.signOut({
        scope: "local",
      });

      if (logoutError) throw logoutError;

      setUser(null);
      setPassword("");
      setConfirmPassword("");
      setMode("login");
      setNotice("You’re logged out of this browser.");
    } catch {
      setError("Logout couldn’t finish. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main className="mx-auto max-w-7xl px-6 py-12 lg:px-10">
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_480px] lg:gap-16">
          <section>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-terracotta">
              A home for your adventures
            </p>

            <h1 className="mt-4 max-w-xl text-4xl font-semibold tracking-tight sm:text-6xl">
              Every journey starts with you.
            </h1>

            <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted">
              Your places, your plans, your kind of adventure.
              Give them a home in Roam.
            </p>

            <div className="mt-8 max-w-lg rounded-3xl bg-sky p-6">
              <h2 className="font-semibold">We’re connecting the pieces.</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Accounts are ready in this step. Your existing trips
                still live in this browser. Cloud saving and importing
                those trips are coming next.
              </p>
            </div>
          </section>

          <Card>
            <CardContent className="sm:p-8">
              {loading ? (
                <p role="status" className="text-muted">
                  Checking your account…
                </p>
              ) : user ? (
                <>
                  <p className="text-xs font-bold uppercase tracking-widest text-terracotta">
                    You’re signed in
                  </p>

                  <h2 className="mt-3 text-3xl font-semibold">
                    Welcome to Roam.
                  </h2>

                  <p className="mt-4 break-all text-sm text-muted">
                    {user.email}
                  </p>

                  <div className="mt-7 flex flex-wrap gap-3">
                    <ButtonLink href="/trips">Go to my trips ↗</ButtonLink>

                    <Button
                      variant="secondary"
                      onClick={logout}
                      disabled={busy}
                    >
                      {busy ? "Logging out…" : "Log out"}
                    </Button>
                  </div>

                  <p className="mt-6 text-xs leading-relaxed text-muted">
                    Browser-saved trips aren’t linked to this account
                    yet. Logging out leaves those local trips in this browser.
                  </p>
                </>
              ) : (
                <>
                  <div className="flex gap-2">
                    <Button
                      variant={mode === "login" ? "primary" : "ghost"}
                      onClick={() => switchMode("login")}
                      disabled={busy}
                      aria-pressed={mode === "login"}
                    >
                      Log in
                    </Button>

                    <Button
                      variant={mode === "signup" ? "primary" : "ghost"}
                      onClick={() => switchMode("signup")}
                      disabled={busy}
                      aria-pressed={mode === "signup"}
                    >
                      Sign up
                    </Button>
                  </div>

                  <h2 className="mt-7 text-2xl font-semibold">
                    {mode === "signup"
                      ? "Let’s start your next chapter."
                      : "Good to have you back."}
                  </h2>

                  <form onSubmit={submitAuth} className="mt-6">
                    <fieldset disabled={busy} className="space-y-5">
                      <legend className="sr-only">
                        {mode === "signup" ? "Create an account" : "Log in"}
                      </legend>

                      <div>
                        <label htmlFor="email" className="text-sm font-semibold">
                          Email address
                        </label>
                        <input
                          id="email"
                          type="email"
                          autoComplete="email"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          placeholder="you@example.com"
                          required
                          className={inputStyles}
                        />
                      </div>

                      <div>
                        <label htmlFor="password" className="text-sm font-semibold">
                          Password
                        </label>
                        <input
                          id="password"
                          type="password"
                          autoComplete={
                            mode === "signup" ? "new-password" : "current-password"
                          }
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          minLength={mode === "signup" ? 8 : undefined}
                          required
                          className={inputStyles}
                        />

                        {mode === "signup" && (
                          <p className="mt-2 text-xs text-muted">
                            Use at least eight characters.
                          </p>
                        )}
                      </div>

                      {mode === "signup" && (
                        <div>
                          <label
                            htmlFor="confirm-password"
                            className="text-sm font-semibold"
                          >
                            Confirm password
                          </label>
                          <input
                            id="confirm-password"
                            type="password"
                            autoComplete="new-password"
                            value={confirmPassword}
                            onChange={(event) =>
                              setConfirmPassword(event.target.value)
                            }
                            minLength={8}
                            required
                            className={inputStyles}
                          />
                        </div>
                      )}

                      <Button type="submit" className="w-full">
                        {busy
                          ? "One moment…"
                          : mode === "signup"
                            ? "Create my account"
                            : "Log in"}
                      </Button>
                    </fieldset>
                  </form>
                </>
              )}

              {error && (
                <p role="alert" className="mt-5 text-sm leading-relaxed text-terracotta">
                  {error}
                </p>
              )}

              <p role="status" className="mt-5 text-sm leading-relaxed text-muted">
                {notice}
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}