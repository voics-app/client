import { Check, Copy } from '@phosphor-icons/react';
import { UserMenuTarget } from '../members/UserContextMenu';
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { isEmojiOnly } from '@renderer/domain/emojiOnly';
import { roleColorCss } from '@renderer/domain/userMenuModel';
import { parseMarkdown, type MarkdownNode } from '@renderer/domain/markdown';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { openExternalUrl as openLink } from '../../app/links';
import { copyText } from '../../app/actions';
import { openChannel } from '../../app/navigation';
import { useConnectionStore } from '../../app/connectionStore';
import { useTrustedDomainStore } from '@renderer/application/stores/composerStores';
import { usePrefsStore } from '@renderer/application/stores/prefsStore';
import { Permission } from '@shared/contracts/permissions';
import { spoilersOpen } from '@renderer/domain/chatDisplay';
import { can, useGuildPermissions } from '../../shared/hooks/usePermissions';
import { hostOf, isTrustedLink } from '@renderer/domain/linkTrust';
import { formatTimestamp, isValidUnix, relativeTickMs, timestampTooltip } from '@renderer/domain/timestamp';
import type { HighlightNode } from '@renderer/domain/highlightHtml';
import { Button } from '../../shared/ui/Button';
import { Checkbox } from '../../shared/ui/Form';
import { Modal } from '../../shared/ui/Modal';
import { Tooltip } from '../../shared/ui/Tooltip';
import { highlightCode } from './highlighter';
import { AnimatedImage } from '../../shared/ui/AnimatedImage';

function Spoiler({ children, guildId }: { children: ReactNode; guildId: string | null | undefined }) {
  const [clicked, setClicked] = useState(false);
  const mode = usePrefsStore((s) => s.spoilerDisplay);
  const canManage = can(useGuildPermissions(guildId), Permission.MANAGE_MESSAGES);
  const shown = clicked || spoilersOpen(mode, canManage);
  const setShown = (v: boolean) => setClicked(v);
  return (
    <span className={`spoiler${shown ? ' is-shown' : ''}`} role="button" tabIndex={0} onClick={() => setShown(true)} onKeyDown={(e) => e.key === 'Enter' && setShown(true)}>
      {children}
    </span>
  );
}

function renderHighlight(nodes: HighlightNode[]): ReactNode {
  return nodes.map((n, i) => (typeof n === 'string' ? <Fragment key={i}>{n}</Fragment> : <span key={i} className={n.className}>{renderHighlight(n.children)}</span>));
}

const MAX_HIGHLIGHT_CHARS = 20_000;

function CodeBlock({ text, lang }: { text: string; lang: string | null }) {
  const [copied, setCopied] = useState(false);
  const [highlighted, setHighlighted] = useState<HighlightNode[] | null>(null);
  useEffect(() => {
    let live = true;
    setHighlighted(null);
    if (!lang || text.length > MAX_HIGHLIGHT_CHARS) return;
    highlightCode(text, lang)
      .then((nodes) => live && setHighlighted(nodes))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [text, lang]);
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
        <code className={highlighted ? 'hljs' : undefined}>{highlighted ? renderHighlight(highlighted) : text}</code>
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
  const role = useGuildStore((s) => (kind === 'roleMention' && guildId ? s.guilds[guildId]?.roles.find((r) => r.id === id) : undefined));
  const meId = useSessionStore((s) => s.user?.id);
  const mine = useGuildStore((s) => (kind === 'roleMention' && guildId && meId ? !!s.members[guildId]?.[meId]?.roles.includes(id) : false));
  const roleCss = role ? roleColorCss(role.color) : undefined;
  const button = (
    <button
      type="button"
      className={`mention mention-${kind}${mine ? ' is-mine' : ''}`}
      style={roleCss ? ({ '--role-color': roleCss } as React.CSSProperties) : undefined}
      onClick={() => (kind === 'channelMention' ? openChannel(id) : kind === 'userMention' ? openDialog({ kind: 'profile', userId: id, guildId: guildId ?? null }) : undefined)}
    >
      {label}
    </button>
  );
  return kind === 'userMention' ? (
    <UserMenuTarget userId={id} name={label.replace(/^@/, '')} guildId={guildId}>
      {button}
    </UserMenuTarget>
  ) : (
    button
  );
}

function Timestamp({ unix, style }: { unix: number; style: 'f' | 't' | 'T' | 'd' | 'D' | 'F' | 'R' }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (style !== 'R' || !isValidUnix(unix)) return;
    const id = setTimeout(() => setNow(Date.now()), relativeTickMs(unix, now));
    return () => clearTimeout(id);
  }, [style, unix, now]);
  const label = formatTimestamp(unix, style, now);
  return (
    <Tooltip label={timestampTooltip(unix)}>
      <time className="md-timestamp" dateTime={isValidUnix(unix) ? new Date(unix * 1000).toISOString() : undefined}>{label}</time>
    </Tooltip>
  );
}

