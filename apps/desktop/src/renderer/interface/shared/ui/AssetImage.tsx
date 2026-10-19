import { useEffect, useState } from 'react';

/** An <img> that moves to the next candidate URL when one fails to load (see domain/assets). */
export function AssetImage({ candidates, alt = '', className }: { candidates: string[]; alt?: string; className?: string }) {
  const [index, setIndex] = useState(0);
  const key = candidates.join('|');
  useEffect(() => setIndex(0), [key]);
  const src = candidates[index];
  if (!src) return null;
  return <img src={src} alt={alt} className={className} draggable={false} onError={() => setIndex((i) => i + 1)} />;
}
