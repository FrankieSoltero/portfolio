import { box, type PartsBuilder } from './types';

/** Shelf: a placeholder box filling the size until the shelf builder lands. */
export const shelfParts: PartsBuilder = ({ w, d, h }) => [box('main', -w / 2, w / 2, -d / 2, d / 2, 0, h)];

/** Dresser: a placeholder box filling the size until the dresser builder lands. */
export const dresserParts: PartsBuilder = ({ w, d, h }) => [box('main', -w / 2, w / 2, -d / 2, d / 2, 0, h)];

/** Nightstand: a placeholder box filling the size until the nightstand builder lands. */
export const nightstandParts: PartsBuilder = ({ w, d, h }) => [box('main', -w / 2, w / 2, -d / 2, d / 2, 0, h)];

/** TV stand: a placeholder box filling the size until the TV stand builder lands. */
export const tvstandParts: PartsBuilder = ({ w, d, h }) => [box('main', -w / 2, w / 2, -d / 2, d / 2, 0, h)];
