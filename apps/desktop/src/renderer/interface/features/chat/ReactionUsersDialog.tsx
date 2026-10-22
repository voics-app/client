import { useEffect, useState } from 'react';
import { reactionKey, useMessageStore } from '@renderer/application/stores/messageStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { Permission } from '@shared/contracts/permissions';
import { attempt } from '../../app/actions';
import { useConnectionStore } from '../../app/connectionStore';
import { getRuntime } from '../../app/runtime';
import { can, useChannelPermissions } from '../../shared/hooks/usePermissions';
import { displayName } from '../../shared/hooks/useNames';
import { Avatar } from '../../shared/ui/Avatar';
import { Button } from '../../shared/ui/Button';
import { Modal } from '../../shared/ui/Modal';

type Who = { id: string; username?: string; global_name?: string | null; avatar?: string | null };

/** Everyone who reacted, one tab per emoji of the message. Moderators can remove single reactions. */
export function ReactionUsersDialog({ channelId, messageId, emoji: initial }: { channelId: string; messageId: string; emoji: string }) {
  const [current, setCurrent] = useState(initial);
  const [users, setUsers] = useState<Who[] | null>(null);
  const reactions = useMessageStore((s) => s.timelines[channelId]?.byId[messageId]?.reactions) ?? [];
  const cdn = useConnectionStore((s) => s.cdnUrl);
  const canManage = can(useChannelPermissions(channelId), Permission.MANAGE_MESSAGES);
  const close = () => useUiStore.getState().openDialog(null);
  const count = reactions.find((r) => reactionKey(r.emoji) === current)?.count ?? 0;

  useEffect(() => {
    let live = true;
    setUsers(null);
    void attempt(() => getRuntime().api.reactionUsers(channelId, messageId, current), 'Could not load reactions').then((r) => live && setUsers(r ?? []));
    return () => {
      live = false;
    };
  }, [channelId, messageId, current, count]);

  return (
    <Modal open onClose={close} title="Reactions" width={400}>
      <div className="reaction-tabs" role="tablist">
        {reactions.map((r) => {
          const key = reactionKey(r.emoji);
          return (
            <button key={key} type="button" role="tab" aria-selected={key === current} className={key === current ? 'is-on' : undefined} onClick={() => setCurrent(key)}>
              {r.emoji.id ? <img src={`${cdn}/emojis/${r.emoji.id}.${r.emoji.animated ? 'gif' : 'png'}`} alt={r.emoji.name ?? ''} /> : <span>{r.emoji.name}</span>}
              <span className="tnum">{r.count}</span>
            </button>
          );
        })}
      </div>
      <div className="reaction-list">
        {users === null && <p className="emoji-none">Loading…</p>}
        {users?.length === 0 && <p className="emoji-none">No reactions.</p>}
        {users?.map((u) => {
          const name = displayName({ username: u.username ?? '', global_name: u.global_name ?? null });
          return (
            <div key={u.id} className="reaction-list-row">
              <Avatar id={u.id} name={name} avatar={u.avatar ?? null} size={24} />
              <span>{name}</span>
              {canManage && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setUsers((l) => l?.filter((x) => x.id !== u.id) ?? l);
                    void attempt(() => getRuntime().api.removeUserReaction(channelId, messageId, current, u.id), 'Could not remove reaction');
                  }}
                >
                  Remove
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
