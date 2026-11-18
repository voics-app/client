import { useI18n } from '../../../shared/i18n';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUnsavedStore } from '@discordy/core/application/stores/unsavedStore';
import type { User } from '@discordy/core/contracts/rest';
import { errorMessage } from '../../../app/actions';
import { getRuntime } from '../../../app/runtime';
import { Button } from '../../../shared/ui/Button';
import { Field, Select } from '../../../shared/ui/Form';
import { ProfileEditor } from './ProfileEditor';

export function ProfileTab({ initialGuildId }: { initialGuildId?: string }) {
  const { t: msg } = useI18n();
  const user = useSessionStore((s) => s.user);
  const guilds = useGuildStore((s) => s.guilds);
  const [scope, setScope] = useState(initialGuildId ?? '');
  if (!user) return null;
  return <div className="settings-page">
    <h1>{msg("settings.profile")}</h1>
    <p className="page-sub">{msg("settings.profiletab.how.you.appear.to.others")}</p>
    <Field label={msg("settings.profiletab.profile.to.edit")}>{(id) => <Select id={id} value={scope} onChange={(e) => {
      if (useUnsavedStore.getState().requestLeave()) setScope(e.target.value);
    }}>
      <option value="">{msg("settings.profiletab.global.profile")}</option>
      {Object.values(guilds).map((guild) => <option key={guild.id} value={guild.id}>{guild.name}</option>)}
    </Select>}</Field>
    {scope ? <ServerProfile key={scope} user={user} guildId={scope} /> : <ProfileEditor key="global" user={user} />}
  </div>;
}

function ServerProfile({ user, guildId }: { user: User; guildId: string }) {
  const { t: msg } = useI18n();
  const client = useQueryClient();
  const member = useGuildStore((s) => s.members[guildId]?.[user.id]);
  const queryKey = ['profile-member', guildId, user.id];
  const query = useQuery({ queryKey, queryFn: () => getRuntime().api.member(guildId, user.id), initialData: member, staleTime: 0 });
  if (!query.data) return query.isError
    ? <div role="alert"><p>{errorMessage(query.error)}</p><Button onClick={() => void query.refetch()}>{msg("settings.profiletab.retry.loading.profile")}</Button></div>
    : <p role="status">{msg("settings.profiletab.loading.server.profile")}</p>;
  return <ProfileEditor user={user} member={query.data} guildId={guildId} onMemberSaved={(saved) => client.setQueryData(queryKey, saved)} />;
}
