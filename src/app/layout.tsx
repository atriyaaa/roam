import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { connection } from "next/server";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Roam — Plan the trip, keep the magic",
  description:
    "An itinerary studio for multi-city journeys. Bring your stops, budgets, bookings and memories together.",
};

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <p role="status" className="text-muted">
        Opening Roam…
      </p>
    </div>
  );
}

async function RequestContent({
  children,
}: {
  children: ReactNode;
}) {
  await connection();

  return <>{children}</>;
}

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <Suspense fallback={<LoadingScreen />}>
          <RequestContent>{children}</RequestContent>
        </Suspense>
      </body>
    </html>
  );
}