import { Check, Copy } from '@phosphor-icons/react';
import { Fragment, useState, type ReactNode } from 'react';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { parseMarkdown, type MarkdownNode } from '@renderer/domain/markdown';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { openExternalUrl as openLink } from '../../app/links';
import { copyText } from '../../app/actions';
import { openChannel } from '../../app/navigation';
import { useConnectionStore } from '../../app/connectionStore';

function Spoiler({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false);
  return (
    <span className={`spoiler${shown ? ' is-shown' : ''}`} role="button" tabIndex={0} onClick={() => setShown(true)} onKeyDown={(e) => e.key === 'Enter' && setShown(true)}>
      {children}
    </span>
  );
}

function CodeBlock({ text, lang }: { text: string; lang: string | null }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="codeblock">
      <div className="codeblock-bar">
        <span>{lang ?? 'text'}</span>
        <button
          type="button"
          aria-label="Copy code"
          onClick={() => {
            void copyText(text, 'Code copied');
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      <pre>
        <code>{text}</code>
      </pre>
    </div>
  );
}

function Mention({ kind, id, guildId }: { kind: 'userMention' | 'roleMention' | 'channelMention'; id: string; guildId: string | null | undefined }) {
  const openDialog = useUiStore((s) => s.openDialog);
  const label = useGuildStore((s) => {
    if (kind === 'channelMention') return `#${s.channels[id]?.name ?? 'unknown-channel'}`;
    if (kind === 'roleMention') return `@${(guildId ? s.guilds[guildId]?.roles.find((r) => r.id === id)?.name : null) ?? 'unknown-role'}`;
    const member = guildId ? s.members[guildId]?.[id] : undefined;
    const user = member?.user;
    return `@${member?.nick ?? user?.global_name ?? user?.username ?? 'unknown-user'}`;
  });
  return (
    <button
      type="button"
      className={`mention mention-${kind}`}
      onClick={() => (kind === 'channelMention' ? openChannel(id) : kind === 'userMention' ? openDialog({ kind: 'profile', userId: id, guildId: guildId ?? null }) : undefined)}
    >
      {label}
    </button>
  );
}

function Nodes({ nodes, guildId, big }: { nodes: MarkdownNode[]; guildId: string | null | undefined; big: boolean }) {
  const cdn = useConnectionStore((s) => s.cdnUrl);
  return (
    <>
      {nodes.map((node, i) => {
        switch (node.type) {
          case 'text':
            return <Fragment key={i}>{node.text}</Fragment>;
          case 'bold':
            return <strong key={i}><Nodes nodes={node.children} guildId={guildId} big={false} /></strong>;
          case 'italic':
            return <em key={i}><Nodes nodes={node.children} guildId={guildId} big={false} /></em>;
          case 'underline':
            return <u key={i}><Nodes nodes={node.children} guildId={guildId} big={false} /></u>;
          case 'strike':
            return <s key={i}><Nodes nodes={node.children} guildId={guildId} big={false} /></s>;
          case 'spoiler':
            return <Spoiler key={i}><Nodes nodes={node.children} guildId={guildId} big={false} /></Spoiler>;
          case 'quote':
            return <blockquote key={i}><Nodes nodes={node.children} guildId={guildId} big={false} /></blockquote>;
          case 'code':
            return <code key={i} className="inline-code">{node.text}</code>;
          case 'codeblock':
            return <CodeBlock key={i} text={node.text} lang={node.lang} />;
          case 'userMention':
          case 'roleMention':
          case 'channelMention':
            return <Mention key={i} kind={node.type} id={node.id} guildId={guildId} />;
          case 'customEmoji':
            return <img key={i} data-ctx="emoji" data-emoji-id={node.id} data-emoji-name={node.name} data-animated={node.animated ? 'true' : 'false'} data-src={`${cdn}/emojis/${node.id}.${node.animated ? 'gif' : 'png'}`} className={`custom-emoji${big ? ' is-big' : ''}`} src={`${cdn}/emojis/${node.id}.${node.animated ? 'gif' : 'png'}`} alt={`:${node.name}:`} title={`:${node.name}:`} draggable={false} />;
          case 'everyone':
            return <span key={i} className="mention mention-everyone">@{node.kind}</span>;
          case 'link':
            return (
              <a key={i} href={node.url} data-ctx="link" data-url={node.url} onClick={(e) => { e.preventDefault(); openLink(node.url); }}>
                {node.url}
              </a>
            );
        }
      })}
    </>
  );
}

const EMOJI_ONLY = /^(?:\s*(?:\p{Extended_Pictographic}|<a?:\w+:\d+>)\s*){1,27}$/u;

export function MarkdownView({ source, guildId }: { source: string; guildId?: string | null }) {
  const big = EMOJI_ONLY.test(source);
  return (
    <div className={`markdown selectable${big ? ' is-emoji-only' : ''}`}>
      <Nodes nodes={parseMarkdown(source)} guildId={guildId} big={big} />
    </div>
  );
}
