"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function ForgotPasswordPage() {
  const [supabase] = useState(() => createClient());
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const failed =
      new URLSearchParams(window.location.search).get("recovery") === "failed";

    if (failed) {
      setError(
        "That recovery link couldn’t be completed. It may have expired or already been used. Request a new link and open it in the same browser.",
      );
    }
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;

    const timer = window.setTimeout(() => {
      setCooldown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy || cooldown > 0) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const { error: resetError } =
        await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/auth/recovery`,
        });

      if (resetError) throw resetError;

      setNotice(
        "If an account exists for that email address, you’ll receive a password reset link. Check your inbox and spam folder, then open the link in this browser.",
      );

      setCooldown(60);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The reset email couldn’t be requested. Please try again.",
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
          A little help getting back
        </p>

        <h1 className="mt-4 text-4xl font-semibold tracking-tight">
          Forgot your password?
        </h1>

        <p className="mt-4 leading-relaxed text-muted">
          Enter your account’s email address and we’ll help you
          choose a new one.
        </p>

        <Card className="mt-8">
          <CardContent className="sm:p-8">
            <form onSubmit={requestReset} className="space-y-5">
              <div>
                <label
                  htmlFor="reset-email"
                  className="text-sm font-semibold"
                >
                  Email address
                </label>

                <input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                  disabled={busy}
                  className="mt-2 w-full rounded-2xl border border-foreground/20 bg-background px-4 py-3 outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/20"
                />
              </div>

              <Button
                type="submit"
                disabled={busy || cooldown > 0}
                className="w-full"
              >
                {busy
                  ? "Sending…"
                  : cooldown > 0
                    ? `Request again in ${cooldown}s`
                    : "Send reset link"}
              </Button>
            </form>

            {error && (
              <p
                role="alert"
                className="mt-5 text-sm leading-relaxed text-terracotta"
              >
                {error}
              </p>
            )}

            <p
              role="status"
              className="mt-5 text-sm leading-relaxed text-muted"
            >
              {notice}
            </p>

            <ButtonLink
              href="/account"
              variant="ghost"
              className="mt-5"
            >
              ← Back to login
            </ButtonLink>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}