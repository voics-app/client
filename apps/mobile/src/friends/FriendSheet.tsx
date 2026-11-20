import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useFavouriteFriendsStore } from '@discordy/core/application/stores/peopleStores';
import { getRuntime } from '../runtime';
import { attempt } from '../ui/attempt';
import { RelationshipType, type Relationship } from '@discordy/core/contracts/rest';
import { openConversation } from '../dms/dmActions';
import { useLastValue } from '../sheets/useLastValue';
import { theme } from '../theme';
import { Sheet, SheetConfirm, SheetOption } from '../ui/Sheet';
import { blockUser, removeRelationship } from './friendActions';

type Step = 'menu' | 'remove' | 'block';
const icon = (name: keyof typeof Ionicons.glyphMap, color: string = theme.text) => <Ionicons name={name} size={20} color={color} />;

export interface FriendSheetProps {
  rel: Relationship | null;
  onClose(): void;
  onMessage(channelId: string): void;
  onProfile(rel: Relationship): void;
}

/** What you can do with a friend: message, open their profile, remove them or block them (each destructive step asks first). */
export function FriendSheet({ rel: shown, onClose, onMessage, onProfile }: FriendSheetProps) {
  const rel = useLastValue(shown);
  const [step, setStep] = useState<Step>('menu');
  const close = () => {
    setStep('menu');
    onClose();
  };
  const name = rel ? rel.nickname || rel.user.global_name || rel.user.username : '';
  const isFriend = rel?.type === RelationshipType.FRIEND;
  const favourite = useFavouriteFriendsStore((s) => !!rel && s.ids.includes(rel.id));
  const toggleFavourite = async () => {
    if (!rel) return;
    const ok = await attempt(() => getRuntime().api.setFavouriteFriend(rel.id, !favourite).then(() => true), 'Could not update favourite');
    if (ok) {
      const store = useFavouriteFriendsStore.getState();
      store.set(favourite ? store.ids.filter((id) => id !== rel.id) : [...store.ids, rel.id]);
    }
  };
  return (
    <Sheet visible={shown !== null} title={name} closeLabel="Close friend menu" onClose={close}>
      {rel && step === 'menu' && (
        <>
          {isFriend && (
            <SheetOption
              label="Message"
              icon={icon('chatbubble-outline')}
              onPress={() => {
                close();
                void openConversation([rel.id]).then((id) => id && onMessage(id));
              }}
            />
          )}
          <SheetOption
            label="Profile"
            icon={icon('person-circle-outline')}
            onPress={() => {
              close();
              onProfile(rel);
            }}
          />
          {isFriend && <SheetOption label={favourite ? 'Remove favourite' : 'Add favourite'} icon={icon(favourite ? 'star' : 'star-outline')} onPress={() => { close(); void toggleFavourite(); }} />}
          {isFriend && <SheetOption label="Remove friend" icon={icon('person-remove-outline')} onPress={() => setStep('remove')} />}
          {rel.type !== RelationshipType.BLOCKED && <SheetOption label="Block" danger icon={icon('ban-outline', theme.danger)} onPress={() => setStep('block')} />}
        </>
      )}
      {rel && step === 'remove' && (
        <SheetConfirm
          body={`${name} will no longer be your friend.`}
          confirmLabel="Remove friend"
          onConfirm={() => {
            close();
            void removeRelationship(rel.id, 'Could not remove the friend');
          }}
          onCancel={() => setStep('menu')}
        />
      )}
      {rel && step === 'block' && (
        <SheetConfirm
          body={`${name} will not be able to message you or send a friend request, and you will not be friends any more.`}
          confirmLabel="Block"
          onConfirm={() => {
            close();
            void blockUser(rel.id);
          }}
          onCancel={() => setStep('menu')}
        />
      )}
    </Sheet>
  );
}
