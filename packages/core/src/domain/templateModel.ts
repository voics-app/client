import { createI18n } from './i18n';
import { brand } from './brandConfig';
import { landingOrigin } from './inviteLinks';
import { ChannelType, type GuildTemplate } from '../contracts/rest';

/** Server templates: link parsing and the preview a template link opens. */

const CODE = /^[A-Za-z0-9-]{2,64}$/;

export const BUILTIN_PREFIX = 'builtin-';

export function isBuiltinTemplate(code: string): boolean {
  return code.startsWith(BUILTIN_PREFIX);
}

/** Extracts the code from a bare code, a web `/template/<code>` link or a `<scheme>://template/<code>` link; `null` when it is none of them. */
export function parseTemplateCode(input: string): string | null {
  const text = input.trim();
  if (CODE.test(text)) return text;
  try {
    const url = new URL(text);
    const web = url.protocol === 'http:' || url.protocol === 'https:';
    const code = web
      ? url.pathname === '/template.html' ? url.searchParams.get('code') : /^\/template\/([^/]+)\/?$/.exec(url.pathname)?.[1]
      : url.hostname === 'template' ? /^\/([^/]+)\/?$/.exec(url.pathname)?.[1] : null;
    return code && CODE.test(code) ? code : null;
  } catch {
    return null;
  }
}

/** Public preview for recipients who may not have the app installed yet. */
export function templateShareLink(code: string, apiUrl = brand().apiUrl): string {
  return `${landingOrigin(apiUrl)}/template.html?code=${encodeURIComponent(code)}`;
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
export function templateSummary(template: GuildTemplate, locale?: string): string {
  const { roles, channelCount } = previewTemplate(template);
  return createI18n(locale).t("template.summary", { channels: channelCount, roles: roles.length });
}

export function usageLabel(count: number, locale?: string): string {
  return createI18n(locale).t("template.uses", { count });
}
