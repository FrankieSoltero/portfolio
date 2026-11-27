/**
 * The Drillbox sandbox frame page. `npm run frame` (scripts/build-drill-frame.mts) writes
 * it to public/drillbox/frame.html before every build and dev start; visitors' exercise
 * code runs inside it, in an `<iframe sandbox="allow-scripts">`.
 */

/** Where the site serves the frame page. */
export const FRAME_URL = "/drillbox/frame.html";

/**
 * The Content-Security-Policy response header for the frame page: the browser sandboxes it
 * (scripts only, opaque origin) even when opened directly, and only this site may embed it.
 * next.config.ts repeats this value as a literal; drills/frame.test.ts keeps them equal.
 */
export const FRAME_CSP_HEADER = "sandbox allow-scripts; frame-ancestors 'self'";
