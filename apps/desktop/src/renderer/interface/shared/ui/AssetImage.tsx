import { useEffect, useState, type CSSProperties } from 'react';

/** An <img> that moves to the next candidate URL when one fails to load (see domain/assets). */
export function AssetImage({ candidates, alt = '', className, style }: { candidates: string[]; alt?: string; className?: string; style?: CSSProperties }) {
  const [index, setIndex] = useState(0);
  const key = candidates.join('|');
  useEffect(() => setIndex(0), [key]);
  const src = candidates[index];
  if (!src) return null;
  return <img src={src} alt={alt} className={className} style={style} draggable={false} onError={() => setIndex((i) => i + 1)} />;
}
