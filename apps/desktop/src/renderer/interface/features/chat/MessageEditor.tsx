import { useEffect, useRef, useState } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import type { ChatMessage } from '@discordy/core/application/stores/messageStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { attempt } from '../../app/actions';
import { getRuntime } from '../../app/runtime';

/** In-place editor: Enter saves, Escape cancels. */
export function MessageEditor({ message }: { message: ChatMessage }) {
  const [text, setText] = useState(message.content);
  const ref = useRef<HTMLTextAreaElement>(null);
  const setEditing = useUiStore((s) => s.setEditing);
  const channel = useGuildStore((s) => s.channels[message.channel_id]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const save = async () => {
    const content = text.trim();
    if (!channel) return;
    if (!content || content === message.content) {
      setEditing(null);
      return;
    }
    await attempt(() => getRuntime().privacy.sender.edit(channel, message.id, content), 'Could not edit message');
    setEditing(null);
  };

  return (
    <div className="message-editor">
      <textarea
        ref={ref}
        value={text}
        rows={1}
        aria-label="Edit message"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void save();
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            setEditing(null);
          }
        }}
      />
      <p>
        escape to <button type="button" onClick={() => setEditing(null)}>cancel</button> · enter to <button type="button" onClick={() => void save()}>save</button>
      </p>
    </div>
  );
}
