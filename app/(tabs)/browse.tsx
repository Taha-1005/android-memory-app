import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { WikiPage } from '../../src/domain/types';
import { PageCard } from '../../src/components/PageCard';
import { getDb } from '../../src/db/client';
import { listPages, searchPages } from '../../src/db/repositories/pages';
import { useTheme } from '../../src/theme/ThemeContext';
import type { ThemeColors } from '../../src/theme/theme';

export default function BrowseScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [q, setQ] = useState('');
  const [pages, setPages] = useState<WikiPage[]>([]);

  const load = useCallback(async () => {
    const db = getDb();
    const rows = q.trim()
      ? await searchPages(db, q.trim())
      : await listPages(db);
    setPages(rows);
  }, [q]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    const h = setTimeout(() => void load(), 200);
    return () => clearTimeout(h);
  }, [q, load]);

  const grouped = useMemo(() => {
    const entities: WikiPage[] = [];
    const concepts: WikiPage[] = [];
    const sources: WikiPage[] = [];
    for (const p of pages) {
      if (p.kind === 'entity') entities.push(p);
      else if (p.kind === 'concept') concepts.push(p);
      else if (p.kind === 'source') sources.push(p);
    }
    const sections: Array<{ title: string; data: WikiPage[] }> = [];
    if (entities.length) sections.push({ title: 'Entities', data: entities });
    if (concepts.length) sections.push({ title: 'Concepts', data: concepts });
    if (sources.length) sections.push({ title: 'Sources', data: sources });
    return sections;
  }, [pages]);

  const flat: Array<{ type: 'header'; title: string } | { type: 'item'; page: WikiPage }> =
    useMemo(() => {
      const out: Array<{ type: 'header'; title: string } | { type: 'item'; page: WikiPage }> = [];
      for (const s of grouped) {
        out.push({ type: 'header', title: s.title });
        for (const p of s.data) out.push({ type: 'item', page: p });
      }
      return out;
    }, [grouped]);

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search titles, bodies, facts"
          placeholderTextColor={colors.textMuted}
          style={styles.search}
          autoCapitalize="none"
          accessibilityLabel="Search pages"
        />
        {q ? (
          <Text style={styles.count}>
            {pages.length} match{pages.length === 1 ? '' : 'es'}
          </Text>
        ) : null}
      </View>

      {pages.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No pages yet.</Text>
          <Text style={styles.emptySub}>Add and process your first source.</Text>
        </View>
      ) : (
        <FlatList
          data={flat}
          keyExtractor={(x, i) => (x.type === 'header' ? `h-${x.title}` : `p-${x.page.slug}-${i}`)}
          renderItem={({ item }) =>
            item.type === 'header' ? (
              <Text style={styles.section}>{item.title}</Text>
            ) : (
              <PageCard
                page={item.page}
                onPress={(slug) => router.push(`/page/${slug}`)}
              />
            )
          }
          contentContainerStyle={{ padding: 12 }}
        />
      )}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    searchWrap: { padding: 12, borderBottomColor: c.borderSubtle, borderBottomWidth: 1 },
    search: {
      backgroundColor: c.inputBg,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 10,
      color: c.text,
    },
    count: { marginTop: 4, color: c.textMuted, fontSize: 12 },
    section: {
      paddingHorizontal: 4,
      marginTop: 12,
      marginBottom: 4,
      fontSize: 12,
      fontWeight: '700',
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    emptyTitle: { fontSize: 18, fontWeight: '600', color: c.text },
    emptySub: { marginTop: 4, color: c.textMuted, textAlign: 'center' },
  });
