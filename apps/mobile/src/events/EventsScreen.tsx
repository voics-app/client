import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { GuildScheduledEvent } from '@discordy/core/contracts/scheduledEvents';
import { getRuntime } from '../runtime';
import { theme } from '../theme';
import { Button } from '../ui/controls';

function EventRow({ event, selected }: { event: GuildScheduledEvent; selected: boolean }) {
  const [interested, setInterested] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [interestVersion, setInterestVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setInterested(null); setError(false);
    getRuntime().api.guildScheduledEventInterest(event.guild_id, event.id)
      .then((result) => { if (active) setInterested(result.interested); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [event.guild_id, event.id, interestVersion]);
  const toggle = async () => {
    if (interested === null || busy) return;
    setBusy(true); setError(false);
    try {
      await getRuntime().api.setGuildScheduledEventInterest(event.guild_id, event.id, !interested);
      setInterested(!interested);
    } catch { setError(true); } finally { setBusy(false); }
  };
  return <View style={[styles.row, selected && styles.selected]}>
    <Text accessibilityRole="header" style={styles.name}>{event.name}</Text>
    <Text style={styles.meta}>{new Date(event.scheduled_start_time).toLocaleString()}</Text>
    {event.entity_metadata?.location ? <Text style={styles.meta}>{event.entity_metadata.location}</Text> : null}
    {event.description ? <Text style={styles.description}>{event.description}</Text> : null}
    <Text style={styles.meta}>{event.user_count} interested</Text>
    {error && <Text accessibilityRole="alert" style={styles.meta}>Could not update interest. Try again.</Text>}
    {error && interested === null ? <Button label="Retry interest" onPress={() => setInterestVersion((n) => n + 1)} /> : <Button label={interested ? 'Interested' : 'Mark interested'} accessibilityLabel={`${interested ? 'Remove interest in' : 'Mark interested in'} ${event.name}`} disabled={interested === null} busy={busy} onPress={() => void toggle()} />}
  </View>;
}

export function EventsScreen({ guildId, eventId }: { guildId: string; eventId?: string }) {
  const [events, setEvents] = useState<GuildScheduledEvent[] | null>(null);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((n) => n + 1), []);
  useEffect(() => {
    let active = true;
    setEvents(null); setError(false);
    getRuntime().api.guildScheduledEvents(guildId).then((result) => { if (active) setEvents(result); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [guildId, version]);
  const ordered = events && [...events].sort((a, b) => a.id === eventId ? -1 : b.id === eventId ? 1 : Date.parse(a.scheduled_start_time) - Date.parse(b.scheduled_start_time));
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    {error ? <><Text accessibilityRole="alert" style={styles.description}>Could not load events.</Text><Button label="Retry" onPress={reload} /></> : !ordered ? <ActivityIndicator accessibilityLabel="Loading events" color={theme.muted} /> : ordered.length === 0 ? <Text style={styles.description}>{eventId ? 'This event is no longer available.' : 'No scheduled events.'}</Text> : <>
      {eventId && !ordered.some((event) => event.id === eventId) && <Text style={styles.description}>This event is no longer available.</Text>}
      {ordered.map((event) => <EventRow key={event.id} event={event} selected={event.id === eventId} />)}
    </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background }, content: { padding: 16, gap: 12 },
  row: { padding: 16, gap: 8, borderWidth: 1, borderColor: theme.hairline, borderRadius: 14 },
  selected: { borderColor: theme.accent }, name: { color: theme.text, fontSize: 18, fontWeight: '700' },
  meta: { color: theme.muted, fontSize: 14 }, description: { color: theme.text, fontSize: 15 },
});
