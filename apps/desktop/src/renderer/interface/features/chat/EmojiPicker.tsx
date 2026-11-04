import { MagnifyingGlass } from '@phosphor-icons/react';
import { useMemo, useRef, useState } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { EMOJI_CATEGORIES, SKIN_TONES, applySkinTone, supportsSkinTone, usableEmojiGroups } from '@discordy/core/domain/emojiModel';
import { quickApiForm } from '@discordy/core/domain/quickReactions';
import { Permission } from '@discordy/core/contracts/permissions';
import type { Emoji } from '@discordy/core/contracts/rest';
import { useConnectionStore } from '../../app/connectionStore';
import { can, useChannelPermissions } from '../../shared/hooks/usePermissions';

export interface PickedEmoji {
  /** Reaction/API form: unicode character or `name:id`. */
  api: string;
  /** Composer text form. */
  text: string;
  emoji: Emoji;
}

const TONE_LABEL = ['Default skin tone', 'Light skin tone', 'Medium-light skin tone', 'Medium skin tone', 'Medium-dark skin tone', 'Dark skin tone'];

export function EmojiPicker({ guildId, channelId, onPick }: { guildId?: string | null; channelId?: string | null; onPick: (e: PickedEmoji) => void }) {
  const [query, setQuery] = useState('');
  const [toneOpen, setToneOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const cdn = useConnectionStore((s) => s.cdnUrl);
  const guilds = useGuildStore((s) => s.guilds);
  const perms = useChannelPermissions(channelId);
  const recent = usePrefsStore((s) => s.recentReactions);
  const tone = usePrefsStore((s) => s.skinTone);
  const setPref = usePrefsStore((s) => s.set);
  // Without a channel (e.g. a DM composer) external emoji are not restricted.
  const external = !channelId || !guildId || can(perms, Permission.USE_EXTERNAL_EMOJIS);
  const q = query.trim().toLowerCase();
  const groups = useMemo(() => usableEmojiGroups(Object.values(guilds), guildId, external, q), [guilds, guildId, external, q]);
  const usableIds = useMemo(() => new Set(groups.flatMap((g) => g.emoji.map((e) => e.id))), [groups]);
  const recents = q ? [] : recent.filter((e) => !e.id || usableIds.has(e.id));

  const pickUnicode = (c: string) => {
    const t = applySkinTone(c, tone);
    onPick({ api: t, text: t, emoji: { id: null, name: t } });
  };
  const jump = (id: string) => scroller.current?.querySelector(`[data-section="${id}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  const tabs = [
    ...(recents.length > 0 ? [{ id: 'recent', title: 'Frequently used', node: <span>🕘</span> }] : []),
    ...groups.map((g) => ({ id: `guild-${g.guildId}`, title: g.guildName, node: <span className="emoji-tab-guild">{g.guildName.slice(0, 1).toUpperCase()}</span> })),
    ...(q ? [] : EMOJI_CATEGORIES.map((c) => ({ id: c.id, title: c.label, node: <span>{c.icon}</span> }))),
  ];

  return (
    <div className="emoji-picker glass" role="dialog" aria-label="Emoji picker">
      <label className="emoji-search">
        <MagnifyingGlass size={14} />
        <input data-autofocus placeholder="Search emoji" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="button" className="emoji-tone-btn" aria-label="Skin tone" title="Skin tone" aria-expanded={toneOpen} onClick={() => setToneOpen((v) => !v)}>
          {applySkinTone('👋', tone)}
        </button>
      </label>
      {toneOpen && (
        <div className="emoji-tones" role="radiogroup" aria-label="Skin tone">
          {SKIN_TONES.map((t, i) => (
            <button key={i} type="button" role="radio" aria-checked={tone === t} aria-label={TONE_LABEL[i]} title={TONE_LABEL[i]} className={tone === t ? 'is-on' : undefined} onClick={() => { setPref('skinTone', t); setToneOpen(false); }}>
              {applySkinTone('👋', t)}
            </button>
          ))}
        </div>
      )}
      <nav className="emoji-tabs" aria-label="Emoji categories">
        {tabs.map((t) => (
          <button key={t.id} type="button" title={t.title} aria-label={t.title} onClick={() => jump(t.id)}>{t.node}</button>
        ))}
      </nav>
      <div className="emoji-scroll" ref={scroller}>
        {recents.length > 0 && (
          <section data-section="recent">
            <h4>Frequently used</h4>
            <div className="emoji-grid">
              {recents.map((e) => (
                <button
                  key={quickApiForm(e)}
                  type="button"
                  title={e.id ? `:${e.name}:` : e.name}
                  onClick={() => (e.id ? onPick({ api: quickApiForm(e), text: `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>`, emoji: { id: e.id, name: e.name, animated: e.animated } }) : onPick({ api: e.name, text: e.name, emoji: { id: null, name: e.name } }))}
                >
                  {e.id ? <img src={`${cdn}/emojis/${e.id}.${e.animated ? 'gif' : 'png'}`} alt={e.name} draggable={false} /> : e.name}
                </button>
              ))}
            </div>
          </section>
        )}
        {groups.map((g) => (
          <section key={g.guildId} data-section={`guild-${g.guildId}`}>
            <h4>{g.guildName}{g.guildId !== guildId ? ' (other server)' : ''}</h4>
            <div className="emoji-grid">
              {g.emoji.map((e) => (
                <button key={e.id} type="button" title={`:${e.name}:`} onClick={() => onPick({ api: `${e.name}:${e.id}`, text: `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>`, emoji: e })}>
                  <img src={`${cdn}/emojis/${e.id}.${e.animated ? 'gif' : 'png'}`} alt={e.name} draggable={false} />
                </button>
              ))}
            </div>
          </section>
        ))}
        {!q &&
          EMOJI_CATEGORIES.map((c) => (
            <section key={c.id} data-section={c.id}>
              <h4>{c.label}</h4>
              <div className="emoji-grid">
                {c.emoji.map((ch) => (
                  <button key={ch} type="button" onClick={() => pickUnicode(ch)}>
                    {supportsSkinTone(ch) ? applySkinTone(ch, tone) : ch}
                  </button>
                ))}
              </div>
            </section>
          ))}
        {q && groups.length === 0 && <p className="emoji-none">No emoji match “{query}”.</p>}
      </div>
    </div>
  );
}
