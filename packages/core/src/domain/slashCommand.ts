import { createI18n } from './i18n';
/** Pure parsing, search, validation and payload building for application (slash) commands. */
import {
  CommandOptionType as OptionType,
  CommandType,
  type ApplicationCommand,
  type ApplicationCommandOption,
  type MessageComponent,
} from '../contracts/rest';

/** One invocable command: a command, or a subcommand (group) leaf of one. */
export interface SlashEntry {
  key: string;
  label: string;
  description: string;
  command: ApplicationCommand;
  /** Subcommand group / subcommand names leading to the leaf. */
  path: string[];
  options: ApplicationCommandOption[];
}

export type OptionValues = Record<string, string>;

/** The text after a leading `/`, or null when the composer is not in command-search mode. */
export function slashQuery(text: string): string | null {
  const m = /^\/([\w -]*)$/.exec(text);
  return m ? m[1]!.toLowerCase() : null;
}

function leaves(command: ApplicationCommand, options: ApplicationCommandOption[], path: string[], out: SlashEntry[]): void {
  const nested = options.filter((o) => o.type === OptionType.SUB_COMMAND || o.type === OptionType.SUB_COMMAND_GROUP);
  if (nested.length === 0) {
    const label = [command.name, ...path].join(' ');
    out.push({ key: `${command.id}:${path.join('.')}`, label, description: command.description, command, path, options });
    return;
  }
  for (const o of nested) {
    if (o.type === OptionType.SUB_COMMAND_GROUP) leaves(command, o.options ?? [], [...path, o.name], out);
    else {
      const full = [...path, o.name];
      out.push({ key: `${command.id}:${full.join('.')}`, label: [command.name, ...full].join(' '), description: o.description, command, path: full, options: o.options ?? [] });
    }
  }
}

export function flattenCommands(commands: ApplicationCommand[]): SlashEntry[] {
  const out: SlashEntry[] = [];
  for (const c of commands) {
    if ((c.type ?? CommandType.CHAT_INPUT) !== CommandType.CHAT_INPUT) continue;
    leaves(c, c.options ?? [], [], out);
  }
  return out;
}

export function searchEntries(entries: SlashEntry[], query: string, limit = 25): SlashEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries.slice(0, limit);
  const starts: SlashEntry[] = [];
  const contains: SlashEntry[] = [];
  for (const e of entries) {
    const label = e.label.toLowerCase();
    if (label.startsWith(q)) starts.push(e);
    else if (label.includes(q)) contains.push(e);
  }
  return [...starts, ...contains].slice(0, limit);
}

export function validateValues(options: ApplicationCommandOption[], values: OptionValues, locale?: string): Record<string, string> {
  const { t, catalogText } = createI18n(locale);
  const errors: Record<string, string> = {};
  for (const o of options) {
    const raw = values[o.name] ?? '';
    if (raw === '') {
      if (o.required) errors[o.name] = catalogText("Required");
      continue;
    }
    if (o.choices && o.choices.length > 0 && !o.choices.some((c) => String(c.value) === raw)) {
      errors[o.name] = catalogText("Pick one of the choices");
      continue;
    }
    if (o.type === OptionType.INTEGER || o.type === OptionType.NUMBER) {
      const n = Number(raw);
      if (!Number.isFinite(n) || (o.type === OptionType.INTEGER && !Number.isInteger(n))) {
        errors[o.name] = o.type === OptionType.INTEGER ? catalogText("Must be a whole number") : catalogText("Must be a number");
      } else if (o.min_value !== undefined && n < o.min_value) errors[o.name] = t("validation.minimumNumber", { count: o.min_value });
      else if (o.max_value !== undefined && n > o.max_value) errors[o.name] = t("validation.maximumNumber", { count: o.max_value });
    } else if (o.type === OptionType.STRING) {
      if (o.min_length !== undefined && raw.length < o.min_length) errors[o.name] = t("validation.minCharacters", { count: o.min_length });
      else if (o.max_length !== undefined && raw.length > o.max_length) errors[o.name] = t("validation.maxCharacters", { count: o.max_length });
    }
  }
  return errors;
}

