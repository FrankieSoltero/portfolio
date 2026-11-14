import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Obstacle } from '../domain/types';
import type { Tokens } from '../styles/tokens';
import { buildObstacle } from './obstacleMesh';

const TOKENS: Tokens = {
  bg: '#ffffff',
  text: '#111111',
  n100: '#f5f5f8',
  n200: '#e5e5ea',
  a100: '#eef0ff',
  a200: '#dde1ff',
  a300: '#c4cbff',
  a400: '#a3adff',
  a700: '#3a46c8',
};

const BOX: Obstacle = {
  id: 'o1', shape: 'box', label: '', x: 30, y: 130, rotation: 90, width: 20, depth: 10, height: 30, elevation: 40,
};
const COLUMN: Obstacle = {
  id: 'o2', shape: 'cylinder', label: '', x: 50, y: 60, rotation: 0, width: 12, depth: 12, height: 96, elevation: 0,
};

type StdMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;

function solidOf(group: THREE.Group): StdMesh {
  const solids = group.children.filter((c): c is StdMesh => c instanceof THREE.Mesh);
  if (solids.length !== 1 || !solids[0]) throw new Error(`expected one mesh, found ${solids.length}`);
  return solids[0];
}

function outlineOf(group: THREE.Group): THREE.LineSegments {
  const outline: unknown = group.userData.outline;
  if (!(outline instanceof THREE.LineSegments)) throw new Error('no outline');
  return outline;
}

describe('buildObstacle', () => {
  it('places a box group at its centre on the floor, turned by its rotation', () => {
    const group = buildObstacle(BOX, TOKENS);
    expect(group.position.x).toBeCloseTo(30, 10);
    expect(group.position.y).toBe(0);
    expect(group.position.z).toBeCloseTo(130, 10);
    expect(group.rotation.y).toBeCloseTo(-Math.PI / 2, 10);
  });

  it('holds a box mesh width × height × depth, centred at elevation + height / 2, casting and receiving shadows', () => {
    const mesh = solidOf(buildObstacle(BOX, TOKENS));
    expect(mesh.geometry).toBeInstanceOf(THREE.BoxGeometry);
    const { width, height, depth } = (mesh.geometry as THREE.BoxGeometry).parameters;
    expect([width, height, depth]).toEqual([20, 30, 10]);
    expect(mesh.position.x).toBe(0);
    expect(mesh.position.y).toBeCloseTo(55, 10);
    expect(mesh.position.z).toBe(0);
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);
  });

  it('holds a cylinder mesh of radius width / 2 and the full height, centred at half its height', () => {
    const mesh = solidOf(buildObstacle(COLUMN, TOKENS));
    expect(mesh.geometry).toBeInstanceOf(THREE.CylinderGeometry);
    const p = (mesh.geometry as THREE.CylinderGeometry).parameters;
    expect(p.radiusTop).toBe(6);
    expect(p.radiusBottom).toBe(6);
    expect(p.height).toBe(96);
    expect(mesh.position.y).toBeCloseTo(48, 10);
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);
  });

  it('paints the obstacle a rough, plain neutral grey', () => {
    for (const o of [BOX, COLUMN]) {
      const { material } = solidOf(buildObstacle(o, TOKENS));
      expect(material).toBeInstanceOf(THREE.MeshStandardMaterial);
      expect(material.color.getHexString()).toBe('e5e5ea');
      expect(material.roughness).toBeGreaterThanOrEqual(0.9);
      expect(material.transparent).toBe(false);
    }
  });

  it('keeps a hidden outline box around the solid, as furniture models do', () => {
    const group = buildObstacle(BOX, TOKENS);
    const outline = outlineOf(group);
    expect(outline.visible).toBe(false);
    expect(outline.material).toBeInstanceOf(THREE.LineBasicMaterial);
    expect(group.children).toContain(outline);
    outline.geometry.computeBoundingBox();
    const size = outline.geometry.boundingBox?.getSize(new THREE.Vector3());
    expect(size?.x).toBeCloseTo(21.2, 5);
    expect(size?.y).toBeCloseTo(30.6, 5);
    expect(size?.z).toBeCloseTo(11.2, 5);
    expect(outline.position.y).toBeCloseTo(55, 9);
  });

  it('sizes a cylinder outline box to its diameter on both floor axes', () => {
    const outline = outlineOf(buildObstacle(COLUMN, TOKENS));
    outline.geometry.computeBoundingBox();
    const size = outline.geometry.boundingBox?.getSize(new THREE.Vector3());
    expect(size?.x).toBeCloseTo(13.2, 5);
    expect(size?.z).toBeCloseTo(13.2, 5);
  });
});
