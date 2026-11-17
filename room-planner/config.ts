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
  // In room mode the overall dimension lines sit this many px further out, clear of the wall labels.
  dimOffsetRoomExtra: 22,
  // The inset pane's margin is smaller (planMarginInset), so its lines move out less, keeping the text inside the pane.
  dimOffsetRoomExtraInset: 16,
  insetGap: 16,
  minPlanScale: 0.2,
  minSafeWidth: 200,
  conflictEpsilon: 0.01,
  // Stopping a moved piece at the walls: a piece fits when it is inside within wallStopEpsilon
  // (conflictEpsilon when it starts up to that much over a wall), and the furthest fit along a
  // path is found by halving the path wallStopIterations times.
  wallStopEpsilon: 1e-6,
  wallStopIterations: 26,
  cornerSnap: 1,
  angleSnapDeg: 15,
  angleSnapTolerancePx: 8,
  wallMin: 6,
  maxCorners: 64,
  // Sliding a wall: two unit directions whose cross product is at most sameDirectionSlack (and
  // whose dot product is positive) count as the same direction; a press on a wall becomes a drag
  // once the pointer has moved wallDragThresholdPx screen pixels.
  sameDirectionSlack: 0.005,
  wallDragThresholdPx: 4,
  // A wall's length label runs along its wall with its edge nearest the wall this many screen pixels
  // outside the room, level with the wall's midpoint; the editor that replaces it is centred there.
  wallLabelOffsetPx: 10,
  // Half a wall label's height (stage.css gives .room-wall-label height: 18px), so its centre sits
  // wallLabelOffsetPx + wallLabelHalfHeightPx outside the wall.
  wallLabelHalfHeightPx: 9,
  // Limits a saved plan must keep (planSchema reads them, so edits and loading agree): every
  // outline corner within ±coordMax in, and at most maxItems items.
  coordMax: 1440,
  maxItems: 200,
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
  // Undo history (in memory only): at most historyLimit steps are kept, and a keyed change joins
  // the latest step when it comes within historyMergeMs of that step's latest change.
  historyLimit: 100,
  historyMergeMs: 1000,
  // Limits for doors, windows and obstacles; planSchema reads them, so edits and loading agree.
  maxOpenings: 64,
  maxObstacles: 64,
  openingWidthMin: 12,
  openingWidthMax: 240,
  openingHeightMin: 12,
  openingHeightMax: 240,
  sillMax: 240,
  obstacleSizeMin: 1,
  obstacleSizeMax: 240,
  obstacleHeightMax: 720,
  obstacleLabelMax: 40,
  doorClearDepth: 24,
  windowZoneDepth: 6,
  arcSegments: 8,
  cylinderSegments: 16,
} as const;
