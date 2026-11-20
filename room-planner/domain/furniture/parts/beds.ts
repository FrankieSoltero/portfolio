import { box, type PartsBuilder } from './types';

/** Bed: a placeholder box filling the size until the bed builder lands. */
export const bedParts: PartsBuilder = ({ w, d, h }) => [box('main', -w / 2, w / 2, -d / 2, d / 2, 0, h)];
