import type { JSX } from 'react';

/** The four registration marks drawn by `.blueprint > .corner` in industry.css. */
export function BlueprintCorners(): JSX.Element {
  return (
    <>
      <i className="corner tl" aria-hidden="true" />
      <i className="corner tr" aria-hidden="true" />
      <i className="corner bl" aria-hidden="true" />
      <i className="corner br" aria-hidden="true" />
    </>
  );
}
