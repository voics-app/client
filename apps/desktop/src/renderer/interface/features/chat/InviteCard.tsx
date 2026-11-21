import { useI18n } from '../../shared/i18n';
import { useEffect, useRef, useState } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import type { Invite } from '@discordy/core/contracts/rest';
import { instanceInviteCodes } from '@discordy/core/domain/inviteLinks';
import { attempt } from '../../app/actions';
import { useConnectionStore } from '../../app/connectionStore';
import { openGuild } from '../../app/navigation';
import { getRuntime } from '../../app/runtime';
import { Avatar } from '../../shared/ui/Avatar';
import { Button } from '../../shared/ui/Button';

/** Invite lookups are cached per code for the session; failures are cached too so a dead link is not refetched on every scroll. */
const lookups = new Map<string, Promise<Invite | null>>();

function lookupInvite(code: string): Promise<Invite | null> {
  let hit = lookups.get(code);
  if (!hit) {
    hit = getRuntime()
      .api.invite(code)
      .catch(() => null);
    lookups.set(code, hit);
  }
  return hit;
}

function InviteCard({ code }: { code: string }) {
  const { t: msg } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(typeof IntersectionObserver === 'undefined');
  const [invite, setInvite] = useState<Invite | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const joinedGuild = useGuildStore((s) => (invite?.guild?.id ? !!s.guilds[invite.guild.id] : false));

  // Render the card (and fetch) only once it scrolls into view.
  useEffect(() => {
    const el = ref.current;
    if (visible || !el) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setVisible(true), { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let live = true;
    void lookupInvite(code).then((found) => live && setInvite(found));
    return () => {
      live = false;
    };
  }, [visible, code]);

  const guildId = invite?.guild?.id;
  const join = async () => {
    setBusy(true);
    const joined = await attempt(() => getRuntime().api.acceptInvite(code), msg("settings.dialoghost.could.not.join.server"));
    setBusy(false);
    const gid = joined?.guild?.id ?? guildId;
    if (joined && gid) setTimeout(() => openGuild(gid), 300);
  };

  if (invite === null) {
    return (
      <div ref={ref} className="invite-embed is-invalid" role="group" aria-label={msg("settings.invitecard.invite")}>
        <p>{msg("settings.dialoghost.invite.is.invalid.or.has.expired")}</p>
      </div>
    );
  }
  return (
    <div ref={ref} className="invite-embed" role="group" aria-label={msg("settings.invitecard.server.invite")}>
      {invite ? (
        <>
          <Avatar id={guildId} name={invite.guild?.name ?? '?'} avatar={invite.guild?.icon} size={48} square kind="icons" />
          <div className="invite-embed-info">
            <strong>{invite.guild?.name ?? msg("settings.profiledialog.server")}</strong>
            <span>
              {invite.approximate_member_count === undefined ? msg("invite.unknownMembers") : msg("common.members", { count: invite.approximate_member_count })}
              {invite.approximate_presence_count != null && ` · ${msg('invite.online', { count: invite.approximate_presence_count })}`}
            </span>
          </div>
          {joinedGuild ? (
            <Button variant="ghost" disabled>{msg("friends.joined")}</Button>
          ) : (
            <Button variant="primary" loading={busy} onClick={() => void join()}>{msg("settings.invitecard.join")}</Button>
          )}
        </>
      ) : (
        <span className="invite-embed-loading">{msg("settings.invitecard.loading.invite")}</span>
      )}
    </div>
  );
}

/** Cards for invite links in `content` that point at this instance. */
export function InviteCards({ content }: { content: string }) {
  const apiUrl = useConnectionStore((s) => s.apiUrl);
  const codes = instanceInviteCodes(content, apiUrl);
  if (codes.length === 0) return null;
  return (
    <>
      {codes.slice(0, 3).map((code) => (
        <InviteCard key={code} code={code} />
      ))}
    </>
  );
}
