import { useState } from 'react';
import { WAVE_EMOJI, type DmIntro as DmIntroModel } from '@renderer/domain/dmIntro';
import type { Channel } from '@shared/contracts/rest';
import { reportError } from '../../app/actions';
import { getRuntime } from '../../app/runtime';
import { Avatar } from '../../shared/ui/Avatar';
import { Button } from '../../shared/ui/Button';

/** Top of a 1:1 DM: big avatar, names and, while the conversation is empty, a button that sends a wave. */
export function DmIntro({ channel, intro }: { channel: Channel; intro: DmIntroModel }) {
  const [waving, setWaving] = useState(false);
  const wave = async () => {
    setWaving(true);
    try {
      await getRuntime().privacy.sender.send(channel, { content: WAVE_EMOJI });
    } catch (e) {
      reportError(e, 'Could not send the wave');
      setWaving(false);
    }
  };
  return (
    <div className="channel-start dm-intro">
      <Avatar id={intro.user.id} name={intro.name} avatar={intro.user.avatar} size={80} />
      <h2>{intro.name}</h2>
      <p className="dm-intro-username">{intro.username}</p>
      <p>{intro.text}</p>
      {intro.canWave && (
        <Button className="dm-intro-wave" variant="primary" loading={waving} onClick={() => void wave()}>
          {WAVE_EMOJI} Wave to {intro.name}
        </Button>
      )}
    </div>
  );
}
