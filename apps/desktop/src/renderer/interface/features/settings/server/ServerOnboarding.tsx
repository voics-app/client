import { useEffect, useState } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import type { OnboardingConfig, OnboardingOption } from '@discordy/core/contracts/rest';
import { errorMessage } from '../../../app/actions';
import { getRuntime } from '../../../app/runtime';
import { Button } from '../../../shared/ui/Button';
import { Field, Input, Select } from '../../../shared/ui/Form';

const emptyOption = (): OnboardingOption => ({ label: '', role_id: null, channel_id: null });

export function ServerOnboarding({ guildId }: { guildId: string }) {
  const guild = useGuildStore((state) => state.guilds[guildId]);
  const channels = useGuildStore((state) => state.channels);
  const [config, setConfig] = useState<OnboardingConfig>({ enabled: false, questions: [] });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    getRuntime().api.onboarding(guildId).then((value) => { if (active) { setConfig(value.config); setReady(true); } })
      .catch((error: unknown) => { if (active) setMessage(errorMessage(error)); });
    return () => { active = false; };
  }, [guildId]);
  const patchQuestion = (index: number, update: (question: OnboardingConfig['questions'][number]) => OnboardingConfig['questions'][number]) =>
    setConfig((previous) => ({ ...previous, questions: previous.questions.map((question, i) => i === index ? update(question) : question) }));
  const save = async () => {
    setBusy(true); setMessage('');
    try { await getRuntime().api.setOnboarding(guildId, config); setMessage('Onboarding saved.'); }
    catch (error) { setMessage(errorMessage(error)); }
    finally { setBusy(false); }
  };
  return <div className="settings-page"><h1>Onboarding</h1>
    <p className="page-sub">Ask new members what interests them. Options may suggest a channel or grant a non-moderation role you can manage.</p>
    <div className="stack">
      <label><input type="checkbox" checked={config.enabled} disabled={!ready} onChange={(event) => setConfig({ ...config, enabled: event.target.checked })} /> Ask new members</label>
      {config.questions.map((question, qi) => <fieldset key={qi}><legend>Question {qi + 1}</legend>
        <Field label="Question">{(id) => <Input id={id} value={question.title} maxLength={100} onChange={(event) => patchQuestion(qi, (q) => ({ ...q, title: event.target.value }))} />}</Field>
        {question.options.map((option, oi) => <div key={oi} className="stack">
          <Field label="Option">{(id) => <Input id={id} value={option.label} maxLength={100} onChange={(event) => patchQuestion(qi, (q) => ({ ...q, options: q.options.map((o, i) => i === oi ? { ...o, label: event.target.value } : o) }))} />}</Field>
          <Field label="Role">{(id) => <Select id={id} value={option.role_id ?? ''} onChange={(event) => patchQuestion(qi, (q) => ({ ...q, options: q.options.map((o, i) => i === oi ? { ...o, role_id: event.target.value || null } : o) }))}><option value="">No role</option>{guild?.roles.filter((role) => role.id !== guildId && !role.managed).map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</Select>}</Field>
          <Field label="Suggested channel">{(id) => <Select id={id} value={option.channel_id ?? ''} onChange={(event) => patchQuestion(qi, (q) => ({ ...q, options: q.options.map((o, i) => i === oi ? { ...o, channel_id: event.target.value || null } : o) }))}><option value="">No channel</option>{Object.values(channels).filter((channel) => channel.guild_id === guildId).map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</Select>}</Field>
          <Button variant="ghost" onClick={() => patchQuestion(qi, (q) => ({ ...q, options: q.options.filter((_, i) => i !== oi) }))}>Remove option</Button>
        </div>)}
        <Button variant="ghost" disabled={question.options.length >= 10} onClick={() => patchQuestion(qi, (q) => ({ ...q, options: [...q.options, emptyOption()] }))}>Add option</Button>
        <Button variant="ghost" onClick={() => setConfig({ ...config, questions: config.questions.filter((_, i) => i !== qi) })}>Remove question</Button>
      </fieldset>)}
      <Button variant="ghost" disabled={!ready || config.questions.length >= 5} onClick={() => setConfig({ ...config, questions: [...config.questions, { title: '', options: [emptyOption()] }] })}>Add question</Button>
      <Button variant="primary" disabled={!ready} loading={busy} onClick={() => void save()}>Save onboarding</Button>
      {message && <p role="status">{message}</p>}
    </div>
  </div>;
}
