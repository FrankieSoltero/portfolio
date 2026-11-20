import { box, type PartsBuilder } from './types';

/** Desk: a placeholder box filling the size until the desk builder lands. */
export const deskParts: PartsBuilder = ({ w, d, h }) => [box('main', -w / 2, w / 2, -d / 2, d / 2, 0, h)];

/** Table: a placeholder box filling the size until the table builder lands. */
export const tableParts: PartsBuilder = ({ w, d, h }) => [box('main', -w / 2, w / 2, -d / 2, d / 2, 0, h)];
