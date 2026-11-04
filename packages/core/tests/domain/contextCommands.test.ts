import { describe, expect, it } from 'vitest';
import { appsSubmenu, buildContextCommandData, extractContextCommands } from '@discordy/core/domain/contextCommands';
import { idsOf } from '@discordy/core/domain/menuModel';
import { buildMessageMenu, type MessageMenuContext } from '@discordy/core/domain/messageMenuModel';
import { DEFAULT_QUICK_REACTIONS } from '@discordy/core/domain/quickReactions';
import { userMenuGroups, type UserMenuInput } from '@discordy/core/domain/userMenuModel';
import type { MemberCapabilities } from '@discordy/core/domain/memberModeration';
import type { ApplicationCommand } from '@discordy/core/contracts/rest';

const cmd = (id: string, type: number, name: string, app = 'a1'): ApplicationCommand => ({ id, type, name, description: type === 1 ? 'd' : '', application_id: app });
const names = { a1: 'Dice Bot', a2: 'Alpha' };
const all = extractContextCommands([cmd('1', 1, 'roll'), cmd('2', 2, 'Show Stats'), cmd('3', 3, 'Translate'), cmd('4', 3, 'Quote', 'a2'), cmd('3', 3, 'Translate')], names);

const msgCtx = (over: Partial<MessageMenuContext> = {}): MessageMenuContext => ({
  isMine: false,
  standard: true,
  canReact: false,
  canManageMessages: false,
  canCreateThread: false,
  forwardSupported: false,
  canSpeak: false,
  hasText: true,
  pinned: false,
  selection: '',
  canAddEmoji: false,
  quick: DEFAULT_QUICK_REACTIONS,
  appCommands: all,
  ...over,
});
const caps = { isSelf: false } as MemberCapabilities;
const userInput = (over: Partial<UserMenuInput> = {}): UserMenuInput => ({
  caps,
  inGuild: true,
  inVoice: false,
  canMention: true,
  relationship: undefined,
  isBot: false,
  hasVoiceAudio: false,
  appCommands: all,
  ...over,
});
const target = { kind: 'message' } as const;

describe('extractContextCommands', () => {
  it('keeps USER and MESSAGE commands only, drops duplicates and resolves the application name', () => {
    expect(all.map((c) => [c.id, c.kind, c.appName])).toEqual([
      ['2', 'user', 'Dice Bot'],
      ['3', 'message', 'Dice Bot'],
      ['4', 'message', 'Alpha'],
    ]);
  });
});

describe('Apps submenu', () => {
  it('lists only MESSAGE commands for messages, grouped by application when there are several', () => {
    const menu = appsSubmenu(all, 'message');
    expect(menu).toMatchObject({ kind: 'submenu', id: 'apps', label: 'Apps' });
    const items = (menu as { items: { kind: string; label?: string }[] }).items;
    expect(items.map((i) => i.label ?? i.kind)).toEqual(['Alpha', 'Quote', 'separator', 'Dice Bot', 'Translate']);
  });
  it('skips application headings when only one application offers commands', () => {
    const one = extractContextCommands([cmd('2', 2, 'B'), cmd('3', 2, 'A')], names);
    expect((appsSubmenu(one, 'user') as { items: { label: string }[] }).items.map((i) => i.label)).toEqual(['A', 'B']);
  });
  it('is absent without matching commands', () => {
    expect(appsSubmenu(undefined, 'user')).toBeNull();
    expect(appsSubmenu(all.filter((c) => c.kind === 'message'), 'user')).toBeNull();
  });
});

describe('menus', () => {
  it('message menu carries the Apps submenu with message commands', () => {
    const ids = idsOf(buildMessageMenu(msgCtx(), target));
    expect(ids).toContain('apps');
    expect(ids.filter((i) => i === 'appCommand')).toHaveLength(2);
  });
  it('message menu omits Apps without commands or for ephemeral and P2P messages', () => {
    expect(idsOf(buildMessageMenu(msgCtx({ appCommands: [] }), target))).not.toContain('apps');
    expect(idsOf(buildMessageMenu(msgCtx({ appCommands: all.filter((c) => c.kind === 'user') }), target))).not.toContain('apps');
    expect(idsOf(buildMessageMenu(msgCtx({ standard: false }), target))).not.toContain('apps');
  });
  it('Apps does not depend on developer mode', () => {
    for (const developerMode of [true, false]) {
      expect(idsOf(buildMessageMenu(msgCtx({ developerMode }), target))).toContain('apps');
      expect(userMenuGroups(userInput({ developerMode })).flat()).toContain('apps');
    }
  });
  it('user menu shows Apps only when a USER command exists', () => {
    expect(userMenuGroups(userInput()).flat()).toContain('apps');
    expect(userMenuGroups(userInput({ appCommands: all.filter((c) => c.kind === 'message') })).flat()).not.toContain('apps');
    expect(userMenuGroups(userInput({ appCommands: undefined })).flat()).not.toContain('apps');
  });
});

describe('buildContextCommandData', () => {
  it('targets the message or user with the matching command type', () => {
    expect(buildContextCommandData(all[0]!, 'u9')).toEqual({ id: '2', name: 'Show Stats', type: 2, target_id: 'u9' });
    expect(buildContextCommandData(all[1]!, 'm9')).toEqual({ id: '3', name: 'Translate', type: 3, target_id: 'm9' });
  });
});
