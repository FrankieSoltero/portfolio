// app/drills/[slug]/page.tsx
// One drill: title and meta line, the brief, the starter code, hints, the fix behind a
// reveal button, and links to the neighbouring drills. A static server component; the
// section shell (header, main, footer) comes from app/drills/layout.tsx.
//
// Only drills on disk are prerendered (dynamicParams = false). The slug from the URL is
// used only through getDrillBySlug, which validates it before touching the filesystem.
// Code is highlighted here with shiki at build time from repository files, and markdown
// is compiled here with next-mdx-remote/rsc; the client components receive plain props
// or already-rendered children.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { compileMDX } from "next-mdx-remote/rsc";
import { codeToHtml } from "shiki";
import { getAdjacentDrills, getAllDrills, getDrillBySlug, type DrillFile } from "@/lib/drills";
import { HintList } from "@/drills/components/HintList";
import { SolutionReveal } from "@/drills/components/SolutionReveal";

type PageProps = { params: Promise<{ slug: string }> };

interface HighlightedFile {
  path: string;
  readOnly: boolean;
  html: string; // shiki output for a repository file
}

const FIX_LEAD = "The fixed code, with an explanation of each bug and the rule to remember. Try the drill first.";

export const dynamicParams = false;

export function generateStaticParams(): { slug: string }[] {
  return getAllDrills().map((d) => ({ slug: d.meta.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const drill = getDrillBySlug(slug);
  if (!drill) return {};
  return { title: drill.meta.title, description: drill.meta.summary };
}

export default async function DrillPage({ params }: PageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const drill = getDrillBySlug(slug);
  if (!drill) notFound();

  const { meta } = drill;
  const { prev, next } = getAdjacentDrills(slug);
  const [brief, explanation, starterFiles, solutionFiles] = await Promise.all([
    renderMarkdown(drill.brief),
    renderMarkdown(drill.explanation),
    highlight(drill.files),
    highlight(drill.solutionFiles),
  ]);

  return (
    <>
      <article className="drills-drill">
        <header className="drills-drill-header">
          <h1 className="drills-drill-title">{meta.title}</h1>
          <p className="drills-drill-meta">
            {`DRILL ${meta.order} · ${meta.minutes} MIN · ${meta.skills.join(", ")}`}
          </p>
        </header>

        <section className="drills-section drills-brief">
          <h2 className="drills-section-title">THE PULL REQUEST</h2>
          <div className="drills-prose">{brief}</div>
        </section>

        {/* Stand-in until the runner-integration plan replaces it with the workspace. */}
        <section className="drills-section drills-starter">
          <h2 className="drills-section-title">STARTER CODE</h2>
          <CodeFiles files={starterFiles} />
        </section>

        <section className="drills-section drills-hints-section">
          <h2 className="drills-section-title">HINTS</h2>
          <HintList hints={meta.hints} />
        </section>

        <section className="drills-section drills-fix">
          <h2 className="drills-section-title">THE FIX</h2>
          <p className="drills-fix-lead">{FIX_LEAD}</p>
          <SolutionReveal slug={meta.slug}>
            <CodeFiles files={solutionFiles} />
            <div className="drills-prose drills-explanation">{explanation}</div>
          </SolutionReveal>
        </section>
      </article>

      <nav className="drills-drill-nav" aria-label="Adjacent drills">
        {prev && (
          <Link href={`/drills/${prev.slug}`} className="drills-nav-prev">
            {`◀ ${prev.title}`}
          </Link>
        )}
        <Link href="/drills" className="drills-nav-all">
          ALL DRILLS
        </Link>
        {next && (
          <Link href={`/drills/${next.slug}`} className="drills-nav-next">
            {`${next.title} ▶`}
          </Link>
        )}
      </nav>
    </>
  );
}

function CodeFiles({ files }: { files: HighlightedFile[] }): React.JSX.Element {
  return (
    <div className="drills-files">
      {files.map((f) => (
        <figure key={f.path} className="drills-file">
          <figcaption className="drills-file-label">
            <span className="drills-file-path">{f.path}</span>
            {f.readOnly && <span className="drills-file-readonly">READ-ONLY</span>}
          </figcaption>
          {/* Safe: shiki escapes the code; the input is a repository file read at build time. */}
          <div className="drills-code" dangerouslySetInnerHTML={{ __html: f.html }} />
        </figure>
      ))}
    </div>
  );
}

async function highlight(files: DrillFile[]): Promise<HighlightedFile[]> {
  return Promise.all(
    files.map(async (f) => ({
      path: f.path,
      readOnly: f.readOnly,
      html: await codeToHtml(f.code, { lang: "tsx", theme: "tokyo-night" }),
    })),
  );
}

async function renderMarkdown(source: string): Promise<React.ReactNode> {
  const { content } = await compileMDX({ source });
  return content;
}
