import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import type { Invite } from '@discordy/core/contracts/rest';
import { instanceInviteCodes } from '@discordy/core/domain/inviteLinks';
import { getRuntime } from '../runtime';
import { ServerIcon } from '../shell/ServerIcon';
import { theme } from '../theme';
import { Button } from '../ui/controls';
import { configuredApiUrl, useInviteLinkStore } from './inviteLinkStore';
import { invitePreview } from './joinModel';

/** Lookups are cached per code for the session; a dead link is cached too, so scrolling does not fetch it again. */
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

/** Forgets the cached lookups; tests use it between cases. */
export const clearInviteLookups = () => lookups.clear();

function InviteCard({ code }: { code: string }) {
  const [invite, setInvite] = useState<Invite | null | undefined>(undefined);
  const guildId = invite?.guild?.id;
  const joined = useGuildStore((s) => (guildId ? Boolean(s.guilds[guildId]) : false));

  useEffect(() => {
    let live = true;
    void lookupInvite(code).then((found) => live && setInvite(found));
    return () => {
      live = false;
    };
  }, [code]);

  if (invite === null) {
    return (
      <View accessibilityLabel="Invite" style={[styles.card, styles.invalid]}>
        <Text style={styles.invalidText}>Invite is invalid or has expired</Text>
      </View>
    );
  }
  if (!invite) {
    return (
      <View accessibilityLabel="Server invite" style={styles.card}>
        <Text style={styles.people}>Loading invite...</Text>
      </View>
    );
  }
  const preview = invitePreview(invite);
  return (
    <View accessibilityLabel="Server invite" style={styles.card}>
      <View style={styles.icon}>
        <ServerIcon guild={{ id: guildId ?? '', name: preview.name, icon: invite.guild?.icon ?? null }} />
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.name}>
          {preview.name}
        </Text>
        <Text numberOfLines={1} style={styles.people}>
          {preview.people}
        </Text>
      </View>
      {joined ? <Button label="Joined" disabled onPress={() => undefined} /> : <Button label="Join" tone="primary" onPress={() => useInviteLinkStore.getState().open(code)} />}
    </View>
  );
}

/** Cards for the invite links in a message that point at this instance: the server, who is in it, and Join (as desktop shows them). */
export function InviteCards({ content }: { content: string }) {
  const codes = instanceInviteCodes(content, configuredApiUrl());
  if (codes.length === 0) return null;
  return (
    <>
      {codes.slice(0, 3).map((code) => (
        <InviteCard key={code} code={code} />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6, padding: 10, borderRadius: 12, backgroundColor: theme.raised, borderWidth: 1, borderColor: theme.hairline },
  invalid: { opacity: 0.8 },
  invalidText: { color: theme.muted, fontSize: 14 },
  icon: { width: 48, height: 48, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.raisedHover },
  copy: { flex: 1 },
  name: { color: theme.text, fontSize: 16, fontWeight: '700' },
  people: { color: theme.muted, fontSize: 13, marginTop: 2 },
});
