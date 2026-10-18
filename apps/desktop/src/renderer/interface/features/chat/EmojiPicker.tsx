import { MagnifyingGlass } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import type { Emoji } from '@shared/contracts/rest';
import { useConnectionStore } from '../../app/connectionStore';

const UNICODE: Record<string, string[]> = {
  Smileys: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '🙂', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😋', '😛', '🤪', '🤔', '🤨', '😐', '😑', '🙄', '😏', '😴', '😮', '😢', '😭', '😤', '😡', '🥳', '😎', '🤯', '😳', '🥺', '😱', '🤗', '🫡', '🫠'],
  Gestures: ['👍', '👎', '👏', '🙌', '🙏', '🤝', '👋', '✌️', '🤞', '🤟', '🤙', '💪', '👀', '🫶', '🖖', '👌'],
  Hearts: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '💖', '💯', '✨', '🔥', '⭐', '🎉', '🎊'],
  Things: ['🎮', '🎧', '🎵', '🍕', '🍔', '☕', '🍺', '🚀', '💡', '📌', '📎', '🔒', '🔑', '⚡', '🌙', '☀️', '🌈', '🐱', '🐶', '🦊'],
};

export interface PickedEmoji {
  /** Reaction/API form: unicode character or `name:id`. */
  api: string;
  /** Composer text form. */
  text: string;
  emoji: Emoji;
}

export function EmojiPicker({ guildId, onPick }: { guildId?: string | null; onPick: (e: PickedEmoji) => void }) {
  const [query, setQuery] = useState('');
  const cdn = useConnectionStore((s) => s.cdnUrl);
  const guilds = useGuildStore((s) => s.guilds);
  const custom = useMemo(
    () => Object.values(guilds).flatMap((g) => (g.emojis ?? []).filter((e) => e.id && e.name).map((e) => ({ ...e, guild: g.name }))),
    [guilds],
  );
  const q = query.trim().toLowerCase();
  const shownCustom = custom.filter((e) => !q || e.name!.toLowerCase().includes(q));
  void guildId;

  return (
    <div className="emoji-picker glass" role="dialog" aria-label="Emoji picker">
      <label className="emoji-search">
        <MagnifyingGlass size={14} />
        <input data-autofocus placeholder="Search emoji" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="emoji-scroll">
        {shownCustom.length > 0 && (
          <section>
            <h4>Server emoji</h4>
            <div className="emoji-grid">
              {shownCustom.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  title={`:${e.name}:`}
                  onClick={() => onPick({ api: `${e.name}:${e.id}`, text: `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>`, emoji: e })}
                >
                  <img src={`${cdn}/emojis/${e.id}.${e.animated ? 'gif' : 'png'}`} alt={e.name ?? ''} draggable={false} />
                </button>
              ))}
            </div>
          </section>
        )}
        {Object.entries(UNICODE).map(([group, list]) => {
          const filtered = q ? [] : list;
          if (filtered.length === 0) return null;
          return (
            <section key={group}>
              <h4>{group}</h4>
              <div className="emoji-grid">
                {filtered.map((c) => (
                  <button key={c} type="button" onClick={() => onPick({ api: c, text: c, emoji: { id: null, name: c } })}>
                    {c}
                  </button>
                ))}
              </div>
            </section>
          );
        })}
        {q && shownCustom.length === 0 && <p className="emoji-none">No emoji match “{query}”.</p>}
      </div>
    </div>
  );
}
