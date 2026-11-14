// @vitest-environment node
// Guards the planner's wiring into the rest of the site: its quest card on the 8-bit homepage
// (public/index.html) and its sitemap entry (app/sitemap.ts). Both files are read as text.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const readRepoFile = (path: string): string => readFileSync(resolve(repoRoot, path), 'utf8');

const indexHtml = readRepoFile('public/index.html');
const sitemapSource = readRepoFile('app/sitemap.ts');

describe('Room Planner quest card on the 8-bit homepage', () => {
  it('has a Room Planner quest that links to the in-site route', () => {
    expect(indexHtml).toContain("title: 'Room Planner'");
    expect(indexHtml).toContain("play: '/room-planner'");
  });

  it('counts seven quests, all cleared', () => {
    expect(indexHtml).toContain('questCount: 7, clearedCount: 7');
  });

  it('renders exactly one PLAY → link, opened in the same tab', () => {
    expect(indexHtml.split('PLAY →')).toHaveLength(2);

    const labelAt = indexHtml.indexOf('PLAY →');
    const anchorStart = indexHtml.lastIndexOf('<a', labelAt);
    expect(anchorStart).toBeGreaterThanOrEqual(0);
    const anchorTag = indexHtml.slice(anchorStart, labelAt);
    expect(anchorTag).not.toContain('target=');
  });
});

describe('sitemap', () => {
  it('lists the /room-planner route', () => {
    expect(sitemapSource).toContain('/room-planner');
  });
});
