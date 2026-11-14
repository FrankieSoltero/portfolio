/** Tunable constants. Lengths are inches unless noted. */
export const CONFIG = {
  roomMin: 36,
  roomMax: 720,
  furnitureSnap: 1,
  previewDimMax: 240,
  showClearances: true,
  lookupDelayMs: 900,
  camera: { yaw: -0.65, pitch: 0.55, zoom: 1 },
  pitchMin: 0.12,
  pitchMax: 1.45,
  zoomMin: 0.6,
  zoomMax: 2.5,
  orbitYawPerPx: 0.008,
  orbitPitchPerPx: 0.006,
  zoomPerDelta: 0.001,
  planMargin: 64,
  planMarginInset: 48,
  dimOffset: 30,
  dimOffsetInset: 22,
  insetGap: 16,
  minPlanScale: 0.2,
  minSafeWidth: 200,
  conflictEpsilon: 0.01,
  cornerSnap: 1,
  angleSnapDeg: 15,
  angleSnapTolerancePx: 8,
  wallMin: 6,
  maxCorners: 64,
  maxPixelRatio: 2,
  nudgeStep: 1,
  nudgeStepLarge: 12,
  // Tuned in Task 20 against the prototype capture (Docs/verification). Started
  // from the handoff's 0.78 and 0.62 multiplied by pi (2.45, 1.95) because three
  // 0.187 uses physically based light units; final values owner-approved on 2026-11-12.
  hemiIntensity: 3.0,
  sunIntensity: 1.7,
  // Saving the plan in the browser (Task 17). The key carries its own format generation;
  // stored text above maxStoredChars is never parsed, and saves are debounced by saveDebounceMs.
  planStorageKey: 'room-planner:plan:v1',
  maxStoredChars: 524288,
  saveDebounceMs: 300,
} as const;
