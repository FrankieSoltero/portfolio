// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Door, Opening, WindowOpening } from '../domain/types';
import { rectRoom } from '../test/fixtures';
import { wallHoles } from './wallHoles';

/** The room R of the brief: 144 × 168 × 96, corners c1…c4. */
const R = rectRoom(144, 168, 96).outline;
const D1: Door = { id: 'd1', kind: 'door', wallId: 'c1', offset: 20, width: 32, height: 80, hinge: 'start', swing: 'in' };
const W1: WindowOpening = { id: 'w1', kind: 'window', wallId: 'c2', offset: 100, width: 36, sill: 36, height: 48 };

describe('wallHoles', () => {
  it('gives one list per wall: the door on wall 0 from the floor, the window on wall 1 from its sill', () => {
    expect(wallHoles(R, [D1, W1], 96)).toEqual([
      [{ x0: 20, x1: 52, z0: 0, z1: 80, glass: false }],
      [{ x0: 100, x1: 136, z0: 36, z1: 84, glass: true }],
      [],
      [],
    ]);
  });

  it('clamps a hole to the ceiling', () => {
    const [wall0] = wallHoles(R, [{ ...D1, height: 100 }], 96);
    expect(wall0).toEqual([{ x0: 20, x1: 52, z0: 0, z1: 96, glass: false }]);
  });

  it('drops a hole that starts at or above the ceiling', () => {
    expect(wallHoles(R, [{ ...W1, sill: 100 }], 96)).toEqual([[], [], [], []]);
    expect(wallHoles(R, [{ ...W1, sill: 96 }], 96)).toEqual([[], [], [], []]);
  });

  it('ignores an opening whose wall is not in the outline', () => {
    expect(wallHoles(R, [{ ...D1, wallId: 'gone' }], 96)).toEqual([[], [], [], []]);
  });

  it('sorts each wall\'s holes by x0', () => {
    const later: Opening = { ...D1, id: 'd2', offset: 90 };
    const [wall0] = wallHoles(R, [later, D1], 96);
    expect(wall0?.map((h) => h.x0)).toEqual([20, 90]);
  });

  it('clamps a hole into its wall and drops one narrower than 0.01 after clamping', () => {
    const [wall0] = wallHoles(R, [{ ...D1, offset: 130 }, { ...W1, wallId: 'c1', offset: -50 }], 96);
    expect(wall0).toEqual([{ x0: 130, x1: 144, z0: 0, z1: 80, glass: false }]);
    expect(wallHoles(R, [{ ...D1, offset: 143.995 }], 96)[0]).toEqual([]);
  });
});

/** Every non-test .ts / .tsx file under `dir`, recursively. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Module specifiers of every static, dynamic or re-export import in the source. */
function importsOf(source: string): string[] {
  const specifiers: string[] = [];
  const pattern = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g;
  for (const m of source.matchAll(pattern)) if (m[1] !== undefined) specifiers.push(m[1]);
  return specifiers;
}

describe('three.js stays out of the view and domain modules', () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const files = [...sourceFiles(join(root, 'view')), ...sourceFiles(join(root, 'domain'))];

  it('finds the modules it checks', () => {
    expect(files.some((f) => f.endsWith(join('view', 'wallHoles.ts')))).toBe(true);
    expect(files.some((f) => f.endsWith(join('view', 'blueprintDraw.ts')))).toBe(true);
    expect(files.some((f) => f.endsWith(join('domain', 'obstacles.ts')))).toBe(true);
  });

  it('recognises an import of three or of a /three/ path', () => {
    expect(importsOf("import * as THREE from 'three';\nexport { wallHoles } from '../three/roomMesh';"))
      .toEqual(['three', '../three/roomMesh']);
  });

  it.each(files.map((f) => [f.slice(root.length + 1), f]))('%s imports nothing from three', (_name, file) => {
    const bad = importsOf(readFileSync(file, 'utf8')).filter((s) => s === 'three' || s.startsWith('three/') || s.includes('/three/'));
    expect(bad).toEqual([]);
  });
});
