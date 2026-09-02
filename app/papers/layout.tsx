// app/papers/layout.tsx
// Shell for the papers section: hybrid 8-bit skin (spec:
// docs/superpowers/specs/2026-07-02-papers-8bit-hybrid-design.md).
// Pixel type for chrome, readable faces for the content itself.

import type { Metadata } from "next";
import Link from "next/link";
import {
  IBM_Plex_Sans,
  IBM_Plex_Mono,
  Press_Start_2P,
  VT323,
} from "next/font/google";
import "katex/dist/katex.min.css";
import "./papers.css";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-code",
  display: "swap",
});

const pressStart = Press_Start_2P({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-pixel",
  display: "swap",
});

const vt323 = VT323({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Papers", template: "%s · Papers · Francisco Soltero" },
};

export default function PapersLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`papers ${plexSans.variable} ${plexMono.variable} ${pressStart.variable} ${vt323.variable}`}
    >
      <header className="papers-header">
        <nav aria-label="Papers section">
          {/* Plain <a>: the homepage is a static file outside the App Router */}
          <a href="/" className="papers-home">
            ◀ FRANCISCO SOLTERO
          </a>
          <span className="papers-header-right">
            <Link href="/papers" className="papers-wordmark">
              PAPERS
            </Link>
            <a href="/papers/feed.xml" className="papers-rss">
              RSS
            </a>
          </span>
        </nav>
      </header>
      <div className="papers-page">{children}</div>
      <footer className="papers-footer">
        <p>
          breakdowns + small-scale reproductions ·{" "}
          <a href="mailto:frankiesoltero@gmail.com">frankiesoltero@gmail.com</a>
        </p>
      </footer>
    </div>
  );
}
