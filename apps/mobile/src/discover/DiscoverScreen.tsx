import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import type { DiscoveryGuild } from '@discordy/core/contracts/rest';
import { categoryLabel, memberCountLabel } from '@discordy/core/domain/discoveryModel';
import { getRuntime } from '../runtime';
import { ServerIcon } from '../shell/ServerIcon';
import { theme } from '../theme';
import { attempt } from '../ui/attempt';
import { Button, Notice } from '../ui/controls';

export const DISCOVER_PAGE = 24;

function GuildCard({ guild, onTag }: { guild: DiscoveryGuild; onTag(tag: string): void }) {
  const joined = useGuildStore((s) => Boolean(s.guilds[guild.id]));
  const [busy, setBusy] = useState(false);
  const open = () => useUiStore.getState().navigate({ kind: 'guild', guildId: guild.id, channelId: null });
  const join = async () => {
    setBusy(true);
    const ok = await attempt(async () => {
      await getRuntime().api.joinDiscoveryGuild(guild.id);
      return true;
    }, 'Could not join this server');
    setBusy(false);
    // The server arrives over the gateway a moment after joining.
    if (ok) setTimeout(open, 300);
  };
  return (
    <View accessibilityLabel={guild.name} style={styles.card}>
      <View style={styles.head}>
        <View style={styles.icon}>
          <ServerIcon guild={{ id: guild.id, name: guild.name, icon: guild.icon }} />
        </View>
        <View style={styles.title}>
          <Text numberOfLines={1} style={styles.name}>
            {guild.name}
          </Text>
          <Text style={styles.category}>{categoryLabel(guild.category)}</Text>
        </View>
      </View>
      {guild.description ? <Text style={styles.description}>{guild.description}</Text> : null}
      {guild.tags.length > 0 && (
        <View style={styles.tags}>
          {guild.tags.map((tag) => (
            <Pressable key={tag} accessibilityRole="button" accessibilityLabel={`Filter by tag ${tag}`} onPress={() => onTag(tag)} style={styles.tag}>
              <Text style={styles.tagText}>{`#${tag}`}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <View style={styles.foot}>
        <Text style={styles.counts}>{[guild.approximate_presence_count !== null ? `${guild.approximate_presence_count.toLocaleString('en-US')} online` : '', memberCountLabel(guild.approximate_member_count)].filter(Boolean).join(' · ')}</Text>
        {joined ? <Button label="Open" accessibilityLabel={`Open ${guild.name}`} onPress={open} /> : <Button label="Join" accessibilityLabel={`Join ${guild.name}`} tone="primary" busy={busy} onPress={() => void join()} />}
      </View>
    </View>
  );
}

/** Desktop's Discover: public servers that opted in, searched by text, narrowed by category or tag, a page at a time, with Join. */
export function DiscoverScreen() {
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [guilds, setGuilds] = useState<DiscoveryGuild[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadingMore, setLoadingMore] = useState(false);
  const ticket = useRef(0);

  useEffect(() => {
    getRuntime().api.discoveryCategories().then(setCategories).catch(() => undefined);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 250);
    return () => clearTimeout(timer);
  }, [text]);

  const load = useCallback(
    async (offset: number) => {
      const mine = ++ticket.current;
      if (offset === 0) setStatus('loading');
      else setLoadingMore(true);
      try {
        const page = await getRuntime().api.discoveryGuilds({ ...(query ? { query } : {}), ...(category ? { category } : {}), ...(tag ? { tag } : {}), limit: DISCOVER_PAGE, offset });
        if (mine !== ticket.current) return;
        setGuilds((cur) => (offset === 0 ? page.guilds : [...cur, ...page.guilds]));
        setTotal(page.total);
        setStatus('ready');
      } catch {
        if (mine === ticket.current && offset === 0) setStatus('error');
      } finally {
        if (mine === ticket.current) setLoadingMore(false);
      }
    },
    [query, category, tag],
  );
  useEffect(() => {
    void load(0);
  }, [load]);

  const header = (
    <View>
      <View style={styles.search}>
        <TextInput accessibilityLabel="Search servers" placeholder="Search servers" placeholderTextColor={theme.subtle} value={text} onChangeText={setText} autoCapitalize="none" autoCorrect={false} returnKeyType="search" style={styles.input} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Pressable accessibilityRole="button" accessibilityLabel="Category: All" accessibilityState={{ selected: category === null }} onPress={() => setCategory(null)} style={[styles.chip, category === null && styles.chipOn]}>
          <Text style={styles.chipText}>All</Text>
        </Pressable>
        {categories.map((c) => (
          <Pressable key={c} accessibilityRole="button" accessibilityLabel={`Category: ${categoryLabel(c)}`} accessibilityState={{ selected: category === c }} onPress={() => setCategory(category === c ? null : c)} style={[styles.chip, category === c && styles.chipOn]}>
            <Text style={styles.chipText}>{categoryLabel(c)}</Text>
          </Pressable>
        ))}
        {tag && (
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove tag filter ${tag}`} onPress={() => setTag(null)} style={[styles.chip, styles.chipOn]}>
            <Text style={styles.chipText}>{`#${tag}  x`}</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );

  return (
    <FlatList
      style={styles.screen}
      data={status === 'ready' ? guilds : []}
      keyExtractor={(g) => g.id}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={header}
      ListEmptyComponent={
        status === 'loading' ? (
          <ActivityIndicator color={theme.muted} style={styles.center} />
        ) : status === 'error' ? (
          <View>
            <Notice>Could not load servers. Check your connection and try again.</Notice>
            <View style={styles.retry}>
              <Button label="Retry" onPress={() => void load(0)} />
            </View>
          </View>
        ) : (
          <Notice>No servers match. Try different words or filters.</Notice>
        )
      }
      ListFooterComponent={status === 'ready' && guilds.length < total ? <View style={styles.retry}><Button label="Load more" busy={loadingMore} onPress={() => void load(guilds.length)} /></View> : undefined}
      renderItem={({ item }) => <GuildCard guild={item} onTag={setTag} />}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  search: { margin: 12, paddingHorizontal: 12, minHeight: 44, borderRadius: 12, backgroundColor: theme.raised },
  input: { minHeight: 44, color: theme.text, fontSize: 16 },
  chips: { paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, backgroundColor: theme.raised, justifyContent: 'center' },
  chipOn: { backgroundColor: theme.accentSoft, borderWidth: 1, borderColor: theme.accent },
  chipText: { color: theme.text, fontSize: 14 },
  center: { padding: 32 },
  retry: { padding: 16 },
  card: { marginHorizontal: 12, marginBottom: 12, padding: 14, borderRadius: 14, backgroundColor: theme.raised, borderWidth: 1, borderColor: theme.hairline },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 52, height: 52, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.raisedHover },
  title: { flex: 1 },
  name: { color: theme.text, fontSize: 17, fontWeight: '700' },
  category: { color: theme.subtle, fontSize: 13, marginTop: 2 },
  description: { color: theme.muted, fontSize: 14, marginTop: 10 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  tag: { minHeight: 44, paddingHorizontal: 10, justifyContent: 'center' },
  tagText: { color: theme.accent, fontSize: 13 },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 8 },
  counts: { color: theme.subtle, fontSize: 13, flexShrink: 1 },
});
