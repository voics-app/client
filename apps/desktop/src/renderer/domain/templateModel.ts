import { BRAND } from '@shared/brand';
import { ChannelType, type GuildTemplate } from '@discordy/core/contracts/rest';

/** Server templates: link parsing and the preview a template link opens. */

const CODE = /^[A-Za-z0-9-]{2,64}$/;

export const BUILTIN_PREFIX = 'builtin-';

export function isBuiltinTemplate(code: string): boolean {
  return code.startsWith(BUILTIN_PREFIX);
}

/** Extracts the code from a bare code, a web `/template/<code>` link or a `<scheme>://template/<code>` link; `null` when it is none of them. */
export function parseTemplateCode(input: string): string | null {
  const text = input.trim();
  if (/\s/.test(text)) return null;
  const m = /(?:template\/|\/)?([\w-]{2,64})\/?(?:[?#].*)?$/.exec(text);
  const code = m?.[1] ?? text;
  return CODE.test(code) ? code : null;
}

/** The link a manager shares; it opens the app on the template preview. */
export function templateShareLink(code: string): string {
  return `${BRAND.protocolScheme}://template/${encodeURIComponent(code)}`;
}

export interface PreviewChannel {
  name: string;
  type: number;
}

export interface PreviewGroup {
  /** `null` for channels that sit outside any category. */
  category: string | null;
  channels: PreviewChannel[];
}

export interface TemplatePreview {
  roles: string[];
  groups: PreviewGroup[];
  channelCount: number;
}

/** Roles (without @everyone) and channels grouped by category, in position order. */
export function previewTemplate(template: GuildTemplate): TemplatePreview {
  const { roles, channels } = template.serialized_source_guild;
  const byPosition = (a: { position: number; id: number }, b: { position: number; id: number }) => a.position - b.position || a.id - b.id;
  const categories = channels.filter((c) => c.type === ChannelType.GUILD_CATEGORY).sort(byPosition);
  const children = (parent: number | null) =>
    channels
      .filter((c) => c.type !== ChannelType.GUILD_CATEGORY && c.parent_id === parent)
      .sort(byPosition)
      .map((c) => ({ name: c.name, type: c.type }));
  const groups: PreviewGroup[] = [];
  const loose = children(null);
  if (loose.length > 0) groups.push({ category: null, channels: loose });
  for (const category of categories) groups.push({ category: category.name, channels: children(category.id) });
  return {
    roles: roles.filter((r) => r.id !== 0).map((r) => r.name),
    groups,
    channelCount: channels.filter((c) => c.type !== ChannelType.GUILD_CATEGORY).length,
  };
}

/** One-line summary such as "9 channels, 2 roles". */
export function templateSummary(template: GuildTemplate): string {
  const { roles, channelCount } = previewTemplate(template);
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  return `${plural(channelCount, 'channel')}, ${plural(roles.length, 'role')}`;
}

export function usageLabel(count: number): string {
  return count === 1 ? 'Used 1 time' : `Used ${count} times`;
}
