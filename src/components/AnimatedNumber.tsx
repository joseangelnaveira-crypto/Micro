'use client';

import { useEffect, useRef, useState } from 'react';

// Cuenta desde el valor anterior hasta el nuevo con easing. Respeta prefers-reduced-motion
// (en ese caso salta directo al valor final).
export default function AnimatedNumber({ value, duration = 800 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(0);
  const firstRef = useRef(true);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from = firstRef.current ? 0 : fromRef.current;
    firstRef.current = false;
    if (reduce || from === value) { setShown(value); fromRef.current = value; return; }

    let raf = 0;
    const start = performance.now();
    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = Math.round(from + (value - from) * eased);
      setShown(current);
      fromRef.current = current;
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{shown}</>;
}
