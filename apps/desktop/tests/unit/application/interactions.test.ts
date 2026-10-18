import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDispatchRouter } from '@renderer/application/dispatchRouter';
import { InteractionService } from '@renderer/application/interactionService';
import { useInteractionStore } from '@renderer/application/stores/interactionStore';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useMessageStore } from '@renderer/application/stores/messageStore';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { flattenCommands } from '@renderer/domain/slashCommand';
import type { ApiPort } from '@renderer/application/ports/api';
import type { ApplicationCommand, Channel, Message, User } from '@shared/contracts/rest';

const me: User = { id: '1', username: 'me', global_name: 'Me', avatar: null };
const bot: User = { id: '50', username: 'dicebot', global_name: 'Dice Bot', avatar: null, bot: true };

const roll: ApplicationCommand = {
  id: 'cmd-roll',
  application_id: 'app-1',
  name: 'roll',
  description: 'Roll',
  options: [{ type: 4, name: 'sides', description: 'Sides', required: true }],
};
const channel = { id: '200', type: 0, guild_id: '100', name: 'general', delivery_mode: 'standard', last_message_id: null } as Channel;

function fakeApi(over: Partial<Record<keyof ApiPort, unknown>> = {}) {
  return {
    applications: vi.fn(async () => [{ id: 'app-own', name: 'Mine' }]),
    globalCommands: vi.fn(async (id: string) => (id === 'app-1' ? [roll] : [])),
    guildCommands: vi.fn(async (id: string) => {
      if (id === 'app-own') return [{ ...roll, id: 'cmd-own', application_id: 'app-own', name: 'own' }];
      throw new Error('missing access');
    }),
    createInteraction: vi.fn(async () => ({ id: 'int-1' })),
    ...over,
  } as unknown as ApiPort;
}

beforeEach(() => {
  useInteractionStore.getState().reset();
  useMessageStore.getState().reset();
  useSessionStore.setState({ user: me });
  useGuildStore.getState().reset();
  useGuildStore.getState().upsertChannel(channel);
});

describe('interactionStore', () => {
  const pending = { id: 'int-1', channelId: '200', applicationId: 'app-1', appName: 'Dice Bot', label: 'roll', startedAt: 1 };

  it('tracks thinking placeholders per channel and resolves them', () => {
    const s = useInteractionStore.getState();
    s.addPending(pending);
    expect(useInteractionStore.getState().pending['200']).toHaveLength(1);
    s.resolvePending('200', 'int-1');
    expect(useInteractionStore.getState().pending['200']).toEqual([]);
  });

  it('expires stale placeholders', () => {
    const s = useInteractionStore.getState();
    s.addPending(pending);
    s.expirePending(1 + 16 * 60_000);
    expect(useInteractionStore.getState().pending['200']).toEqual([]);
  });

  it('remembers the owning application of an interaction', () => {
    useInteractionStore.getState().addPending(pending);
    expect(useInteractionStore.getState().applicationOf['int-1']).toBe('app-1');
  });

  it('opens and closes a modal', () => {
    const s = useInteractionStore.getState();
    s.openModal({ interactionId: 'i', applicationId: 'a', channelId: 'c', customId: 'm', title: 'T', components: [] });
    expect(useInteractionStore.getState().modal?.title).toBe('T');
    s.closeModal();
    expect(useInteractionStore.getState().modal).toBeNull();
  });
});

