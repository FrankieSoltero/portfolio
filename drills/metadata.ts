// drills/metadata.ts
// Section metadata for /drills, re-exported by app/drills/layout.tsx as `metadata`.
// Kept out of the layout module so it can be tested: next/font does not load under vitest.

import type { Metadata } from "next";

export const drillsMetadata: Metadata = {
  title: { default: "Drills", template: "%s · Drills · Francisco Soltero" },
};
