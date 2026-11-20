import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import { Permission } from '@discordy/core/contracts/permissions';
import { errorMessage } from '../../app/actions';
import { joinStageAudience, leaveVoice } from '../../app/voiceActions';
import { getRuntime } from '../../app/runtime';
import { can, useChannelPermissions } from '../../shared/hooks/usePermissions';
import { Button } from '../../shared/ui/Button';
import { Field, Input } from '../../shared/ui/Form';

/** Stage topic and audience entry. */
export function StageChannelView({ channelId }: { channelId: string }) {
  const channel = useGuildStore((s) => s.channels[channelId]);
  const connected = useVoiceStore((s) => s.call.channelId === channelId && s.call.status !== 'idle');
  const canManage = can(useChannelPermissions(channelId), Permission.MANAGE_CHANNELS);
  const queryClient = useQueryClient();
  const key = ['stage-instance', channelId];
  const stage = useQuery({ queryKey: key, queryFn: () => getRuntime().api.stageInstance(channelId), refetchInterval: 15_000 });
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setDraft(null); setError(null); }, [channelId]);
  const topic = draft ?? stage.data?.topic ?? '';

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const next = stage.data
        ? await getRuntime().api.updateStage(channelId, topic.trim())
        : await getRuntime().api.startStage(channelId, topic.trim());
      queryClient.setQueryData(key, next);
      setDraft(null);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setSaving(false); }
  };
  const end = async () => {
    setSaving(true); setError(null);
    try {
      await getRuntime().api.endStage(channelId);
      queryClient.setQueryData(key, null);
      setDraft(null);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setSaving(false); }
  };

  return (
    <section className="voice-lobby" aria-label={channel?.name ?? 'Stage channel'}>
      <div className="settings-page">
        <h1>{channel?.name ?? 'Stage channel'}</h1>
        {stage.isPending ? <p role="status">Loading stage…</p> : stage.isError ? (
          <div><p className="field-error" role="alert">Could not load the stage. {errorMessage(stage.error)}</p><Button onClick={() => void stage.refetch()}>Try again</Button></div>
        ) : (
          <div className="stack">
            <p role="status">{stage.data ? 'Stage is live.' : 'No stage is live.'}</p>
            {stage.data && <p>{stage.data.topic}</p>}
            {stage.data && channel?.guild_id && (connected
              ? <Button onClick={() => void leaveVoice()}>Leave stage</Button>
              : <Button onClick={() => void joinStageAudience(channel.guild_id!, channelId)}>Join as audience</Button>)}
            <p className="setting-desc">Audience members join muted.</p>
            {canManage && <>
              <Field label="Stage topic" hint="Up to 120 characters.">
                {(id) => <Input id={id} maxLength={120} value={topic} disabled={saving} onChange={(event) => setDraft(event.target.value)} />}
              </Field>
              {error && <p className="field-error" role="alert">{error}</p>}
              <div className="row">
                <Button variant="primary" loading={saving} disabled={!topic.trim() || (Boolean(stage.data) && topic.trim() === stage.data?.topic)} onClick={() => void save()}>{stage.data ? 'Save topic' : 'Start stage'}</Button>
                {stage.data && <Button variant="danger" disabled={saving} onClick={() => void end()}>End stage</Button>}
              </div>
            </>}
          </div>
        )}
      </div>
    </section>
  );
}
