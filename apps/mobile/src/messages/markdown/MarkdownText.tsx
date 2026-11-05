import * as Clipboard from 'expo-clipboard';
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { spoilersOpen } from '@discordy/core/domain/chatDisplay';
import { isEmojiOnly } from '@discordy/core/domain/emojiOnly';
import { parseMarkdown, toPlainText, type MarkdownNode } from '@discordy/core/domain/markdown';
import { formatTimestamp } from '@discordy/core/domain/timestamp';
import { BRAND } from '../../brand';
import { theme } from '../../theme';
import { useChatContext } from '../chatContext';
import { followLink } from './links';

const BLOCK_TYPES = new Set<MarkdownNode['type']>(['codeblock', 'quote', 'heading', 'subtext', 'list', 'table']);
const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });
const HEADING_SIZE = { 1: 24, 2: 20, 3: 17 } as const;
const EMOJI_SIZE = 22;
const JUMBO_EMOJI_SIZE = 40;

export interface MarkdownTextProps {
  source: string;
  /** Native text selection (long press and drag handles); links, mentions and spoilers stay tappable. */
  selectable?: boolean;
  fontSize?: number;
  /** Inline content after the last word, such as the edited marker. */
  trailing?: ReactNode;
}

/** Message text: the `domain/markdown` tree drawn with React Native text. */
export function MarkdownText({ source, selectable, fontSize = 16, trailing }: MarkdownTextProps) {
  const nodes = useMemo(() => parseMarkdown(source), [source]);
  const big = useMemo(() => isEmojiOnly(source), [source]);
  return <Blocks nodes={nodes} selectable={selectable} big={big} fontSize={fontSize} trailing={trailing} />;
}

interface FlowProps {
  nodes: MarkdownNode[];
  selectable: boolean | undefined;
  big: boolean;
  fontSize: number;
  trailing?: ReactNode;
}

type Run = { block: MarkdownNode } | { inline: MarkdownNode[] };

/** Splits the nodes into runs of inline text and block elements, because a View cannot sit inside a Text. */
function Blocks({ nodes, selectable, big, fontSize, trailing }: FlowProps) {
  const runs: Run[] = [];
  for (const node of nodes) {
    if (BLOCK_TYPES.has(node.type)) runs.push({ block: node });
    else {
      const last = runs[runs.length - 1];
      if (last && 'inline' in last) last.inline.push(node);
      else runs.push({ inline: [node] });
    }
  }
  return (
    <View>
      {runs.map((run, i) => {
        if ('block' in run) return <Block key={i} node={run.block} selectable={selectable} fontSize={fontSize} />;
        const inline = trimBreaks(run.inline, i === 0, i === runs.length - 1);
        const tail = i === runs.length - 1 ? trailing : null;
        if (inline.length === 0 && !tail) return null;
        return (
          <Text key={i} selectable={selectable} style={[styles.text, { fontSize, lineHeight: Math.round(fontSize * 1.4) }]}>
            <Inline nodes={inline} big={big} />
            {tail}
          </Text>
        );
      })}
    </View>
  );
}

/** The line breaks the parser keeps around a block would show as empty lines. */
function trimBreaks(nodes: MarkdownNode[], first: boolean, last: boolean): MarkdownNode[] {
  const out = [...nodes];
  const head = out[0];
  if (!first && head?.type === 'text') out[0] = { type: 'text', text: head.text.replace(/^\n+/, '') };
  const tail = out[out.length - 1];
  if (!last && tail?.type === 'text') out[out.length - 1] = { type: 'text', text: tail.text.replace(/\n+$/, '') };
  return out.filter((n) => n.type !== 'text' || n.text !== '');
}

