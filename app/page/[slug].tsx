import React, { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { WikiBody } from '../../src/components/WikiBody';
import { StatusPill } from '../../src/components/StatusPill';
import { WikiPage } from '../../src/domain/types';
import { getDb } from '../../src/db/client';
import { deletePage, getPage, listPages, upsertPage } from '../../src/db/repositories/pages';
import { deleteLogBySlug } from '../../src/db/repositories/sourceLog';
import { computeBacklinks } from '../../src/domain/backlinks';
import { slugify } from '../../src/domain/slugify';
import { nowIso, formatRelative } from '../../src/utils/time';

export default function PageScreen(): React.JSX.Element {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const [page, setPage] = useState<WikiPage | null>(null);
  const [backlinks, setBacklinks] = useState<WikiPage[]>([]);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState('');

  const load = useCallback(async () => {
    if (!slug) return;
    const db = getDb();
    const p = await getPage(db, slug);
    setPage(p);
    if (p) {
      const all = await listPages(db);
      setBacklinks(computeBacklinks(p, all));
    }
  }, [slug]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!page) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Page not found.</Text>
      </View>
    );
  }

  const onEdit = () => {
    setEditBody(page.body);
    setEditing(true);
  };

  const onSave = async () => {
    const db = getDb();
    const updated: WikiPage = {
      ...page,
      body: editBody,
      userEdited: true,
      updatedAt: nowIso(),
    };
    await upsertPage(db, updated);
    setPage(updated);
    setEditing(false);
  };

  const onDelete = () => {
    Alert.alert(
      'Delete page?',
      `This removes "${page.title}". Backlinks will break.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const db = getDb();
            await deletePage(db, page.slug);
            await deleteLogBySlug(db, page.slug);
            router.back();
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{page.title}</Text>
        <StatusPill
          label={page.kind}
          tone={page.kind === 'entity' ? 'info' : page.kind === 'concept' ? 'ok' : 'warn'}
        />
      </View>
      <Text style={styles.meta}>
        Updated {formatRelative(page.updatedAt)}
        {page.userEdited ? ' • edited' : ''}
        {page.filedFromQuery ? ' • filed from query' : ''}
      </Text>

      <View style={styles.card}>
        {editing ? (
          <>
            <TextInput
              value={editBody}
              onChangeText={setEditBody}
              multiline
              style={[styles.input, { minHeight: 200 }]}
              accessibilityLabel="Edit body"
            />
            <View style={styles.btnRow}>
              <Pressable onPress={onSave} style={styles.primary}>
                <Text style={styles.primaryText}>Save</Text>
              </Pressable>
              <Pressable onPress={() => setEditing(false)} style={styles.secondary}>
                <Text style={styles.secondaryText}>Cancel</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <WikiBody
              text={page.body}
              onOpen={(s) => router.push(`/page/${s}`)}
            />
            <View style={styles.linkRow}>
              <Pressable onPress={onEdit}>
                <Text style={styles.link}>Edit</Text>
              </Pressable>
              <Pressable onPress={onDelete}>
                <Text style={[styles.link, { color: '#b91c1c' }]}>Delete</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>

      {page.facts.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Facts</Text>
          {page.facts.map((f, i) => (
            <Text key={i} style={styles.fact}>
              • {f}
            </Text>
          ))}
        </View>
      ) : null}

      {page.links.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Links</Text>
          <View style={styles.pillRow}>
            {page.links.map((l) => (
              <Pressable
                key={l}
                onPress={() => router.push(`/page/${slugify(l)}`)}
                style={styles.pill}
              >
                <Text style={styles.pillText}>{l}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {backlinks.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Referenced by</Text>
          <View style={styles.pillRow}>
            {backlinks.map((b) => (
              <Pressable
                key={b.slug}
                onPress={() => router.push(`/page/${b.slug}`)}
                style={styles.pill}
              >
                <Text style={styles.pillText}>{b.title}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f9fafb' },
  container: { padding: 16, gap: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { color: '#6b7280' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700', color: '#111827', flex: 1 },
  meta: { color: '#6b7280', fontSize: 12, marginBottom: 4 },
  card: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    borderColor: '#e5e7eb',
    borderWidth: 1,
  },
  sectionTitle: { fontWeight: '600', color: '#111827', marginBottom: 6 },
  fact: { color: '#374151', marginTop: 2 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pillText: { color: '#1e40af', fontSize: 12 },
  input: {
    borderColor: '#d1d5db',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#fff',
    textAlignVertical: 'top',
  },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  primary: {
    backgroundColor: '#2563eb',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  primaryText: { color: '#fff', fontWeight: '600' },
  secondary: {
    backgroundColor: '#e5e7eb',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  secondaryText: { color: '#111827', fontWeight: '600' },
  linkRow: { flexDirection: 'row', gap: 14, marginTop: 10 },
  link: { color: '#2563eb', fontWeight: '500' },
});
