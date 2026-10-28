"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { setStorageUser } from "@/lib/account-storage";

export function AccountWorkspace({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const [readyUserId, setReadyUserId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    let redirected = false;

    function closeWorkspace() {
      if (!active || redirected) return;

      redirected = true;
      setStorageUser(null);
      setReadyUserId(null);
      window.location.replace("/account");
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user.id !== userId) {
        closeWorkspace();
      }
    });

    async function openWorkspace() {
      try {
        const { data, error } = await supabase.auth.getUser();

        if (!active || redirected) return;

        if (error || data.user?.id !== userId) {
          closeWorkspace();
          return;
        }

        setStorageUser(userId);
        setReadyUserId(userId);
      } catch {
        closeWorkspace();
      }
    }

    void openWorkspace();

    return () => {
      active = false;
      subscription.unsubscribe();
      setStorageUser(null);
    };
  }, [userId]);

  if (readyUserId !== userId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <p role="status" className="text-muted">
          Opening your workspace…
        </p>
      </main>
    );
  }

  return <>{children}</>;
}