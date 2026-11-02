"use client";

import { usePathname } from "next/navigation";

const links = [
  { href: "/trips", label: "My trips" },
  { href: "/trips/itinerary", label: "Itinerary" },
  { href: "/trips/map", label: "Map" },
  { href: "/trips/wishlist", label: "Wishlist" },
  { href: "/trips/bookings", label: "Bookings" },
  { href: "/trips/budget", label: "Budget" },
  { href: "/trips/expenses", label: "Expenses" },
  { href: "/trips/weather", label: "Weather" },
  { href: "/trips/packing", label: "Packing" },
  { href: "/trips/export", label: "Export PDF" },
  { href: "/trips/calendar", label: "Calendar" },
  { href: "/trips/cloud", label: "Cloud saves" },
  { href: "/trips/share", label: "Share" },
  { href: "/account", label: "Account" },
];

export function SiteHeader() {
  const pathname = usePathname();

  const isAccountPage =
    pathname === "/account" || pathname.startsWith("/account/");

  function navigation(mobile: boolean) {
    return links.map((link) => {
      const current = pathname === link.href;

      return (
        <a
          key={link.href}
          href={link.href}
          aria-current={current ? "page" : undefined}
          className={[
            mobile
              ? "block rounded-xl px-4 py-3"
              : "rounded-full px-3 py-2",
            "text-sm font-medium transition-colors",
            current
              ? "bg-foreground text-white"
              : "text-foreground hover:bg-sky",
          ].join(" ")}
        >
          {link.label}
        </a>
      );
    });
  }

  return (
    <header className="border-b border-foreground/10">
      <nav
        aria-label="Main navigation"
        className="mx-auto max-w-7xl px-6 py-5 lg:px-10"
      >
        <div className="flex items-center justify-between gap-4">
          <a
            href="/"
            aria-label="Roam home"
            className="text-3xl font-bold tracking-tight"
          >
            roam<span className="text-terracotta">.</span>
          </a>

          {!isAccountPage && (
            <>
              <div className="hidden flex-wrap items-center justify-end gap-1 2xl:flex">
                {navigation(false)}
              </div>

              <details className="group relative 2xl:hidden">
                <summary className="cursor-pointer list-none rounded-full border border-foreground/20 bg-white px-5 py-2.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                  Menu
                  <span aria-hidden="true" className="ml-2">
                    ☰
                  </span>
                </summary>

                <div className="absolute right-0 z-50 mt-3 max-h-[75vh] w-56 overflow-y-auto rounded-2xl border border-foreground/10 bg-background p-2 shadow-xl">
                  {navigation(true)}
                </div>
              </details>
            </>
          )}
        </div>
      </nav>

      {!isAccountPage && (
        <div className="border-t border-foreground/5 bg-sky/60 px-6 py-2.5 text-center text-xs leading-relaxed text-foreground">
          Changes save in this browser.{" "}
          <a
            href="/trips/cloud"
            className="font-semibold underline underline-offset-2"
          >
            Save to cloud
          </a>{" "}
          to update your account copy.
        </div>
      )}
    </header>
  );
}