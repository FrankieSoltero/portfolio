// components/papers/TagFilter.tsx
// Filter control for the index. Plain links that set/clear the ?tag= search
// param — the index page filters server-side, so this needs no client state
// and works without JavaScript.

import Link from "next/link";

export function TagFilter({ tags, active }: { tags: string[]; active?: string }) {
  if (tags.length === 0) return null;
  return (
    <ul className="tag-filter" aria-label="Filter by tag">
      <li>
        <Link href="/papers" aria-current={!active ? "true" : undefined}>
          all
        </Link>
      </li>
      {tags.map((tag) => (
        <li key={tag}>
          <Link
            href={`/papers?tag=${encodeURIComponent(tag)}`}
            aria-current={active === tag ? "true" : undefined}
          >
            {tag}
          </Link>
        </li>
      ))}
    </ul>
  );
}
