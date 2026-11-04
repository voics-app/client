import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { layoutOf, moveChannel } from '@discordy/core/domain/channelOrder';
import { applyChannelLayout, guildChannels, moveChannelStep } from '@renderer/interface/app/channelOrderActions';
import { ChannelType, type Channel } from '@discordy/core/contracts/rest';

const reorderChannels = vi.fn();
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api: { reorderChannels } }) }));

const ch = (id: string, position: number, parent_id: string | null, type: number = ChannelType.GUILD_TEXT, allow = '0'): Channel =>
  ({ id, guild_id: 'g', name: id, type, position, parent_id, permission_overwrites: [{ id: 'r', type: 0, allow, deny: '0' }] }) as Channel;

describe('channel order actions', () => {
  beforeEach(() => {
    reorderChannels.mockReset();
    reorderChannels.mockResolvedValue(undefined);
    useUiStore.getState().openDialog(null);
    useGuildStore.setState({
      channels: Object.fromEntries(
        [ch('catA', 0, null, ChannelType.GUILD_CATEGORY, '8'), ch('a1', 0, 'catA', ChannelType.GUILD_TEXT, '8'), ch('x', 0, null), ch('y', 1, null)].map((c) => [c.id, c]),
      ),
    });
  });

  it('sends only changed channels and updates the store optimistically', async () => {
    await applyChannelLayout('g', moveChannel(layoutOf(guildChannels('g')), 'y', { parent: null, index: 0 }), 'y');
    expect(reorderChannels).toHaveBeenCalledWith('g', [
      { id: 'y', position: 0 },
      { id: 'x', position: 1 },
    ]);
    expect(useGuildStore.getState().channels.y!.position).toBe(0);
  });

  it('reverts the store when the request fails', async () => {
    reorderChannels.mockRejectedValue(new Error('nope'));
    await applyChannelLayout('g', moveChannel(layoutOf(guildChannels('g')), 'y', { parent: null, index: 0 }), 'y');
    expect(useGuildStore.getState().channels.y!.position).toBe(1);
  });

  it('prompts to sync permissions after moving into a category with different overwrites, then locks them', async () => {
    await moveChannelStep('g', 'x', 1);
    expect(reorderChannels).toHaveBeenCalledTimes(1);
    expect(useGuildStore.getState().channels.x!.parent_id).toBeNull();
    await applyChannelLayout('g', moveChannel(layoutOf(guildChannels('g')), 'x', { parent: 'catA', index: 1 }), 'x');
    const dialog = useUiStore.getState().dialog;
    expect(dialog?.kind).toBe('confirm');
    if (dialog?.kind !== 'confirm') return;
    await dialog.onConfirm();
    expect(reorderChannels).toHaveBeenLastCalledWith('g', [expect.objectContaining({ id: 'x', parent_id: 'catA', lock_permissions: true })]);
    expect(useGuildStore.getState().channels.x!.permission_overwrites![0]!.allow).toBe('8');
  });
});
