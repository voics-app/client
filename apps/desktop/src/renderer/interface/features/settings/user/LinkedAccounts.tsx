import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LinkedConnection } from '@discordy/core/contracts/rest';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { errorMessage } from '../../../app/actions';
import { openExternalUrl } from '../../../app/links';
import { getRuntime } from '../../../app/runtime';
import { Button } from '../../../shared/ui/Button';

export function LinkedAccounts() {
  const userId = useSessionStore((s) => s.user?.id);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const accounts = useQuery({ queryKey: ['my-connections', userId], queryFn: () => getRuntime().api.connections(), enabled: Boolean(userId) });
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await action(); if (userId) { const key = ['user-connections', userId]; queryClient.setQueryData<LinkedConnection[]>(key, (old) => old?.filter((connection) => connection.provider !== 'github')); await queryClient.invalidateQueries({ queryKey: key }); } await accounts.refetch(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  const github = accounts.data?.find((a) => a.provider === 'github');
  return <div className="settings-page">
    <h1>Connections</h1>
    <p className="page-sub">Link an account and choose whether it appears on your profile.</p>
    {accounts.isPending ? <p role="status">Loading connections...</p> : accounts.isError ? <><p role="alert">Could not load connections.</p><Button onClick={() => void accounts.refetch()}>Try again</Button></> : <section>
      <h2>GitHub</h2>
      {github ? <><p>Linked as {github.name}</p><p>Disconnect removes the profile link. Revoke access separately in GitHub settings.</p><label><input type="checkbox" checked={github.visible} disabled={busy} onChange={(event) => void run(() => getRuntime().api.setConnectionVisibility('github', event.target.checked))} /> Show on profile</label><p><Button disabled={busy} onClick={() => void run(() => getRuntime().api.deleteConnection('github'))}>Disconnect</Button></p></> : <><p>Connect GitHub to display your account on your profile. New connections are private until you choose to show them.</p><Button disabled={busy} onClick={() => void run(async () => { const result = await getRuntime().api.authorizeGithubConnection(); if (!/^https:\/\/github\.com\/login\/oauth\/authorize(?:\?|$)/.test(result.url)) throw new Error('Unexpected authorization address'); openExternalUrl(result.url); })}>Connect GitHub</Button><p>After authorizing in your browser, return here and select Refresh.</p><Button disabled={busy} onClick={() => void accounts.refetch()}>Refresh</Button></>}
    </section>}
    {error && <p role="alert" className="field-error">{error}</p>}
  </div>;
}