function MaskedLink({ url, children }: { url: string; children: ReactNode }) {
  const trusted = useTrustedDomainStore((s) => s.domains);
  const instanceHost = hostOf(useConnectionStore((s) => s.apiUrl));
  const [confirming, setConfirming] = useState(false);
  const [remember, setRemember] = useState(false);
  const host = hostOf(url) ?? url;
  const isTrusted = isTrustedLink(url, instanceHost ? [...trusted, instanceHost] : trusted);
  return (
    <>
      <a
        href={url}
        title={url}
        className="md-masked-link"
        onClick={(e) => {
          e.preventDefault();
          if (isTrusted) openLink(url);
          else setConfirming(true);
        }}
      >
        {children}
      </a>
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="You are leaving the app"
        description="This link will take you to an external website."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
            <Button
              data-autofocus
              onClick={() => {
                if (remember && hostOf(url)) useTrustedDomainStore.getState().trust(hostOf(url)!);
                setConfirming(false);
                openLink(url);
              }}
            >
              Visit site
            </Button>
          </>
        }
      >
        <p className="link-confirm-url selectable">{url}</p>
        <Checkbox checked={remember} onChange={setRemember} label={`Trust links from ${host}`} />
      </Modal>
    </>
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
            return <Spoiler key={i} guildId={guildId}><Nodes nodes={node.children} guildId={guildId} big={false} /></Spoiler>;
          case 'quote':
            return <blockquote key={i}><Nodes nodes={node.children} guildId={guildId} big={false} /></blockquote>;
          case 'heading': {
            const Tag = (['h1', 'h2', 'h3'] as const)[node.level - 1]!;
            return <Tag key={i} className="md-heading"><Nodes nodes={node.children} guildId={guildId} big={false} /></Tag>;
          }
          case 'subtext':
            return <small key={i} className="md-subtext"><Nodes nodes={node.children} guildId={guildId} big={false} /></small>;
          case 'list': {
            const Tag = node.ordered ? 'ol' : 'ul';
            return (
              <Tag key={i} className="md-list" start={node.ordered ? node.start : undefined}>
                {node.items.map((item, j) => (
                  <li key={j}><Nodes nodes={item} guildId={guildId} big={false} /></li>
                ))}
              </Tag>
            );
          }
          case 'table':
            return (
              <div key={i} className="md-table-scroll" tabIndex={0}>
                <table className="md-table">
                  <thead>
                    <tr>
                      {node.header.map((cell, c) => (
                        <th key={c} style={{ textAlign: node.align[c] ?? undefined }}><Nodes nodes={cell} guildId={guildId} big={false} /></th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {node.rows.map((row, r) => (
                      <tr key={r}>
                        {row.map((cell, c) => (
                          <td key={c} style={{ textAlign: node.align[c] ?? undefined }}><Nodes nodes={cell} guildId={guildId} big={false} /></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case 'timestamp':
            return <Timestamp key={i} unix={node.unix} style={node.style} />;
          case 'code':
            return <code key={i} className="inline-code">{node.text}</code>;
          case 'codeblock':
            return <CodeBlock key={i} text={node.text} lang={node.lang} />;
          case 'userMention':
          case 'roleMention':
          case 'channelMention':
            return <Mention key={i} kind={node.type} id={node.id} guildId={guildId} />;
          case 'customEmoji':
            return <AnimatedImage kind="emoji" animated={!!node.animated} key={i} data-ctx="emoji" data-emoji-id={node.id} data-emoji-name={node.name} data-animated={node.animated ? 'true' : 'false'} data-src={`${cdn}/emojis/${node.id}.${node.animated ? 'gif' : 'png'}`} className={`custom-emoji${big ? ' is-big' : ''}`} src={`${cdn}/emojis/${node.id}.${node.animated ? 'gif' : 'png'}`} alt={`:${node.name}:`} title={`:${node.name}:`} draggable={false} />;
          case 'everyone':
            return <span key={i} className="mention mention-everyone">@{node.kind}</span>;
          case 'link':
            if (node.label) return <MaskedLink key={i} url={node.url}><Nodes nodes={node.label} guildId={guildId} big={false} /></MaskedLink>;
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

export function MarkdownView({ source, guildId }: { source: string; guildId?: string | null }) {
  const big = isEmojiOnly(source);
  return (
    <div className={`markdown selectable${big ? ' is-emoji-only' : ''}`}>
      <Nodes nodes={parseMarkdown(source)} guildId={guildId} big={big} />
    </div>
  );
}
