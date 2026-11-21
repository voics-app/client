import { useI18n } from '../../shared/i18n';
import { useState } from 'react';
import { WAVE_EMOJI, type DmIntro as DmIntroModel } from '@discordy/core/domain/dmIntro';
import type { Channel } from '@discordy/core/contracts/rest';
import { reportError } from '../../app/actions';
import { getRuntime } from '../../app/runtime';
import { Avatar } from '../../shared/ui/Avatar';
import { Button } from '../../shared/ui/Button';

/** Top of a 1:1 DM: big avatar, names and, while the conversation is empty, a button that sends a wave. */
export function DmIntro({ channel, intro }: { channel: Channel; intro: DmIntroModel }) {
  const { t } = useI18n();
  const [waving, setWaving] = useState(false);
  const wave = async () => {
    setWaving(true);
    try {
      await getRuntime().privacy.sender.send(channel, { content: WAVE_EMOJI });
    } catch (e) {
      reportError(e, t('chat.waveFailed'));
      setWaving(false);
    }
  };
  return (
    <div className="channel-start dm-intro">
      <Avatar id={intro.user.id} name={intro.name} avatar={intro.user.avatar} size={80} />
      <h2>{intro.name}</h2>
      <p className="dm-intro-username">{intro.username}</p>
      <p>{t('chat.dmStart', { name: intro.username })}</p>
      {intro.canWave && (
        <Button className="dm-intro-wave" variant="primary" loading={waving} onClick={() => void wave()}>
          {WAVE_EMOJI} {t('chat.wave', { name: intro.name })}
        </Button>
      )}
    </div>
  );
}
