import { box, type PartsBuilder } from './types';

/** Rug: a placeholder box filling the size until the rug builder lands. */
export const rugParts: PartsBuilder = ({ w, d, h }) => [box('main', -w / 2, w / 2, -d / 2, d / 2, 0, h)];

/** Box: a placeholder box filling the size until the box builder lands. */
export const boxParts: PartsBuilder = ({ w, d, h }) => [box('main', -w / 2, w / 2, -d / 2, d / 2, 0, h)];
