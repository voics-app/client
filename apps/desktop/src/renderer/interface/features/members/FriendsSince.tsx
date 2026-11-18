import { useI18n } from '../../shared/i18n';
import { useRelationshipStore } from '@discordy/core/application/stores/peopleStores';
import { friendsSince } from '@discordy/core/domain/profile';

/** "Friends since <date>" for someone on the friends list. */
export function FriendsSince({ userId }: { userId: string }) {
  const { t, date } = useI18n();
  const relationship = useRelationshipStore((s) => s.byUser[userId]);
  const since = friendsSince(relationship);
  if (!since) return null;
  return (
    <section className="profile-section">
      <h4>{t('profile.friendsSince')}</h4>
      <p><time dateTime={since.toISOString()}>{date(since, { dateStyle: 'long' })}</time></p>
    </section>
  );
}
