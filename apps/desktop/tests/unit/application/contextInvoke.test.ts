import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InteractionService } from '@renderer/application/interactionService';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useInteractionStore } from '@renderer/application/stores/interactionStore';
import type { ApiPort } from '@renderer/application/ports/api';
import type { Channel } from '@discordy/core/contracts/rest';

const channel = { id: '200', type: 0, guild_id: '100', name: 'general', delivery_mode: 'standard', last_message_id: null } as Channel;

beforeEach(() => {
  useInteractionStore.getState().reset();
  useGuildStore.getState().reset();
  useGuildStore.getState().upsertChannel(channel);
});

describe('InteractionService context commands', () => {
  it('stores USER and MESSAGE commands of a guild index and invokes one with target_id', async () => {
    const index = {
      applications: [{ id: 'app-1', name: 'Dice Bot', icon: null, bot_id: '50' }],
      application_commands: [
        { id: 'c1', application_id: 'app-1', name: 'roll', description: 'Roll' },
        { id: 'c2', type: 3, application_id: 'app-1', name: 'Translate', description: '' },
      ],
    };
    const api = { commandIndex: vi.fn(async () => index), createInteraction: vi.fn(async () => ({ id: 'int-1' })) } as unknown as ApiPort;
    const service = new InteractionService(api);
    await service.loadGuildCommands('100');
    const stored = useInteractionStore.getState().contextCommands['100']!;
    expect(stored).toEqual([{ id: 'c2', applicationId: 'app-1', appName: 'Dice Bot', name: 'Translate', kind: 'message' }]);
    await service.invokeContext(channel, stored[0]!, 'msg-9');
    expect(api.createInteraction).toHaveBeenCalledWith({
      type: 2,
      application_id: 'app-1',
      channel_id: '200',
      guild_id: '100',
      data: { id: 'c2', name: 'Translate', type: 3, target_id: 'msg-9' },
    });
    expect(useInteractionStore.getState().pending['200']).toHaveLength(1);
  });

  it('invalidating a scope drops its context commands too', async () => {
    useInteractionStore.getState().setContextCommands('100', []);
    useInteractionStore.getState().invalidateCommands('100');
    expect(useInteractionStore.getState().contextCommands['100']).toBeUndefined();
  });
});
