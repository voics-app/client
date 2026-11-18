import { useI18n } from '../../shared/i18n';
import type { Activity } from '@discordy/core/contracts/rest';
import { statusLine } from '@discordy/core/domain/memberList';
import { useConnectionStore } from '../../app/connectionStore';

/** Emoji plus text of a custom status (or the current activity), truncated by CSS with the full text in a tooltip. */
export function StatusLine({ activities, className, max }: { activities: readonly Activity[] | undefined; className?: string; max?: number }) {
  const { locale } = useI18n();
  const cdn = useConnectionStore((s) => s.cdnUrl);
  const line = statusLine(activities, max, locale);
  if (!line) return null;
  return (
    <span className={className} title={line.title}>
      {line.emoji?.id ? <img className="status-emoji" src={`${cdn}/emojis/${line.emoji.id}.png`} alt={line.emoji.name} draggable={false} /> : line.emoji ? <span className="status-emoji-char">{line.emoji.name} </span> : null}
      {line.text}
    </span>
  );
}
