// app/drills/layout.tsx
// Shell for the drills section: the same hybrid 8-bit skin as /papers.
// Pixel type for chrome, readable faces for the content itself.
// Header and footer live in DrillsShell, metadata in drills/metadata.ts (both testable).

import {
  IBM_Plex_Sans,
  IBM_Plex_Mono,
  Press_Start_2P,
  VT323,
} from "next/font/google";
import { DrillsShell } from "@/drills/components/DrillsShell";
import { drillsMetadata } from "@/drills/metadata";
import "../hybrid-skin.css";
import "./drills.css";
import "./workspace-theme.css";

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

export const metadata = drillsMetadata;

export default function DrillsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`drills ${plexSans.variable} ${plexMono.variable} ${pressStart.variable} ${vt323.variable}`}
    >
      <DrillsShell>{children}</DrillsShell>
    </div>
  );
}
