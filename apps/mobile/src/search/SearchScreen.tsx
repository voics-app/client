import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useReadNavStore } from '@discordy/core/application/stores/readNavStore';
import { SEARCH_SORTS, type SearchSort } from '@discordy/core/application/stores/searchStore';
import type { Message } from '@discordy/core/contracts/rest';
import { applySuggestion, FILTER_KEYS, parseQuery, suggest, withoutFilter } from '@discordy/core/domain/messageSearch';
import { openMessage } from '../navigation/openMessage';
import { theme } from '../theme';
import { Notice } from '../ui/controls';
import { FileResult, LinkResult, MediaGrid, MessageHit } from './SearchResults';
import { fileRows, hitsOf, linkRows, mediaTiles, SEARCH_TABS, type SearchTab } from './searchTabs';
import { useSearchTarget } from './searchTarget';
import { useSearch } from './useSearch';

const PRIVATE_NOTICE = 'Messages in private chats stay on devices, so the mobile app cannot search them yet.';

/**
 * Message search like desktop's: type words and `from:`, `in:`, `has:`, `mentions:`, `before:`, `after:`, `during:` or `pinned:` filters (suggested as you type),
 * and look at the results as Messages, Media, Files or Links. In a server it searches the whole server; in a direct message, that chat.
 */
