import { useState } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { attempt } from '../../../app/actions';
import { getRuntime } from '../../../app/runtime';
import { isVoiceChannel } from '../../../app/navigation';
import { voiceTextChatEnabled } from '../../voice/VoiceTextChat';
import { Switch } from '../../../shared/ui/Form';

/** Voice channels only: switches the channel's text chat on or off. Saved on its own, apart from the overview form. */
export function VoiceTextChatSetting({ channelId }: { channelId: string }) {
  const channel = useGuildStore((s) => s.channels[channelId]);
  const [saving, setSaving] = useState(false);
  if (!channel || !isVoiceChannel(channel)) return null;
  const enabled = voiceTextChatEnabled(channel);
  const save = async (next: boolean) => {
    setSaving(true);
    const updated = await attempt(() => getRuntime().api.updateChannel(channelId, { text_chat_enabled: next }), 'Could not save channel');
    setSaving(false);
    if (updated) useGuildStore.getState().upsertChannel(updated);
  };
  return (
    <div className="perm-row">
      <div>
        <p className="setting-title">Text chat</p>
        <p className="setting-desc">Members can read and send messages in this channel's chat while in the call. Turn it off to keep the channel voice only.</p>
      </div>
      <Switch label="Text chat" checked={enabled} disabled={saving} onChange={(next) => void save(next)} />
    </div>
  );
}
