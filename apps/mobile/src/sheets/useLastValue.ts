import { useRef } from 'react';

/** The latest non-null value, so a sheet keeps its content while it slides out after the parent cleared its state. */
export function useLastValue<T>(value: T | null): T | null {
  const last = useRef<T | null>(value);
  if (value !== null) last.current = value;
  return value ?? last.current;
}
