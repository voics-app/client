import { useI18n } from '../i18n';
import type { ReactNode } from 'react';

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function Skeleton({ width, height = 12, radius = 6 }: { width?: number | string; height?: number; radius?: number }) {
  return <span className="skeleton" style={{ width: width ?? '100%', height, borderRadius: radius }} aria-hidden="true" />;
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden="true">
        {icon}
      </div>
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {action}
    </div>
  );
}

export function Count({ value, tone = 'accent' }: { value: number; tone?: 'accent' | 'danger' }) {
  const { number } = useI18n();
  if (value <= 0) return null;
  return <span className={`count count-${tone} tnum`}>{value > 99 ? `${number(99)}+` : number(value)}</span>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="eyebrow">{children}</span>;
}
