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

export default function BrowseScreen(): React.JSX.Element {
  const router = useRouter();
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
    const entities = pages.filter((p) => p.kind === 'entity');
    const concepts = pages.filter((p) => p.kind === 'concept');
    const sources = pages.filter((p) => p.kind === 'source');
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  searchWrap: { padding: 12, borderBottomColor: '#e5e7eb', borderBottomWidth: 1 },
  search: {
    backgroundColor: '#fff',
    borderColor: '#d1d5db',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  count: { marginTop: 4, color: '#6b7280', fontSize: 12 },
  section: {
    paddingHorizontal: 4,
    marginTop: 12,
    marginBottom: 4,
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#111827' },
  emptySub: { marginTop: 4, color: '#6b7280', textAlign: 'center' },
});
