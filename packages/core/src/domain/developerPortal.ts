import { createI18n } from './i18n';
/** Pure rules of the in-client developer page: command form validation and the show-once bot token state. */
import { CommandType } from '../contracts/rest';

export type CommandFormType = typeof CommandType.CHAT_INPUT | typeof CommandType.USER | typeof CommandType.MESSAGE;

export interface CommandForm {
  type: CommandFormType;
  name: string;
  description: string;
}

export interface CommandFormErrors {
  name?: string;
  description?: string;
}

export const COMMAND_NAME_MAX = 32;
export const COMMAND_DESCRIPTION_MAX = 100;
export const APPLICATION_NAME_MIN = 2;
export const APPLICATION_NAME_MAX = 32;
export const APPLICATION_DESCRIPTION_MAX = 400;

const length = (value: string): number => Array.from(value).length;
const CHAT_INPUT_NAME = /^[-_\p{L}\p{N}]+$/u;

/** Mirrors the API: CHAT_INPUT names are lowercase letters, digits, - or _; USER and MESSAGE names may contain spaces. */
export function validateCommandForm(form: CommandForm, locale?: string): CommandFormErrors {
  const { t, catalogText } = createI18n(locale);
  const errors: CommandFormErrors = {};
  const name = form.type === CommandType.CHAT_INPUT ? form.name : form.name.trim();
  const len = length(name);
  if (len < 1) errors.name = catalogText('Enter a name.');
  else if (len > COMMAND_NAME_MAX) errors.name = t("validation.maximumCharacters", { count: COMMAND_NAME_MAX });
  else if (form.type === CommandType.CHAT_INPUT) {
    if (!CHAT_INPUT_NAME.test(name) || name !== name.toLowerCase()) errors.name = catalogText('Use lowercase letters, numbers, - or _ (no spaces).');
  }
  if (form.type === CommandType.CHAT_INPUT) {
    const d = length(form.description.trim());
    if (d < 1) errors.description = catalogText('Enter a description.');
    else if (d > COMMAND_DESCRIPTION_MAX) errors.description = t("validation.maximumCharacters", { count: COMMAND_DESCRIPTION_MAX });
  }
  return errors;
}

/** Request body of `POST /applications/{id}/commands`: context-menu commands carry no description. */
export function commandBody(form: CommandForm): { type: number; name: string; description: string } {
  return form.type === CommandType.CHAT_INPUT
    ? { type: form.type, name: form.name, description: form.description.trim() }
    : { type: form.type, name: form.name.trim(), description: '' };
}

export function validateApplicationForm(name: string, description: string, locale?: string): { name?: string; description?: string } {
  const { t } = createI18n(locale);
  const errors: { name?: string; description?: string } = {};
  const n = length(name.trim());
  if (n < APPLICATION_NAME_MIN || n > APPLICATION_NAME_MAX) errors.name = t("validation.characterRange", { min: APPLICATION_NAME_MIN, max: APPLICATION_NAME_MAX });
  if (length(description) > APPLICATION_DESCRIPTION_MAX) errors.description = t("validation.maximumCharacters", { count: APPLICATION_DESCRIPTION_MAX });
  return errors;
}

export const COMMAND_TYPE_LABEL: Record<number, string> = { [CommandType.CHAT_INPUT]: 'Slash', [CommandType.USER]: 'User', [CommandType.MESSAGE]: 'Message' };

/**
 * The bot token lives only in component state: a reset reveals it once, and it disappears on dismiss,
 * when another application is selected, or when the page closes. It is never stored or logged.
 */
export type TokenReveal = { applicationId: string; token: string } | null;
export type TokenAction = { kind: 'reveal'; applicationId: string; token: string } | { kind: 'dismiss' } | { kind: 'select'; applicationId: string | null };

export function tokenReducer(state: TokenReveal, action: TokenAction): TokenReveal {
  switch (action.kind) {
    case 'reveal':
      return { applicationId: action.applicationId, token: action.token };
    case 'dismiss':
      return null;
    case 'select':
      return state && state.applicationId === action.applicationId ? state : null;
  }
}

/** The token to show for an application, or null when it is not (or no longer) revealed. */
export function visibleToken(state: TokenReveal, applicationId: string): string | null {
  return state && state.applicationId === applicationId ? state.token : null;
}