describe('dispatch routing', () => {
  const route = () => createDispatchRouter({ onVoiceServerUpdate: () => undefined, onIncomingMessage: () => undefined, invalidate: () => undefined });
  const reply = (extra: Partial<Message> = {}): Message => ({
    id: '900',
    channel_id: '200',
    guild_id: '100',
    author: bot,
    content: 'You rolled 4',
    timestamp: '2026-10-16T10:00:00.000Z',
    edited_timestamp: null,
    mention_everyone: false,
    mentions: [],
    mention_roles: [],
    attachments: [],
    embeds: [],
    pinned: false,
    type: 20,
    interaction_metadata: { id: 'int-1', type: 2, user: me },
    ...extra,
  });

  it('clears the thinking placeholder when the response message arrives', () => {
    useInteractionStore.getState().addPending({ id: 'int-1', channelId: '200', applicationId: 'app-1', appName: 'Dice Bot', label: 'roll', startedAt: Date.now() });
    route()('MESSAGE_CREATE', reply());
    expect(useInteractionStore.getState().pending['200']).toEqual([]);
    expect(useMessageStore.getState().timelines['200']?.byId['900']).toBeDefined();
  });

  it('keeps the placeholder for unrelated messages', () => {
    useInteractionStore.getState().addPending({ id: 'int-1', channelId: '200', applicationId: 'app-1', appName: 'Dice Bot', label: 'roll', startedAt: Date.now() });
    route()('MESSAGE_CREATE', reply({ interaction_metadata: undefined, type: 0 }));
    expect(useInteractionStore.getState().pending['200']).toHaveLength(1);
  });

  it('opens a modal on INTERACTION_MODAL_CREATE using the remembered application', () => {
    useInteractionStore.getState().addPending({ id: 'int-1', channelId: '200', applicationId: 'app-1', appName: 'Dice Bot', label: 'roll', startedAt: Date.now() });
    route()('INTERACTION_MODAL_CREATE', {
      interaction_id: 'int-1',
      channel_id: '200',
      data: { custom_id: 'feedback', title: 'Feedback', components: [{ type: 1, components: [{ type: 4, custom_id: 'text', label: 'Text' }] }] },
    });
    const modal = useInteractionStore.getState().modal;
    expect(modal).toMatchObject({ interactionId: 'int-1', applicationId: 'app-1', customId: 'feedback', title: 'Feedback' });
    expect(useInteractionStore.getState().pending['200']).toEqual([]);
  });
});

describe('InteractionService', () => {
  it('discovers global and guild commands, tolerating applications that refuse the request', async () => {
    const api = fakeApi();
    const service = new InteractionService(api);
    const entries = await service.loadCommands('100', [{ id: 'app-1', name: 'Dice Bot' }]);
    expect(entries.map((e) => e.label).sort()).toEqual(['own', 'roll']);
    expect(useInteractionStore.getState().appNames['app-1']).toBe('Dice Bot');
    expect(useInteractionStore.getState().appNames['app-own']).toBe('Mine');
    expect(useInteractionStore.getState().commands['100']).toHaveLength(2);
  });

  it('submits a command interaction and shows the thinking placeholder', async () => {
    const api = fakeApi();
    const service = new InteractionService(api);
    useInteractionStore.getState().setAppName('app-1', 'Dice Bot');
    const entry = flattenCommands([roll])[0]!;
    await service.invoke(channel, entry, { sides: '6' });
    expect(api.createInteraction).toHaveBeenCalledWith({
      type: 2,
      application_id: 'app-1',
      channel_id: '200',
      guild_id: '100',
      data: { id: 'cmd-roll', name: 'roll', type: 1, options: [{ name: 'sides', type: 4, value: 6 }] },
    });
    const [p] = useInteractionStore.getState().pending['200']!;
    expect(p).toMatchObject({ id: 'int-1', applicationId: 'app-1', appName: 'Dice Bot', label: 'roll' });
  });

  it('refuses to submit invalid options', async () => {
    const api = fakeApi();
    const service = new InteractionService(api);
    const entry = flattenCommands([roll])[0]!;
    await expect(service.invoke(channel, entry, {})).rejects.toThrow('sides: Required');
    expect(api.createInteraction).not.toHaveBeenCalled();
  });

  it('sends a component interaction for a message', async () => {
    const api = fakeApi();
    const service = new InteractionService(api);
    const message = { id: '900', channel_id: '200', guild_id: '100', application_id: 'app-1', author: bot } as Message;
    await service.pressComponent(message, { type: 3, custom_id: 'pick' }, ['a']);
    expect(api.createInteraction).toHaveBeenCalledWith({
      type: 3,
      application_id: 'app-1',
      channel_id: '200',
      guild_id: '100',
      message_id: '900',
      data: { custom_id: 'pick', component_type: 3, values: ['a'] },
    });
    expect(useInteractionStore.getState().applicationOf['int-1']).toBe('app-1');
  });

  it('submits the open modal and closes it', async () => {
    const api = fakeApi();
    const service = new InteractionService(api);
    useInteractionStore.getState().openModal({ interactionId: 'int-0', applicationId: 'app-1', channelId: '200', customId: 'm', title: 'T', components: [] });
    await service.submitModal({ text: 'hi' });
    expect(api.createInteraction).toHaveBeenCalledWith({
      type: 5,
      application_id: 'app-1',
      channel_id: '200',
      guild_id: '100',
      data: { custom_id: 'm', components: [{ type: 1, components: [{ type: 4, custom_id: 'text', value: 'hi' }] }] },
    });
    expect(useInteractionStore.getState().modal).toBeNull();
  });
});
