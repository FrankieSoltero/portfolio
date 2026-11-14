import { useEffect, useRef, useState, type RefObject } from 'react';

export interface ElementSize {
  width: number;
  height: number;
}

const INITIAL_SIZE: ElementSize = { width: 800, height: 560 };

/** Keeps `size` unless the element has a real (non-zero) size that differs by more than 1 px. */
function nextSize(prev: ElementSize, width: number, height: number): ElementSize {
  if (!width || !height) return prev;
  if (Math.abs(width - prev.width) <= 1 && Math.abs(height - prev.height) <= 1) return prev;
  return { width, height };
}

/**
 * Tracks the client size of the element behind the returned ref with a ResizeObserver.
 * Starts at 800×560 and ignores changes of 1 px or less (prototype lines 267–271).
 */
export function useElementSize<T extends HTMLElement>(): [RefObject<T | null>, ElementSize] {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<ElementSize>(INITIAL_SIZE);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize((prev) => nextSize(prev, el.clientWidth, el.clientHeight));
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}
