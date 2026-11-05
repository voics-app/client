import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { JoinServerSheet } from '../invites/JoinServerSheet';
import { theme } from '../theme';
import { Sheet, SheetOption } from '../ui/Sheet';
import { CreateServerSheet } from './CreateServerSheet';

const icon = (name: keyof typeof Ionicons.glyphMap) => <Ionicons name={name} size={20} color={theme.text} />;

type Open = 'create' | 'join' | null;

/** The + at the end of the server rail: create a server, join one with an invite, or browse Discover. */
export function AddServerSheet({ visible, onClose }: { visible: boolean; onClose(): void }) {
  const [open, setOpen] = useState<Open>(null);
  const choose = (next: Open) => {
    onClose();
    setOpen(next);
  };
  return (
    <>
      <Sheet visible={visible} title="Add a server" closeLabel="Close add a server" onClose={onClose}>
        <SheetOption label="Create my own server" icon={icon('add-circle-outline')} onPress={() => choose('create')} />
        <SheetOption label="Join a server" icon={icon('enter-outline')} onPress={() => choose('join')} />
        <SheetOption
          label="Discover servers"
          icon={icon('compass-outline')}
          onPress={() => {
            onClose();
            router.push('/discover');
          }}
        />
      </Sheet>
      <CreateServerSheet visible={open === 'create'} onClose={() => setOpen(null)} />
      <JoinServerSheet visible={open === 'join'} onClose={() => setOpen(null)} />
    </>
  );
}
