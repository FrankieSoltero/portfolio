// components/papers/Figure.tsx
// Image/chart wrapper: faint graph-grid background (var(--rule)), mono caption.
// Plain <img>: figure sources are content-authored files of unknown dimensions,
// so next/image's required sizing would push layout concerns into MDX.

export function Figure({ src, caption }: { src: string; caption: string }) {
  return (
    <figure className="paper-figure">
      <div className="paper-figure-frame">
        <img src={src} alt={caption} loading="lazy" />
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
