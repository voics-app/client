import { useRelationshipStore } from '@discordy/core/application/stores/peopleStores';
import { friendsSince } from '@discordy/core/domain/profile';

/** "Friends since <date>" for someone on the friends list. */
export function FriendsSince({ userId }: { userId: string }) {
  const relationship = useRelationshipStore((s) => s.byUser[userId]);
  const since = friendsSince(relationship);
  if (!since) return null;
  return (
    <section className="profile-section">
      <h4>Friends since</h4>
      <p><time dateTime={since.toISOString()}>{since.toLocaleDateString([], { dateStyle: 'long' })}</time></p>
    </section>
  );
}