function Block({ node, selectable, fontSize }: { node: MarkdownNode; selectable: boolean | undefined; fontSize: number }) {
  switch (node.type) {
    case 'codeblock':
      return <CodeBlock text={node.text} lang={node.lang} selectable={selectable} />;
    case 'quote':
      return (
        <View style={styles.quote}>
          <Blocks nodes={node.children} selectable={selectable} big={false} fontSize={fontSize} />
        </View>
      );
    case 'heading':
      return (
        <Text selectable={selectable} accessibilityRole="header" style={[styles.text, styles.heading, { fontSize: HEADING_SIZE[node.level], lineHeight: HEADING_SIZE[node.level] * 1.3 }]}>
          <Inline nodes={node.children} big={false} />
        </Text>
      );
    case 'subtext':
      return (
        <Text selectable={selectable} style={[styles.text, styles.subtext]}>
          <Inline nodes={node.children} big={false} />
        </Text>
      );
    case 'list':
      return (
        <View style={styles.list}>
          {node.items.map((item, i) => (
            <View key={i} style={styles.listItem}>
              <Text style={[styles.text, { fontSize }]}>{node.ordered ? `${node.start + i}.` : '•'}</Text>
              <View style={styles.listBody}>
                <Blocks nodes={item} selectable={selectable} big={false} fontSize={fontSize} />
              </View>
            </View>
          ))}
        </View>
      );
    case 'table':
      return (
        <ScrollView horizontal style={styles.table} showsHorizontalScrollIndicator={false}>
          <View>
            <TableRow cells={node.header} align={node.align} header selectable={selectable} />
            {node.rows.map((row, i) => (
              <TableRow key={i} cells={row} align={node.align} selectable={selectable} />
            ))}
          </View>
        </ScrollView>
      );
    default:
      return null;
  }
}

function TableRow({ cells, align, header, selectable }: { cells: MarkdownNode[][]; align: ('left' | 'center' | 'right' | null)[]; header?: boolean; selectable: boolean | undefined }) {
  return (
    <View style={[styles.tableRow, header && styles.tableHeader]}>
      {cells.map((cell, i) => (
        <Text key={i} selectable={selectable} style={[styles.text, styles.tableCell, header && styles.bold, { textAlign: align[i] ?? 'left' }]}>
          <Inline nodes={cell} big={false} />
        </Text>
      ))}
    </View>
  );
}

