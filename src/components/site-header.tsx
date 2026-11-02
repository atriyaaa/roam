"use client";

import { usePathname } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";

const links = [
  { href: "/trips", label: "My trips" },
  { href: "/trips/wishlist", label: "Wishlist" },
  { href: "/trips/bookings", label: "Bookings" },
  { href: "/trips/budget", label: "Budget" },
  { href: "/trips/map", label: "Map" },
  { href: "/trips/cloud", label: "Cloud saves" },
  { href: "/trips/share", label: "Share" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const isAccountPage = pathname === "/account";

  return (
    <header className="border-b border-foreground/10">
      <nav
        aria-label="Main navigation"
        className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-6 lg:px-10"
      >
        <a
          href="/"
          aria-label="Roam home"
          className="text-3xl font-bold tracking-tight"
        >
          roam<span className="text-terracotta">.</span>
        </a>

        {!isAccountPage && (
          <div className="flex flex-wrap items-center gap-2">
            {links.map((link) => (
              <ButtonLink
                key={link.href}
                href={link.href}
                variant="ghost"
              >
                {link.label}
              </ButtonLink>
            ))}

            <ButtonLink href="/trips/itinerary" variant="secondary">
              Itinerary ↗
            </ButtonLink>

            <ButtonLink href="/account" variant="secondary">
              Account
            </ButtonLink>
          </div>
        )}
      </nav>
    </header>
  );
}