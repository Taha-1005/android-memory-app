import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { RefreshCw, Trash2, FileText, Link as LinkIcon } from 'lucide-react-native';
import { StatusPill } from '../../src/components/StatusPill';
import { SourceLogEntry } from '../../src/domain/types';
import { getDb } from '../../src/db/client';
import {
  deleteLog,
  deleteLogBySlug,
  listLog,
} from '../../src/db/repositories/sourceLog';
import { deletePage } from '../../src/db/repositories/pages';
import { formatRelative } from '../../src/utils/time';
import { processSource } from '../../src/services/ingestPipeline';

export default function LogScreen(): JSX.Element {
  const [items, setItems] = useState<SourceLogEntry[]>([]);

  const load = useCallback(async () => {
    const db = getDb();
    setItems(await listLog(db));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onReprocess = async (id: string) => {
    try {
      await processSource(id);
      await load();
    } catch (e) {
      Alert.alert('Processing failed', e instanceof Error ? e.message : String(e));
      await load();
    }
  };

  const onDelete = (entry: SourceLogEntry) => {
    Alert.alert(
      'Delete source?',
      `This removes "${entry.title}" and its source page. Backlinks from other pages will break.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const db = getDb();
            await deleteLog(db, entry.id);
            await deletePage(db, entry.slug);
            await deleteLogBySlug(db, entry.slug);
            await load();
          },
        },
      ],
    );
  };

  const statusPill = (e: SourceLogEntry) => {
    if (e.error) return <StatusPill label="error" tone="err" />;
    if (e.processing) return <StatusPill label="processing" tone="info" />;
    if (e.processed) return <StatusPill label="processed" tone="ok" />;
    return <StatusPill label="raw" tone="neutral" />;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.count}>
        {items.length} source{items.length === 1 ? '' : 's'}
      </Text>
      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No sources logged yet.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(e) => e.id}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.rowTop}>
                <View style={styles.iconCol}>
                  {item.kind === 'url' ? (
                    <LinkIcon size={18} color="#374151" />
                  ) : (
                    <FileText size={18} color="#374151" />
                  )}
                </View>
                <View style={styles.main}>
                  <Text style={styles.title} numberOfLines={1}>
                    {item.title}
                  </Text>
                  {item.url ? (
                    <Text style={styles.sub} numberOfLines={1}>
                      {item.url}
                    </Text>
                  ) : (
                    <Text style={styles.sub} numberOfLines={2}>
                      {item.content ?? ''}
                    </Text>
                  )}
                  <View style={styles.metaRow}>
                    {statusPill(item)}
                    <Text style={styles.meta}>
                      {formatRelative(item.timestamp)}
                      {item.pagesCreated ? ` • ${item.pagesCreated} pages` : ''}
                    </Text>
                  </View>
                  {item.error ? (
                    <View style={styles.errCard}>
                      <Text style={styles.errText}>{item.error}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.actions}>
                  <Pressable
                    onPress={() => onReprocess(item.id)}
                    disabled={item.processing}
                    accessibilityLabel="Reprocess"
                    style={styles.actionBtn}
                  >
                    <RefreshCw size={18} color={item.processing ? '#9ca3af' : '#2563eb'} />
                  </Pressable>
                  <Pressable
                    onPress={() => onDelete(item)}
                    accessibilityLabel="Delete"
                    style={styles.actionBtn}
                  >
                    <Trash2 size={18} color="#6b7280" />
                  </Pressable>
                </View>
              </View>
            </View>
          )}
          contentContainerStyle={{ padding: 12 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  count: { padding: 12, color: '#6b7280' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyTitle: { color: '#6b7280' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginVertical: 4,
    borderColor: '#e5e7eb',
    borderWidth: 1,
  },
  rowTop: { flexDirection: 'row', gap: 10 },
  iconCol: { width: 22, alignItems: 'center', paddingTop: 2 },
  main: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '600', color: '#111827' },
  sub: { fontSize: 12, color: '#6b7280' },
  metaRow: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 4 },
  meta: { fontSize: 11, color: '#6b7280' },
  actions: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  actionBtn: { padding: 6 },
  errCard: {
    backgroundColor: '#fee2e2',
    padding: 8,
    marginTop: 6,
    borderRadius: 6,
  },
  errText: { color: '#991b1b', fontSize: 12 },
});