function CodeBlock({ text, lang, selectable }: { text: string; lang: string | null; selectable: boolean | undefined }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void Clipboard.setStringAsync(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <View style={styles.codeblock}>
      <View style={styles.codebar}>
        <Text style={styles.codelang}>{lang ?? 'text'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Copy code" hitSlop={12} onPress={copy}>
          <Text style={styles.codelang}>{copied ? 'Copied' : 'Copy'}</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Text selectable={selectable} style={styles.code}>
          {text}
        </Text>
      </ScrollView>
    </View>
  );
}

/** Inline nodes as nested Text, so a whole paragraph wraps and selects as one piece. */
function Inline({ nodes, big }: { nodes: MarkdownNode[]; big: boolean }) {
  return (
    <>
      {nodes.map((node, i) => (
        <InlineNode key={i} node={node} big={big} />
      ))}
    </>
  );
}

function Styled({ style, nodes }: { style: object; nodes: MarkdownNode[] }) {
  return (
    <Text style={style}>
      <Inline nodes={nodes} big={false} />
    </Text>
  );
}

function InlineNode({ node, big }: { node: MarkdownNode; big: boolean }): ReactNode {
  switch (node.type) {
    case 'text':
      return <Fragment>{node.text}</Fragment>;
    case 'bold':
      return <Styled style={styles.bold} nodes={node.children} />;
    case 'italic':
      return <Styled style={styles.italic} nodes={node.children} />;
    case 'underline':
      return <Styled style={styles.underline} nodes={node.children} />;
    case 'strike':
      return <Styled style={styles.strike} nodes={node.children} />;
    case 'spoiler':
      return <Spoiler nodes={node.children} />;
    case 'code':
      return <Text style={styles.inlineCode}>{` ${node.text} `}</Text>;
    case 'userMention':
    case 'roleMention':
    case 'channelMention':
      return <Mention kind={node.type} id={node.id} />;
    case 'everyone':
      return <Text style={styles.mention}>{`@${node.kind}`}</Text>;
    case 'customEmoji': {
      const size = big ? JUMBO_EMOJI_SIZE : EMOJI_SIZE;
      return <Image accessibilityLabel={`:${node.name}:`} source={{ uri: `${BRAND.cdnUrl}/emojis/${node.id}.${node.animated ? 'gif' : 'png'}` }} style={{ width: size, height: size }} />;
    }
    case 'link':
      return (
        <Text accessibilityRole="link" style={styles.link} onPress={() => followLink(node.url, node.label !== undefined)}>
          {node.label ? <Inline nodes={node.label} big={false} /> : node.url}
        </Text>
      );
    case 'timestamp':
      return <Text style={styles.mention}>{formatTimestamp(node.unix, node.style)}</Text>;
    default:
      return null;
  }
}

/** Hidden text is replaced by blanks of its length, so it cannot leak through selection or screen readers. */
function Spoiler({ nodes }: { nodes: MarkdownNode[] }) {
  const mode = usePrefsStore((s) => s.spoilerDisplay);
  const { canManageMessages } = useChatContext();
  const [revealed, setRevealed] = useState(false);
  if (revealed || spoilersOpen(mode, canManageMessages)) {
    return (
      <Text style={styles.spoilerShown} onPress={() => setRevealed(false)}>
        <Inline nodes={nodes} big={false} />
      </Text>
    );
  }
  return (
    <Text accessibilityRole="button" accessibilityLabel="Spoiler, tap to reveal" style={styles.spoilerHidden} onPress={() => setRevealed(true)}>
      {' '.repeat(Math.min(Math.max(toPlainText(nodes).length, 3), 40))}
    </Text>
  );
}

function Mention({ kind, id }: { kind: 'userMention' | 'roleMention' | 'channelMention'; id: string }) {
  const { guildId, onPressUser, onPressChannel } = useChatContext();
  const label = useGuildStore((s) => {
    if (kind === 'channelMention') return `#${s.channels[id]?.name ?? 'unknown-channel'}`;
    if (kind === 'roleMention') return `@${(guildId ? s.guilds[guildId]?.roles.find((r) => r.id === id)?.name : null) ?? 'unknown-role'}`;
    const member = guildId ? s.members[guildId]?.[id] : undefined;
    const user = member?.user;
    return `@${member?.nick ?? user?.global_name ?? user?.username ?? 'unknown-user'}`;
  });
  const me = useSessionStore((s) => s.user?.id);
  const mine = useGuildStore((s) => (kind === 'roleMention' ? Boolean(guildId && me && s.members[guildId]?.[me]?.roles.includes(id)) : kind === 'userMention' && id === me));
  const onPress = kind === 'channelMention' ? () => onPressChannel(id) : kind === 'userMention' ? () => onPressUser(id) : undefined;
  return (
    <Text accessibilityRole={onPress ? 'button' : undefined} style={[styles.mention, mine && styles.mentionMine]} onPress={onPress}>
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: { color: theme.text },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  underline: { textDecorationLine: 'underline' },
  strike: { textDecorationLine: 'line-through' },
  heading: { fontWeight: '700', marginTop: 4 },
  subtext: { color: theme.muted, fontSize: 12 },
  link: { color: theme.accent },
  mention: { color: theme.accent, backgroundColor: theme.accentSoft, fontWeight: '500' },
  mentionMine: { backgroundColor: 'rgba(125, 141, 255, 0.32)' },
  inlineCode: { fontFamily: MONO, backgroundColor: theme.raised, color: theme.text, fontSize: 14 },
  spoilerHidden: { backgroundColor: theme.raisedHover, color: 'transparent' },
  spoilerShown: { backgroundColor: theme.hover },
  quote: { borderLeftWidth: 4, borderLeftColor: theme.hairlineStrong, paddingLeft: 10, marginVertical: 2 },
  list: { marginVertical: 2 },
  listItem: { flexDirection: 'row', gap: 8 },
  listBody: { flex: 1 },
  table: { marginVertical: 4 },
  tableRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.hairlineStrong },
  tableHeader: { backgroundColor: theme.raised },
  tableCell: { minWidth: 96, paddingHorizontal: 8, paddingVertical: 6, fontSize: 14 },
  codeblock: { backgroundColor: theme.raised, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairlineStrong, marginVertical: 4, overflow: 'hidden' },
  codebar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: theme.raisedHover },
  codelang: { color: theme.muted, fontSize: 12 },
  code: { color: theme.text, fontFamily: MONO, fontSize: 13, lineHeight: 19, padding: 12 },
});
