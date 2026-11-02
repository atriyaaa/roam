"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const inputStyles =
  "mt-2 w-full rounded-2xl border border-foreground/20 bg-background px-4 py-3 outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/20";

export default function ResetPasswordPage() {
  const [supabase] = useState(() => createClient());
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function checkSession() {
      try {
        const { data, error: authError } =
          await supabase.auth.getUser();

        if (!active) return;

        if (authError || !data.user) {
          setError(
            "Open a valid password reset link from your email before choosing a new password.",
          );
          return;
        }

        setUserId(data.user.id);
        setEmail(data.user.email ?? "");
      } catch {
        if (active) {
          setError(
            "Your recovery session couldn’t be checked. Please request another reset link.",
          );
        }
      } finally {
        if (active) setChecking(false);
      }
    }

    void checkSession();

    return () => {
      active = false;
    };
  }, [supabase]);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !userId) return;

    setError("");

    if (password.length < 8) {
      setError("Use at least eight characters.");
      return;
    }

    if (password !== confirmation) {
      setError("Your passwords don’t match.");
      return;
    }

    setBusy(true);

    try {
      const { data, error: authError } =
        await supabase.auth.getUser();

      if (authError || data.user?.id !== userId) {
        throw new Error(
          "Your session changed or expired. Request a new reset link before continuing.",
        );
      }

      const { error: updateError } =
        await supabase.auth.updateUser({ password });

      if (updateError) throw updateError;

      setPassword("");
      setConfirmation("");
      setDone(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Your password couldn’t be updated. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main className="mx-auto max-w-xl px-6 py-12 sm:py-20">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-terracotta">
          A fresh start
        </p>

        <h1 className="mt-4 text-4xl font-semibold tracking-tight">
          {done ? "You’re ready to roam." : "Choose a new password."}
        </h1>

        <Card className="mt-8">
          <CardContent className="sm:p-8">
            {checking ? (
              <p role="status" className="text-muted">
                Checking your recovery session…
              </p>
            ) : done ? (
              <>
                <p role="status" className="leading-relaxed text-muted">
                  Your password has been updated. Use your new
                  password the next time you log in.
                </p>

                <ButtonLink href="/trips" className="mt-6">
                  Go to my trips ↗
                </ButtonLink>

                <ButtonLink
                  href="/account"
                  variant="ghost"
                  className="mt-3"
                >
                  Open account
                </ButtonLink>
              </>
            ) : userId ? (
              <>
                <p className="mb-6 break-all text-sm text-muted">
                  Updating the password for {email || "your account"}.
                </p>

                <form onSubmit={changePassword}>
                  <fieldset disabled={busy} className="space-y-5">
                    <legend className="sr-only">
                      Set your new password
                    </legend>

                    <div>
                      <label
                        htmlFor="new-password"
                        className="text-sm font-semibold"
                      >
                        New password
                      </label>

                      <input
                        id="new-password"
                        type="password"
                        autoComplete="new-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        minLength={8}
                        required
                        className={inputStyles}
                      />

                      <p className="mt-2 text-xs text-muted">
                        Use at least eight characters.
                      </p>
                    </div>

                    <div>
                      <label
                        htmlFor="confirm-new-password"
                        className="text-sm font-semibold"
                      >
                        Confirm new password
                      </label>

                      <input
                        id="confirm-new-password"
                        type="password"
                        autoComplete="new-password"
                        value={confirmation}
                        onChange={(event) =>
                          setConfirmation(event.target.value)
                        }
                        minLength={8}
                        required
                        className={inputStyles}
                      />
                    </div>

                    <Button type="submit" className="w-full">
                      {busy ? "Updating…" : "Save new password"}
                    </Button>
                  </fieldset>
                </form>
              </>
            ) : (
              <ButtonLink href="/account/forgot-password">
                Request a new reset link
              </ButtonLink>
            )}

            {error && (
              <p
                role="alert"
                className="mt-5 text-sm leading-relaxed text-terracotta"
              >
                {error}
              </p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}