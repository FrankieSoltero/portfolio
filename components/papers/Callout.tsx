// components/papers/Callout.tsx
// "Where my repro diverged" notes. Amber accent (var(--partial)), left border.

export function Callout({
  label = "DIVERGENCE",
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <aside className="paper-callout">
      <span className="paper-callout-label">{label}</span>
      {children}
    </aside>
  );
}