export function SearchScreen({ channelId }: { channelId: string }) {
  const target = useSearchTarget(channelId);
  const channels = useGuildStore((s) => s.channels);
  const { state, search, more } = useSearch(target);
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [tab, setTab] = useState<SearchTab>('messages');
  const [sort, setSort] = useState<SearchSort>('newest');
  const [focused, setFocused] = useState(true);
  const searchable = target?.mode === 'standard';
  const suggestions = useMemo(() => (focused && target ? suggest(input, target.candidates, 6) : []), [focused, input, target]);
  const filters = useMemo(() => parseQuery(submitted).filters, [submitted]);
  const hits = useMemo(() => hitsOf(state.groups), [state.groups]);

  useEffect(() => {
    void search(tab, submitted, sort);
    // A new tab, query or order searches again; `search` only changes with the target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, submitted, sort]);

  const submit = (text: string) => {
    setFocused(false);
    setInput(text);
    setSubmitted(text.trim());
  };
  const open = (message: Message) => {
    const guildId = channels[message.channel_id]?.guild_id;
    if (message.channel_id === channelId) {
      // The chat this search was opened from is right underneath.
      useReadNavStore.getState().requestJump(channelId, message.id);
      router.back();
    } else openMessage({ guildId, channelId: message.channel_id, messageId: message.id });
  };

  const rows = tab === 'files' ? fileRows(hits) : tab === 'links' ? linkRows(hits) : tab === 'media' ? [] : state.groups;
  const empty = state.status === 'ready' && (tab === 'media' ? mediaTiles(hits).length === 0 : rows.length === 0);
  const header = (
    <View>
      {filters.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {filters.map((f) => (
            <Pressable key={f.raw} accessibilityRole="button" accessibilityLabel={`Remove filter ${f.key}:${f.value}`} onPress={() => submit(withoutFilter(submitted, f))} style={styles.chip}>
              <Text style={styles.chipText}>{`${f.key}:${f.value}`}</Text>
              <Ionicons name="close" size={14} color={theme.muted} />
            </Pressable>
          ))}
        </ScrollView>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {SEARCH_SORTS.map((s) => (
          <Pressable key={s.value} accessibilityRole="radio" accessibilityLabel={`Sort: ${s.label}`} accessibilityState={{ selected: sort === s.value }} onPress={() => setSort(s.value)} style={[styles.chip, sort === s.value && styles.chipOn]}>
            <Text style={styles.chipText}>{s.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {state.status === 'ready' && (
        <Text style={styles.summary}>{`${state.total} ${state.total === 1 ? 'result' : 'results'} in ${target?.guildName ?? target?.channel.name ?? 'this chat'}${state.indexBuilding ? ' (the search index is still being built, so results may be incomplete)' : ''}`}</Text>
      )}
    </View>
  );

  return (
    <View style={styles.screen}>
      <View style={styles.bar}>
        <Ionicons name="search" size={18} color={theme.subtle} />
        <TextInput
          accessibilityLabel="Search messages"
          value={input}
          onChangeText={(text) => {
            setInput(text);
            setFocused(true);
          }}
          onFocus={() => setFocused(true)}
          onSubmitEditing={() => submit(input)}
          returnKeyType="search"
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Search"
          placeholderTextColor={theme.subtle}
          style={styles.input}
        />
        {input !== '' && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            onPress={() => {
              setInput('');
              setSubmitted('');
              setFocused(true);
            }}
            style={styles.clear}
          >
            <Ionicons name="close-circle" size={20} color={theme.subtle} />
          </Pressable>
        )}
      </View>
      {suggestions.length > 0 && (
        <View accessibilityLabel="Search filters" style={styles.suggestions}>
          {suggestions.map((s) => (
            <Pressable key={s.insert} accessibilityRole="button" accessibilityLabel={`Use ${s.label}`} onPress={() => setInput(applySuggestion(input, s))} style={styles.suggestion}>
              <Text style={styles.suggestionLabel}>{s.label}</Text>
              {s.hint ? <Text style={styles.suggestionHint}>{s.hint}</Text> : null}
            </Pressable>
          ))}
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabs}>
        {SEARCH_TABS.map((t) => (
          <Pressable key={t.id} accessibilityRole="tab" accessibilityLabel={t.label} accessibilityState={{ selected: tab === t.id }} onPress={() => setTab(t.id)} style={[styles.tab, tab === t.id && styles.tabOn]}>
            <Text style={[styles.tabText, tab === t.id && styles.tabTextOn]}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {!searchable ? (
        <Notice>{PRIVATE_NOTICE}</Notice>
      ) : state.status === 'idle' && !submitted ? (
        <Notice>{`Type words to find, or narrow it down with ${FILTER_KEYS.map((k) => `${k}:`).join(' ')}`}</Notice>
      ) : state.status === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.muted} />
        </View>
      ) : state.status === 'error' ? (
        <Pressable accessibilityRole="button" onPress={() => void search(tab, submitted, sort)} style={styles.retry}>
          <Text style={styles.retryText}>{`${state.error ?? 'Search failed'} Try again`}</Text>
        </Pressable>
      ) : (
        <FlatList
          key={tab}
          data={tab === 'media' ? [null] : (rows as readonly unknown[])}
          keyExtractor={(row, i) => (row === null ? 'media' : tab === 'messages' ? ((row as Message[]).find((m) => m.hit) ?? (row as Message[])[0])!.id : (row as { key: string }).key + i)}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={header}
          ListEmptyComponent={empty ? <Notice>{`Nothing found${tab === 'messages' ? '' : ` in ${tab}`}.`}</Notice> : undefined}
          ListFooterComponent={state.loadingMore ? <ActivityIndicator color={theme.muted} style={styles.more} /> : undefined}
          onEndReached={() => void more()}
          onEndReachedThreshold={0.5}
          renderItem={({ item }) => {
            if (tab === 'media') return <MediaGrid tiles={mediaTiles(hits)} onOpen={open} />;
            if (tab === 'files') return <FileResult row={item as ReturnType<typeof fileRows>[number]} onOpen={open} />;
            if (tab === 'links') return <LinkResult row={item as ReturnType<typeof linkRows>[number]} onOpen={open} />;
            const group = item as Message[];
            const hit = group.find((m) => m.hit) ?? group[0]!;
            return <MessageHit group={group} terms={state.terms} channelName={target?.channel.guild_id ? (channels[hit.channel_id]?.name ?? undefined) : undefined} onOpen={open} />;
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, margin: 12, paddingLeft: 12, borderRadius: 12, backgroundColor: theme.raised },
  input: { flex: 1, minHeight: 44, color: theme.text, fontSize: 16 },
  clear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  suggestions: { marginHorizontal: 12, marginBottom: 8, borderRadius: 12, backgroundColor: theme.raised, overflow: 'hidden' },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 14 },
  suggestionLabel: { color: theme.text, fontSize: 15, fontWeight: '600' },
  suggestionHint: { color: theme.subtle, fontSize: 13, flexShrink: 1 },
  tabBar: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: theme.hairline },
  tabs: { paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
  tab: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: theme.raised, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: theme.accentSoft, borderWidth: 1, borderColor: theme.accent },
  tabText: { color: theme.muted, fontSize: 14, fontWeight: '600' },
  tabTextOn: { color: theme.text },
  chips: { paddingHorizontal: 12, paddingTop: 8, gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: 22, backgroundColor: theme.accentSoft },
  chipOn: { borderWidth: 1, borderColor: theme.accent },
  chipText: { color: theme.text, fontSize: 14 },
  summary: { color: theme.muted, fontSize: 13, paddingHorizontal: 16, paddingVertical: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  retry: { minHeight: 44, padding: 32, alignItems: 'center' },
  retryText: { color: theme.accent, fontSize: 15, textAlign: 'center' },
  more: { padding: 16 },
});
