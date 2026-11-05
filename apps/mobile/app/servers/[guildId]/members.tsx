import { useLocalSearchParams } from 'expo-router';
import { MemberListScreen } from '../../../src/members/MemberListScreen';

export default function MembersRoute() {
  const { guildId } = useLocalSearchParams<{ guildId: string }>();
  return <MemberListScreen guildId={guildId} />;
}
