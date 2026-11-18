import { useI18n } from '../../shared/i18n';
import { ArrowSquareOut } from '@phosphor-icons/react';
import { useState } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { ComponentType, CommandOptionType, type Message, type MessageComponent } from '@discordy/core/contracts/rest';
import { buttonTone, safeComponentUrl, selectLimits, toggleSelected } from '@discordy/core/domain/slashCommand';
import { reportError } from '../../app/actions';
import { useConnectionStore } from '../../app/connectionStore';
import { getRuntime } from '../../app/runtime';
import { Select } from '../../shared/ui/Form';
import { EntityPicker } from './SlashCommandPanel';

const ENTITY_SELECTS: Record<number, number> = {
  [ComponentType.USER_SELECT]: CommandOptionType.USER,
  [ComponentType.ROLE_SELECT]: CommandOptionType.ROLE,
  [ComponentType.MENTIONABLE_SELECT]: CommandOptionType.MENTIONABLE,
  [ComponentType.CHANNEL_SELECT]: CommandOptionType.CHANNEL,
};

/** Sends a component interaction; keeps the control disabled while the request is in flight. */
function usePress(message: Message) {
  const { t: msg } = useI18n();
  const [busy, setBusy] = useState(false);
  const press = async (component: MessageComponent, values?: string[]) => {
    setBusy(true);
    try {
      await getRuntime().interactions.pressComponent(message, component, values);
    } catch (e) {
      reportError(e, msg("settings.messagecomponents.interaction.failed"));
    } finally {
      setBusy(false);
    }
  };
  return { busy, press };
}

function EmojiLabel({ component }: { component: MessageComponent }) {
  const cdn = useConnectionStore((s) => s.cdnUrl);
  const e = component.emoji;
  if (!e) return null;
  return e.id ? <img className="component-emoji" src={`${cdn}/emojis/${e.id}.${e.animated ? 'gif' : 'png'}`} alt={e.name ?? ''} /> : <span aria-hidden="true">{e.name}</span>;
}

function ButtonView({ message, component }: { message: Message; component: MessageComponent }) {
  const { busy, press } = usePress(message);
  const tone = buttonTone(component.style);
  if (tone === 'link') {
    const href = safeComponentUrl(component.url);
    return (
      <a className="component-btn is-link" href={href ?? undefined} target="_blank" rel="noreferrer" aria-disabled={!href || component.disabled || undefined}>
        <EmojiLabel component={component} />
        {component.label}
        <ArrowSquareOut size={13} />
      </a>
    );
  }
  return (
    <button type="button" className={`component-btn is-${tone}`} disabled={component.disabled || busy} onClick={() => void press(component)}>
      <EmojiLabel component={component} />
      {component.label}
    </button>
  );
}

function StringSelect({ message, component }: { message: Message; component: MessageComponent }) {
  const { t: msg } = useI18n();
  const { busy, press } = usePress(message);
  const [picked, setPicked] = useState<string[]>(() => (component.options ?? []).filter((o) => o.default).map((o) => o.value));
  const { min, max } = selectLimits(component);
  const multi = max > 1;
  const label = component.placeholder ?? msg("settings.messagecomponents.select.an.option");
  if (!multi) {
    return (
      <Select aria-label={label} value={picked[0] ?? ''} disabled={component.disabled || busy} onChange={(e) => { setPicked([e.target.value]); void press(component, [e.target.value]); }}>
        <option value="" disabled>{label}</option>
        {(component.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    );
  }
  const toggle = (value: string) => setPicked((cur) => toggleSelected(cur, value, component.max_values ?? 25));
  return (
    <fieldset className="component-multi" disabled={component.disabled || busy}>
      <legend>{label}</legend>
      {(component.options ?? []).map((o) => (
        <label key={o.value} className="component-multi-option">
          <input type="checkbox" checked={picked.includes(o.value)} onChange={() => toggle(o.value)} />
          <span>{o.label}</span>
          {o.description && <small>{o.description}</small>}
        </label>
      ))}
      <button type="button" className="component-btn is-primary" disabled={picked.length < min} onClick={() => void press(component, picked)}>{msg("settings.messagecomponents.apply")}</button>
    </fieldset>
  );
}

function EntitySelect({ message, component }: { message: Message; component: MessageComponent }) {
  const { t: msg } = useI18n();
  const { busy, press } = usePress(message);
  const channel = useGuildStore((s) => s.channels[message.channel_id]);
  const [value, setValue] = useState('');
  if (!channel) return null;
  const option = { type: ENTITY_SELECTS[component.type]!, name: component.placeholder ?? msg("settings.messagecomponents.select"), required: true, channel_types: component.channel_types };
  return (
    <fieldset className="component-entity" disabled={component.disabled || busy}>
      <EntityPicker option={option} value={value} channel={channel} onChange={(v) => { setValue(v); if (v) void press(component, [v]); }} />
    </fieldset>
  );
}

function ComponentView({ message, component }: { message: Message; component: MessageComponent }) {
  if (component.type === ComponentType.BUTTON) return <ButtonView message={message} component={component} />;
  if (component.type === ComponentType.STRING_SELECT) return <StringSelect message={message} component={component} />;
  if (ENTITY_SELECTS[component.type]) return <EntitySelect message={message} component={component} />;
  return null;
}

/** Action rows of buttons and select menus attached to a message. */
export function MessageComponents({ message }: { message: Message }) {
  const rows = (message.components ?? []).filter((c) => c.type === ComponentType.ACTION_ROW);
  if (rows.length === 0) return null;
  return (
    <div className="message-components">
      {rows.map((row, i) => (
        <div key={i} className="component-row" role="group">
          {(row.components ?? []).map((c, j) => <ComponentView key={c.custom_id ?? j} message={message} component={c} />)}
        </div>
      ))}
    </div>
  );
}
