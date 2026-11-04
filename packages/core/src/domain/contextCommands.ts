/** Context-menu application commands (USER and MESSAGE types): extraction, the Apps submenu and the interaction payload. */
import { CommandType, type ApplicationCommand } from '../contracts/rest';
import { item, sep, type MenuModel } from './menuModel';

export type ContextCommandKind = 'user' | 'message';

export interface ContextCommand {
  id: string;
  applicationId: string;
  appName: string;
  name: string;
  kind: ContextCommandKind;
}

const KIND_OF_TYPE: Record<number, ContextCommandKind | undefined> = { [CommandType.USER]: 'user', [CommandType.MESSAGE]: 'message' };

/** Keeps the USER and MESSAGE commands of a command index; duplicates (same id) collapse. */
export function extractContextCommands(commands: ApplicationCommand[], appNames: Record<string, string>): ContextCommand[] {
  const seen = new Set<string>();
  const out: ContextCommand[] = [];
  for (const c of commands) {
    const kind = KIND_OF_TYPE[c.type ?? CommandType.CHAT_INPUT];
    if (!kind || seen.has(c.id)) continue;
    seen.add(c.id);
    out.push({ id: c.id, applicationId: c.application_id, appName: appNames[c.application_id] ?? 'Application', name: c.name, kind });
  }
  return out;
}

/**
 * The "Apps" submenu for a message or a user, or null when no installed application offers a command of
 * that kind. With several applications the commands are grouped under the application's name.
 */
export function appsSubmenu(commands: readonly ContextCommand[] | undefined, kind: ContextCommandKind): MenuModel | null {
  const mine = (commands ?? []).filter((c) => c.kind === kind);
  if (mine.length === 0) return null;
  const apps = new Map<string, ContextCommand[]>();
  for (const c of mine) apps.set(c.applicationId, [...(apps.get(c.applicationId) ?? []), c]);
  const groups = [...apps.values()]
    .map((list) => list.slice().sort((a, b) => a.name.localeCompare(b.name)))
    .sort((a, b) => a[0]!.appName.localeCompare(b[0]!.appName));
  const items: MenuModel[] = [];
  for (const g of groups) {
    if (groups.length > 1) {
      if (items.length > 0) items.push(sep());
      items.push({ kind: 'label', label: g[0]!.appName });
    }
    for (const c of g) items.push(item('appCommand', c.name, { arg: c.id }));
  }
  return { kind: 'submenu', id: 'apps', label: 'Apps', items };
}

/** `data` of an APPLICATION_COMMAND interaction for a context-menu command; `targetId` is the message or user. */
export function buildContextCommandData(command: ContextCommand, targetId: string): { id: string; name: string; type: number; target_id: string } {
  return { id: command.id, name: command.name, type: command.kind === 'user' ? CommandType.USER : CommandType.MESSAGE, target_id: targetId };
}
