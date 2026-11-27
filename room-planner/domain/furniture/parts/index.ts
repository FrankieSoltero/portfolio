import type { Kind, StyleValues } from '../../types';
import { completeStyle, defaultStyle } from '../recipe';
import { bedParts } from './beds';
import { boxParts, rugParts } from './flat';
import { chairParts, sofaParts } from './seating';
import { dresserParts, nightstandParts, shelfParts, tvstandParts } from './storage';
import { deskParts, tableParts } from './tables';
import type { Part, PartsBuilder, PieceSize } from './types';

/** The builder of each kind. */
const BUILDERS: Readonly<Record<Kind, PartsBuilder>> = {
  sofa: sofaParts,
  chair: chairParts,
  bed: bedParts,
  desk: deskParts,
  table: tableParts,
  shelf: shelfParts,
  dresser: dresserParts,
  nightstand: nightstandParts,
  tvstand: tvstandParts,
  rug: rugParts,
  box: boxParts,
};

/** Parts of a piece in its local frame. Unknown or incomplete style values fall back to the kind's defaults; never throws. */
export function buildParts(kind: Kind, size: PieceSize, style: StyleValues, seed = 1): Part[] {
  const full = completeStyle(kind, style) ?? defaultStyle(kind);
  return BUILDERS[kind](size, full, seed);
}
