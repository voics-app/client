import { useLocalSearchParams } from 'expo-router';
import { EventsScreen } from '../../../src/events/EventsScreen';

export default function EventsRoute() {
  const { guildId, eventId } = useLocalSearchParams<{ guildId: string; eventId?: string }>();
  return <EventsScreen guildId={guildId} eventId={eventId} />;
}
