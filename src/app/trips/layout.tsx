import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AccountWorkspace } from "@/components/account-workspace";

export default async function TripsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/account");
  }

  return (
    <AccountWorkspace key={data.user.id} userId={data.user.id}>
      {children}
    </AccountWorkspace>
  );
}