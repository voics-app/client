import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { badgeLabel } from '@discordy/core/domain/profile';
import { getRuntime } from '../../../app/runtime';
import { SettingRow, Switch } from '../../../shared/ui/Form';

export function ProfileBadges({ userId }: { userId: string }) {
  const client = useQueryClient();
  const badges = useQuery({ queryKey: ['own-badges', userId], queryFn: () => getRuntime().api.ownBadges() });
  const update = useMutation({
    mutationFn: ({ id, visible }: { id: string; visible: boolean }) => getRuntime().api.setBadgeVisibility(id, visible),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['own-badges', userId] }),
        client.invalidateQueries({ queryKey: ['user-badges', userId] }),
      ]);
    },
  });
  return <section aria-label="Profile badges">
    <h2>Profile badges</h2>
    <p className="setting-desc">Choose which badges others can see on your profile.</p>
    {badges.isLoading && <p>Loading badges?</p>}
    {badges.isError && <p role="alert">Could not load badges.</p>}
    {badges.data?.length === 0 && <p className="setting-desc">You have no badges yet.</p>}
    {badges.data?.map((badge) => <SettingRow key={badge.id} title={badgeLabel(badge.id)}>
      <Switch label={`Show ${badgeLabel(badge.id)} on your profile`} checked={badge.visible} disabled={update.isPending} onChange={(visible) => update.mutate({ id: badge.id, visible })} />
    </SettingRow>)}
    {update.isError && <p role="alert">Could not update badge visibility. Try again.</p>}
  </section>;
}
