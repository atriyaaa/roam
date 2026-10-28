import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (!error) {
        return NextResponse.redirect(new URL("/account", url.origin));
      }
    } catch {
      // Send the user back to the account screen with a useful message.
    }
  }

  return NextResponse.redirect(
    new URL("/account?confirmation=failed", url.origin),
  );
}