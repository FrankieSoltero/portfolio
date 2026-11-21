import { handleLookup } from '@/room-planner/server/lookupHandler';

/**
 * `POST /api/room-planner/lookup`: the room planner's product lookup. The work, checks included,
 * lives in `handleLookup`; this file only binds it to the route. It runs on Node.js (the SSRF-safe
 * fetch uses `node:` modules) and is never cached or pre-rendered. No other method is exported,
 * so every other method gets Next.js's 405.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Answers one lookup request. */
export async function POST(req: Request): Promise<Response> {
  return handleLookup(req);
}
