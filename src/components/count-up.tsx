"use client";

import { useEffect, useRef, useState } from "react";
import { formatUsd } from "./api";

// Shows an amount in cents and counts from the last value to the new one in half a second.
// With reduced motion, and on the first render, it shows the value at once.
export function CountUp({ cents, className }: { cents: number; className?: string }) {
  const [shown, setShown] = useState(cents);
  const from = useRef(cents);

  useEffect(() => {
    const start = from.current;
    from.current = cents;
    if (start === cents || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(cents);
      return;
    }
    const t0 = performance.now();
    let frame = requestAnimationFrame(function tick(t) {
      const k = Math.min(1, (t - t0) / 500);
      setShown(Math.round(start + (cents - start) * k));
      if (k < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [cents]);

  return <span className={className}>{formatUsd(shown)}</span>;
}
