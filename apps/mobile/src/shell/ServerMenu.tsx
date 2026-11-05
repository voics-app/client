import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { InviteContent } from '../invites/InviteContent';
import { inviteChannelId } from '../invites/inviteModel';
import { getRuntime } from '../runtime';
import { useGuildPermissions } from '../servers/useGuildPermissions';
import { theme } from '../theme';
import { attempt } from '../ui/attempt';
import { Sheet, SheetConfirm, SheetOption } from '../ui/Sheet';
import { serverMenuEntries } from './serverMenuModel';

async function leaveServer(guildId: string): Promise<void> {
  const me = useSessionStore.getState().user?.id;
  if (!me) return;
  const done = await attempt(async () => {
    await getRuntime().api.kickMember(guildId, me);
    return true;
  }, 'Could not leave server');
  if (!done) return;
  useGuildStore.getState().removeGuild(guildId);
  useUiStore.getState().navigate({ kind: 'home', channelId: null });
}

/** Desktop's server menu from the column header: Invite people, Server settings (only with the permission) and Leave server (with confirmation). */
export function ServerMenu({ guildId, visible, onClose }: { guildId: string; visible: boolean; onClose(): void }) {
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const channels = useGuildStore((s) => s.channels);
  const me = useSessionStore((s) => s.user?.id);
  const perms = useGuildPermissions(guildId);
  const [step, setStep] = useState<'menu' | 'invite' | 'leave'>('menu');
  if (!guild) return null;
  const entries = serverMenuEntries(perms, guild.owner_id === me, inviteChannelId(channels, guildId) !== null);

  const close = () => {
    setStep('menu');
    onClose();
  };

  return (
    <Sheet visible={visible} title={step === 'invite' ? `Invite people to ${guild.name}` : step === 'leave' ? `Leave ${guild.name}?` : guild.name} closeLabel="Close server menu" onClose={close}>
      {step === 'invite' ? (
        <InviteContent guildId={guildId} />
      ) : step === 'leave' ? (
        <SheetConfirm
          body="You will need a new invite to rejoin."
          confirmLabel="Leave server"
          onConfirm={() => {
            close();
            void leaveServer(guildId);
          }}
          onCancel={close}
        />
      ) : (
        <>
          {entries.invite && <SheetOption label="Invite people" icon={<Ionicons name="person-add-outline" size={20} color={theme.text} />} onPress={() => setStep('invite')} />}
          {entries.settings && (
            <SheetOption
              label="Server settings"
              icon={<Ionicons name="settings-outline" size={20} color={theme.text} />}
              onPress={() => {
                close();
                router.push(`/servers/${guildId}/settings`);
              }}
            />
          )}
          {entries.leave && (
            <SheetOption
              label="Leave server"
              danger
              icon={<Ionicons name="log-out-outline" size={20} color={theme.danger} />}
              onPress={() => setStep('leave')}
            />
          )}
          <SheetOption label="Cancel" onPress={close} />
        </>
      )}
    </Sheet>
  );
}
