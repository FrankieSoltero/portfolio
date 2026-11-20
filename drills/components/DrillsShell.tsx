// drills/components/DrillsShell.tsx
// Header, content area and footer of the /drills section, mirroring the papers chrome.
// Rendered by app/drills/layout.tsx inside the `.drills` root element, which carries the
// font variables; it lives here rather than in the layout so it can be tested (next/font
// does not load under vitest). No hooks: it renders on the server.

import Link from "next/link";

export function DrillsShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <>
      <header className="drills-header">
        <nav aria-label="Drills section">
          {/* Plain <a>: the homepage is a static file outside the App Router */}
          <a href="/" className="drills-home">
            ◀ FRANCISCO SOLTERO
          </a>
          <Link href="/drills" className="drills-wordmark">
            DRILLS
          </Link>
        </nav>
      </header>
      <main className="drills-page">{children}</main>
      <footer className="drills-footer">
        <p>react review drills · find the bugs, fix the PR</p>
      </footer>
    </>
  );
}