function coerce(type: number, raw: string): string | number | boolean {
  if (type === OptionType.INTEGER) return Math.trunc(Number(raw));
  if (type === OptionType.NUMBER) return Number(raw);
  if (type === OptionType.BOOLEAN) return raw === 'true';
  return raw;
}

interface WireOption {
  name: string;
  type: number;
  value?: string | number | boolean;
  options?: WireOption[];
}

function nestingKinds(entry: SlashEntry): number[] {
  const kinds: number[] = [];
  let level = entry.command.options ?? [];
  for (const name of entry.path) {
    const found = level.find((o) => o.name === name);
    kinds.push(found?.type ?? OptionType.SUB_COMMAND);
    level = found?.options ?? [];
  }
  return kinds;
}

/** The `data` of an APPLICATION_COMMAND interaction. */
export function buildCommandData(entry: SlashEntry, values: OptionValues): { id: string; name: string; type: number; options: WireOption[] } {
  let options: WireOption[] = entry.options
    .filter((o) => (values[o.name] ?? '') !== '')
    .map((o) => ({ name: o.name, type: o.type, value: coerce(o.type, values[o.name]!) }));
  const kinds = nestingKinds(entry);
  for (let i = entry.path.length - 1; i >= 0; i--) {
    options = [{ name: entry.path[i]!, type: kinds[i]!, options }];
  }
  return { id: entry.command.id, name: entry.command.name, type: CommandType.CHAT_INPUT, options };
}

/** The `data` of a MESSAGE_COMPONENT interaction. */
export function buildComponentData(component: Pick<MessageComponent, 'type' | 'custom_id'>, values?: string[]): { custom_id: string; component_type: number; values?: string[] } {
  return { custom_id: component.custom_id ?? '', component_type: component.type, ...(values ? { values } : {}) };
}

/** The `data` of a MODAL_SUBMIT interaction: one text input per action row. */
export function buildModalSubmitData(customId: string, fields: Record<string, string>): { custom_id: string; components: MessageComponent[] } {
  return {
    custom_id: customId,
    components: Object.entries(fields).map(([id, value]) => ({ type: 1, components: [{ type: 4, custom_id: id, value }] })),
  };
}

/** The text inputs of a modal, found inside its action rows. */
export function modalInputs(components: MessageComponent[]): MessageComponent[] {
  return components.flatMap((c) => (c.type === 1 ? modalInputs(c.components ?? []) : c.type === 4 ? [c] : []));
}

/** What each input starts with: its own pre-filled value, else empty. */
export function modalInitialValues(inputs: readonly MessageComponent[]): Record<string, string> {
  return Object.fromEntries(inputs.map((i) => [i.custom_id ?? '', i.value ?? '']));
}

/** A modal can be submitted once every required input (required unless it says otherwise) has text. */
export function modalReady(inputs: readonly MessageComponent[], values: Record<string, string>): boolean {
  return inputs.every((i) => !(i.required ?? true) || (values[i.custom_id ?? ''] ?? '').trim() !== '');
}

export interface SelectLimits {
  min: number;
  max: number;
}

/** How many options a select menu needs and allows picked; one of one by default. */
export function selectLimits(component: Pick<MessageComponent, 'min_values' | 'max_values'>): SelectLimits {
  return { min: component.min_values ?? 1, max: component.max_values ?? 1 };
}

/** Toggles one option of a multi-select, never beyond the maximum. */
export function toggleSelected(picked: readonly string[], value: string, max: number): string[] {
  if (picked.includes(value)) return picked.filter((v) => v !== value);
  return picked.length < max ? [...picked, value] : [...picked];
}

export type ButtonTone = 'primary' | 'secondary' | 'success' | 'danger' | 'link';
const BUTTON_TONES: Record<number, ButtonTone> = { 1: 'primary', 2: 'secondary', 3: 'success', 4: 'danger', 5: 'link' };

/** Style number of a button (1 primary, 2 secondary, 3 success, 4 danger, 5 link) as a name. */
export const buttonTone = (style: number | undefined): ButtonTone => BUTTON_TONES[style ?? 1] ?? 'secondary';

/** A link button opens only http and https addresses. */
export function safeComponentUrl(url: string | undefined): string | null {
  try {
    const u = new URL(url ?? '');
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}
