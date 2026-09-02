// app/papers/[slug]/page.tsx
// Individual paper post: Run Card, breakdown, reproduction, repo link.

import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypePrettyCode, { type Options } from "rehype-pretty-code";
import { getAllPapers, getPaperBySlug, getAdjacentPapers } from "@/lib/papers";
import { RunCard } from "@/components/papers/RunCard";
import { mdxComponents } from "@/components/papers/mdx-components";

const prettyCodeOptions: Options = {
  theme: "tokyo-night", // dark theme to sit on the --panel code background
  keepBackground: false, // papers.css owns the code-block background
};

export function generateStaticParams() {
  return getAllPapers().map((p) => ({ slug: p.meta.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const paper = getPaperBySlug(slug);
  if (!paper) return {};
  return {
    title: paper.meta.title,
    description: paper.meta.summary,
    openGraph: {
      title: paper.meta.title,
      description: paper.meta.summary,
      type: "article",
      publishedTime: paper.meta.date,
      authors: ["Francisco Soltero"],
      tags: paper.meta.tags,
      url: `/papers/${paper.meta.slug}`,
    },
    twitter: {
      card: "summary",
      title: paper.meta.title,
      description: paper.meta.summary,
    },
  };
}

export default async function PaperPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const paper = getPaperBySlug(slug);
  if (!paper || paper.meta.status !== "published") notFound();

  const { prev, next } = getAdjacentPapers(slug);

  return (
    <main>
      <article>
        <header>
          <h1>{paper.meta.title}</h1>
          <p className="meta-line paper-byline">
            {paper.meta.authors} ·{" "}
            <a href={paper.meta.arxiv} target="_blank" rel="noopener noreferrer">
              arXiv
            </a>{" "}
            ·{" "}
            <a href={paper.meta.repo} target="_blank" rel="noopener noreferrer">
              repo
            </a>
          </p>
          <p className="meta-line">
            {paper.meta.date} · {paper.meta.readingTime} ·{" "}
            {paper.meta.tags.join(", ")}
          </p>
        </header>

        <RunCard repro={paper.meta.repro} />

        <MDXRemote
          source={paper.content}
          options={{
            mdxOptions: {
              remarkPlugins: [remarkMath],
              rehypePlugins: [rehypeKatex, [rehypePrettyCode, prettyCodeOptions]],
            },
          }}
          components={mdxComponents}
        />
      </article>

      {(prev || next) && (
        <nav className="paper-nav" aria-label="Adjacent papers">
          <span>
            {prev && <Link href={`/papers/${prev.slug}`}>← {prev.title}</Link>}
          </span>
          <span>
            {next && <Link href={`/papers/${next.slug}`}>{next.title} →</Link>}
          </span>
        </nav>
      )}
    </main>
  );
}
