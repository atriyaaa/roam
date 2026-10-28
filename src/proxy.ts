import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  const pathname = request.nextUrl.pathname;
  const isTripRoute =
    pathname === "/trips" || pathname.startsWith("/trips/");
  const isPlaceSearch = pathname === "/api/places";

  function loginRequired() {
    const destination = isPlaceSearch
      ? NextResponse.json(
          { error: "Please log in to search for places." },
          { status: 401 },
        )
      : NextResponse.redirect(new URL("/account", request.url));

    response.cookies.getAll().forEach((cookie) => {
      destination.cookies.set(cookie);
    });

    return destination;
  }

  if (!url || !key) {
    return isTripRoute || isPlaceSearch
      ? loginRequired()
      : response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },

      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  try {
    const { data, error } = await supabase.auth.getClaims();

    if (
      (isTripRoute || isPlaceSearch) &&
      (error || !data?.claims?.sub)
    ) {
      return loginRequired();
    }
  } catch {
    if (isTripRoute || isPlaceSearch) {
      return loginRequired();
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/",
    "/account",
    "/trips/:path*",
    "/auth/:path*",
    "/api/places",
  ],
};