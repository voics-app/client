import { createI18n, resolveLocale } from '@discordy/core/domain/i18n';
/** Maps the renderer's unread/mention counts onto OS surfaces through a port, so the rules stay testable. */
import { renderOverlay, withStateDot, type Bitmap } from './badgeBitmap';

export interface ActivityState {
  mentions: number;
  unread: number;
}

export type AttentionLevel = 'none' | 'unread' | 'mentions';

export interface AttentionPort {
  setOverlay(image: Bitmap | null, description: string): void;
  setBadgeCount(count: number): void;
  setTitle(title: string): void;
  setTray(image: Bitmap | null, tooltip: string): void;
}

export function normalize(state: ActivityState): ActivityState {
  const clean = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);
  return { mentions: clean(state.mentions), unread: clean(state.unread) };
}

export function attentionLevel(state: ActivityState): AttentionLevel {
  return state.mentions > 0 ? 'mentions' : state.unread > 0 ? 'unread' : 'none';
}

/** "(3) Name" for mentions, a bullet for unread only, plain name otherwise. */
export function windowTitle(brandName: string, state: ActivityState, locale?: string): string {
  if (state.mentions > 0) return `(${state.mentions > 99 ? `${createI18n(locale).number(99)}+` : createI18n(locale).number(state.mentions)}) ${brandName}`;
  if (state.unread > 0) return `• ${brandName}`;
  return brandName;
}

export function describeActivity(state: ActivityState, locale?: string): string {
  const intl = createI18n(locale);
  const parts: string[] = [];
  if (state.mentions > 0) parts.push(intl.t('native.mentions', { count: state.mentions }));
  if (state.unread > 0) parts.push(intl.t('native.unreadChannels', { count: state.unread }));
  return new Intl.ListFormat(intl.locale, { type: 'unit' }).format(parts);
}

export function trayTooltip(brandName: string, state: ActivityState, locale?: string): string {
  const detail = describeActivity(state, locale);
  return detail ? `${brandName} - ${detail}` : brandName;
}

export class AttentionPresenter {
  private state: ActivityState = { mentions: 0, unread: 0 };
  private locale = 'en-US';

  setLocale(locale: string): void {
    this.locale = resolveLocale(locale);
    this.apply(this.state);
  }

  constructor(
    private readonly port: AttentionPort,
    private readonly brandName: string,
    private readonly trayBase: () => Bitmap | null,
    private readonly platform: NodeJS.Platform,
  ) {}

  apply(raw: ActivityState): void {
    const state = normalize(raw);
    this.state = state;
    const level = attentionLevel(state);
    if (this.platform === 'win32') this.port.setOverlay(renderOverlay(state.mentions, state.unread), describeActivity(state, this.locale));
    else this.port.setBadgeCount(state.mentions);
    this.port.setTitle(windowTitle(this.brandName, state, this.locale));
    const base = this.trayBase();
    this.port.setTray(base && level !== 'none' ? withStateDot(base, level) : base, trayTooltip(this.brandName, state, this.locale));
  }
}
