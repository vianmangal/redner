import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "redner",
  description: "A learning-focused deployment platform",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen">
          <header className="border-b border-line/80 bg-white/80 backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
              <Link
                href="/"
                className="font-mono text-lg font-semibold tracking-[-0.04em] text-ink"
              >
                redner
              </Link>
              <span className="rounded-full border border-line bg-canvas px-3 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                local workspace
              </span>
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl px-6 py-12">{children}</main>
        </div>
      </body>
    </html>
  );
}
