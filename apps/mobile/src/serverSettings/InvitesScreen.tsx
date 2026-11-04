import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { Permission } from '@discordy/core/contracts/permissions';
import type { Invite } from '@discordy/core/contracts/rest';
import { inviteWebUrl } from '@discordy/core/domain/inviteLinks';
import { hasPermission } from '@discordy/core/domain/permissions';
import { InviteLink } from '../invites/InviteContent';
import { InviteForm } from '../invites/InviteForm';
import { inviteChannelId, inviteSummary } from '../invites/inviteModel';
import { getRuntime } from '../runtime';
import { useGuildPermissions } from '../servers/useGuildPermissions';
import { theme } from '../theme';
import { attempt, confirmDestructive } from '../ui/attempt';
import { Button, Notice, SectionTitle, TextButton } from '../ui/controls';
import { ListRow } from '../ui/ListRow';
import { PageGuard } from './PageGuard';

function Body({ guildId }: { guildId: string }) {
  const channels = useGuildStore((s) => s.channels);
  const perms = useGuildPermissions(guildId);
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const channelId = inviteChannelId(channels, guildId);

  const load = useCallback(() => {
    setFailed(false);
    getRuntime()
      .api.guildInvites(guildId)
      .then(setInvites)
      .catch(() => setFailed(true));
  }, [guildId]);
  useEffect(load, [load]);

  const revoke = (invite: Invite) =>
    confirmDestructive(`Revoke ${invite.code}?`, 'The link stops working for everyone.', 'Revoke invite', () => {
      void (async () => {
        const done = await attempt(async () => {
          await getRuntime().api.deleteInvite(invite.code);
          return true;
        }, 'Could not revoke invite');
        if (done) setInvites((list) => list?.filter((i) => i.code !== invite.code) ?? null);
      })();
    });

  const copy = (code: string) => {
    void Clipboard.setStringAsync(inviteWebUrl(code, getRuntime().apiUrl)).then(() => setCopied(code));
  };

  const mayCreate = hasPermission(perms, Permission.CREATE_INSTANT_INVITE) && channelId !== null;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {mayCreate && (
        <>
          <SectionTitle>New invite</SectionTitle>
          {created ? (
            <View style={styles.created}>
              <InviteLink code={created} />
              <Button label="Create another" onPress={() => setCreated(null)} />
            </View>
          ) : (
            <InviteForm
              channelId={channelId}
              onCreated={(invite) => {
                setCreated(invite.code);
                load();
              }}
            />
          )}
        </>
      )}
      <SectionTitle>Active invites</SectionTitle>
      {failed ? (
        <Button label="Could not load invites. Try again" onPress={load} />
      ) : invites === null ? (
        <ActivityIndicator color={theme.muted} />
      ) : invites.length === 0 ? (
        <Notice>No active invites.</Notice>
      ) : (
        invites.map((invite) => (
          <ListRow
            key={invite.code}
            title={invite.code}
            subtitle={inviteSummary(invite, invite.inviter ? invite.inviter.global_name || invite.inviter.username : null)}
            right={
              <View style={styles.actions}>
                <TextButton label={copied === invite.code ? 'Copied' : 'Copy'} accessibilityLabel={`Copy invite ${invite.code}`} onPress={() => copy(invite.code)} />
                <TextButton label="Revoke" danger accessibilityLabel={`Revoke invite ${invite.code}`} onPress={() => revoke(invite)} />
              </View>
            }
          />
        ))
      )}
    </ScrollView>
  );
}

/** Server settings > Invites: create an invite (copy or share it) and see, copy and revoke the active ones. */
export function InvitesScreen({ guildId }: { guildId: string }) {
  return (
    <PageGuard guildId={guildId} page="invites" title="Invites">
      <Body guildId={guildId} />
    </PageGuard>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  content: { paddingBottom: 40 },
  created: { gap: 12, paddingBottom: 8 },
  actions: { alignItems: 'flex-end', gap: 10 },
});
