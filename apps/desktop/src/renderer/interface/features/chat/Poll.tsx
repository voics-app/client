import { useEffect, useState } from 'react';
import type { ChatMessage } from '@discordy/core/application/stores/messageStore';
import { useMessageStore } from '@discordy/core/application/stores/messageStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { reportError } from '../../app/actions';
import { getRuntime } from '../../app/runtime';
import { Button } from '../../shared/ui/Button';
import { Field, Input, Select } from '../../shared/ui/Form';
import { Modal } from '../../shared/ui/Modal';
import { useNow } from '../../shared/hooks/useNow';

export function CreatePoll({ channelId, onClose }: { channelId: string; onClose: () => void }) {
  const [question, setQuestion] = useState('');
  const [answers, setAnswers] = useState(['', '']);
  const [duration, setDuration] = useState(24);
  const [multiple, setMultiple] = useState(false);
  const [busy, setBusy] = useState(false);
  const valid = question.trim().length > 0 && answers.length >= 2 && answers.every((answer) => answer.trim().length > 0);
  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const message = await getRuntime().api.sendMessage(channelId, { content: '', nonce: crypto.randomUUID(), poll: { question: { text: question.trim() }, answers: answers.map((answer) => ({ poll_media: { text: answer.trim() } })), duration, allow_multiselect: multiple, layout_type: 1 } });
      useMessageStore.getState().receive(message);
      onClose();
    } catch (error) { reportError(error, 'Could not create poll'); }
    finally { setBusy(false); }
  };
  return <Modal open onClose={onClose} title="Create poll" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!valid} loading={busy} onClick={() => void submit()}>Create poll</Button></>}>
    <div className="poll-form">
      <Field label="Question">{(id) => <Input id={id} data-autofocus value={question} maxLength={300} onChange={(e) => setQuestion(e.target.value)} />}</Field>
      {answers.map((answer, index) => <Field key={index} label={`Answer ${index + 1}`}>{(id) => <Input id={id} value={answer} maxLength={55} onChange={(e) => setAnswers(answers.map((item, i) => i === index ? e.target.value : item))} />}</Field>)}
      {answers.length < 10 && <Button size="sm" onClick={() => setAnswers([...answers, ''])}>Add answer</Button>}
      {answers.length > 2 && <Button size="sm" onClick={() => setAnswers(answers.slice(0, -1))}>Remove last answer</Button>}
      <Field label="Duration">{(id) => <Select id={id} value={duration} onChange={(e) => setDuration(Number(e.target.value))}><option value={1}>1 hour</option><option value={24}>1 day</option><option value={72}>3 days</option><option value={168}>1 week</option></Select>}</Field>
      <label><input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} /> Allow multiple answers</label>
    </div>
  </Modal>;
}

export function MessagePoll({ message }: { message: ChatMessage }) {
  const [busy, setBusy] = useState(false);
  const gateway = useSessionStore((s) => s.gateway);
  const me = useSessionStore((s) => s.user?.id);
  const now = useNow(60_000);
  const poll = message.poll!;
  const results = poll.results;
  const refresh = async () => {
    try {
      const next = await getRuntime().api.getPoll(message.channel_id, message.id);
      useMessageStore.getState().patch(message.channel_id, message.id, { poll: next });
    } catch (error) { reportError(error, 'Could not refresh poll'); }
  };
  useEffect(() => {
    void refresh();
    const foreground = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', foreground);
    return () => document.removeEventListener('visibilitychange', foreground);
  }, [message.id, message.channel_id, gateway]); // eslint-disable-line react-hooks/exhaustive-deps
  const vote = async (id: number, selected: boolean) => {
    if (busy || results?.vote_version === undefined) return;
    setBusy(true);
    try {
      const next = await getRuntime().api.setPollVote(message.channel_id, message.id, id, selected, results.vote_version);
      useMessageStore.getState().patch(message.channel_id, message.id, { poll: next });
    } catch (error) { reportError(error, 'Could not update vote'); await refresh(); }
    finally { setBusy(false); }
  };
  const end = async () => {
    setBusy(true);
    try { const next = await getRuntime().api.endPoll(message.channel_id, message.id); useMessageStore.getState().patch(message.channel_id, message.id, next); }
    catch (error) { reportError(error, 'Could not end poll'); await refresh(); }
    finally { setBusy(false); }
  };
  const closed = results?.is_finalized || now >= Date.parse(poll.expiry);
  return <section className="message-poll" aria-label={`Poll: ${poll.question.text}`}>
    <strong>{poll.question.text}</strong>
    <span className="poll-meta">{closed ? 'Poll ended' : `Ends ${new Date(poll.expiry).toLocaleString()}`}{poll.allow_multiselect ? ' - Select multiple' : ' - Select one'}</span>
    {poll.answers.map((answer) => {
      const count = results?.answer_counts.find((entry) => entry.id === answer.answer_id);
      return <button type="button" key={answer.answer_id} className={`poll-answer${count?.me_voted ? ' is-selected' : ''}`} disabled={busy || closed || results?.vote_version === undefined} aria-pressed={count?.me_voted ?? false} onClick={() => void vote(answer.answer_id, !count?.me_voted)}><span>{answer.poll_media.emoji?.name ? `${answer.poll_media.emoji.name} ` : ''}{answer.poll_media.text}</span><span>{count ? `${count.count} ${count.count === 1 ? 'vote' : 'votes'}` : 'Unknown'}</span></button>;
    })}
    {me === message.author.id && !closed && <Button size="sm" disabled={busy} onClick={() => void end()}>End poll</Button>}
  </section>;
}
