import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import Silk from "@/components/silk";

import "./globals.css";

export const metadata: Metadata = {
  title: "redner",
  description: "A learning-focused deployment platform",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="silk-background" aria-hidden="true">
          <Silk
            speed={1.1}
            scale={0.5}
            color="#5f8ee6"
            noiseIntensity={0.4}
            rotation={0}
          />
        </div>
        <div className="silk-wash" aria-hidden="true" />
        <div className="relative z-10 min-h-screen">
          <header className="sticky top-0 z-30 border-b border-white/65 bg-white/55 shadow-[0_8px_30px_rgb(42_67_135/0.06)] backdrop-blur-2xl">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
              <Link
                href="/"
                className="text-lg font-bold tracking-[-0.045em] text-ink transition hover:text-accent"
              >
                redner
              </Link>
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl px-6 py-12 sm:py-16">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
