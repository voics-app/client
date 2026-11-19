import { useState } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { permissionsInChannel } from '@discordy/core/application/forwardCommands';
import { Permission } from '@discordy/core/contracts/permissions';
import { ChannelType, type Channel } from '@discordy/core/contracts/rest';
import { attempt } from '../../app/actions';
import { getRuntime } from '../../app/runtime';
import { Button } from '../../shared/ui/Button';
import { Modal } from '../../shared/ui/Modal';

/** Choose a text channel in another server where the caller manages webhooks. */
export function FollowAnnouncementDialog({ source, close }: { source: Channel; close: () => void }) {
  const channels = useGuildStore((s) => s.channels);
  const guilds = useGuildStore((s) => s.guilds);
  const [busy, setBusy] = useState<string | null>(null);
  const targets = Object.values(channels).filter((channel) =>
    channel.type === ChannelType.GUILD_TEXT && channel.guild_id && channel.guild_id !== source.guild_id &&
    guilds[channel.guild_id] && (permissionsInChannel(channel) & Permission.MANAGE_WEBHOOKS) !== 0n &&
    (permissionsInChannel(channel) & Permission.VIEW_CHANNEL) !== 0n &&
    getRuntime().privacy.sender.resolveMode(channel) === 'standard',
  );
  const follow = async (target: Channel) => {
    setBusy(target.id);
    const result = await attempt(() => getRuntime().api.followAnnouncement(source.id, target.id), 'Could not follow channel');
    setBusy(null);
    if (!result) return;
    useUiStore.getState().toast({ tone: 'success', title: 'Channel followed' });
    close();
  };
  return (
    <Modal open onClose={close} title={`Follow #${source.name ?? 'announcements'}`} description="Choose where published announcements should appear.">
      <ul className="pick-list forward-list">
        {targets.map((target) => <li key={target.id}>
          <div className="pick-row forward-row">
            <span className="forward-label">#{target.name}<small> {guilds[target.guild_id!]?.name}</small></span>
            <Button variant="ghost" size="sm" disabled={busy !== null} loading={busy === target.id} onClick={() => void follow(target)}>Follow</Button>
          </div>
        </li>)}
        {targets.length === 0 && <li className="pick-empty">No eligible text channels. You need Manage Webhooks in another server.</li>}
      </ul>
    </Modal>
  );
}
