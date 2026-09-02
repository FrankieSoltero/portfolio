// app/not-found.tsx
// Themed 404 for App Router routes (e.g. a bad /papers slug).

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        fontFamily: "monospace",
        textAlign: "center",
        padding: "1.25rem",
      }}
    >
      <p style={{ fontSize: "1.5rem", color: "#ffcd75", margin: 0 }}>
        404 — AREA NOT FOUND
      </p>
      <p style={{ color: "#94b0c2", margin: 0 }}>
        This screen doesn&apos;t exist in the overworld map.
      </p>
      <p style={{ margin: 0 }}>
        <a href="/" style={{ color: "#73eff7" }}>
          ◀ character sheet
        </a>
        {"  ·  "}
        <a href="/papers" style={{ color: "#73eff7" }}>
          papers
        </a>
      </p>
    </main>
  );
}
