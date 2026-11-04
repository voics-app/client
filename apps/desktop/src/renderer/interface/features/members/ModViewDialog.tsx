import { useQuery } from '@tanstack/react-query';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { timestampOf } from '@discordy/core/domain/snowflake';
import { getRuntime } from '../../app/runtime';
import { displayName } from '../../shared/hooks/useNames';
import { Avatar } from '../../shared/ui/Avatar';
import { Modal } from '../../shared/ui/Modal';
import { Skeleton } from '../../shared/ui/Misc';
import { AUDIT_ACTIONS } from '../settings/server/auditActions';

/** Moderator view of a user, member or not: membership, ban and the audit entries about them. */
export function ModViewDialog({ guildId, userId }: { guildId: string; userId: string }) {
  const close = () => useUiStore.getState().openDialog(null);
  const member = useGuildStore((s) => s.members[guildId]?.[userId]);
  const user = useQuery({ queryKey: ['user', userId], queryFn: () => getRuntime().api.user(userId), initialData: member?.user, staleTime: 60_000 });
  const ban = useQuery({ queryKey: ['guild', guildId, 'ban', userId], queryFn: () => getRuntime().api.getBan(guildId, userId).catch(() => null) });
  const history = useQuery({ queryKey: ['guild', guildId, 'audit', 'target', userId], queryFn: () => getRuntime().api.auditLog(guildId, { target_id: userId, limit: 50 }) });
  const actors = new Map((history.data?.users ?? []).map((u) => [u.id, u]));
  const entries = history.data?.audit_log_entries ?? [];
  const shown = user.data;

  return (
    <Modal open onClose={close} title="Mod View" width={480}>
      {!shown ? <Skeleton height={60} radius={12} /> : (
        <div className="stack">
          <div className="row">
            <Avatar id={shown.id} name={displayName(shown)} avatar={shown.avatar} size={48} />
            <div className="manage-copy">
              <strong>{displayName(shown, member?.nick)}</strong>
              <span className="mono">{shown.username} · {shown.id}</span>
            </div>
          </div>
          <section className="profile-section">
            <h4>Status in this server</h4>
            <p>{member ? `Member since ${new Date(member.joined_at).toLocaleDateString([], { dateStyle: 'long' })}` : ban.data ? 'Banned' : ban.isLoading ? 'Checking' : 'Not a member'}</p>
            {ban.data && <p className="setting-desc">Reason: {ban.data.reason ?? 'No reason given'}</p>}
          </section>
          <section className="profile-section" aria-label="Moderation history">
            <h4>Moderation history</h4>
            {history.isLoading ? <Skeleton height={40} radius={12} /> : entries.length === 0 ? <p className="setting-desc">Nothing logged about this user.</p> : (
              <ul className="manage-list audit">
                {entries.map((e) => {
                  const actor = e.user_id ? actors.get(e.user_id) : undefined;
                  return (
                    <li key={e.id}>
                      <div className="manage-copy">
                        <strong>{actor ? displayName(actor) : 'Unknown'} {AUDIT_ACTIONS[e.action_type] ?? `performed action ${e.action_type}`}</strong>
                        {e.reason && <span>Reason: {e.reason}</span>}
                      </div>
                      <time className="tnum">{new Date(timestampOf(e.id)).toLocaleString()}</time>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
