'use client';

import { useEffect, useState } from 'react';

// Confeti CSS puro, sin librería. Se dispara por un trigger y auto-expira a los 3.5s.
// Respeta prefers-reduced-motion via globals.css (.confetti-piece { display:none }).
const COLORS = ['#1B7A50', '#6D45D3', '#F4A340', '#C13A2C', '#FBF4E3'];

export default function Confetti({ trigger, count = 60 }: { trigger: unknown; count?: number }) {
  const [pieces, setPieces] = useState<React.ReactNode[]>([]);

  useEffect(() => {
    if (!trigger) return;
    const items = Array.from({ length: count }).map((_, i) => {
      const left = Math.random() * 100;
      const delay = Math.random() * 0.5;
      const duration = 2.4 + Math.random() * 1.6;
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      const rotate = Math.random() * 360;
      const width = 8 + Math.random() * 6;
      const height = 10 + Math.random() * 8;
      return (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${left}%`,
            background: color,
            width: `${width}px`,
            height: `${height}px`,
            transform: `rotate(${rotate}deg)`,
            animationDuration: `${duration}s`,
            animationDelay: `${delay}s`,
          }}
        />
      );
    });
    setPieces(items);
    const t = setTimeout(() => setPieces([]), 4000);
    return () => clearTimeout(t);
  }, [trigger, count]);

  return <>{pieces}</>;
}
