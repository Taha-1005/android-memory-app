import React, { useCallback, useMemo, useState } from 'react';
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
import { useTheme } from '../../src/theme/ThemeContext';
import type { ThemeColors } from '../../src/theme/theme';
import { toErrorMessage } from '../../src/utils/errors';

export default function LogScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
      Alert.alert('Processing failed', toErrorMessage(e));
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
            // Three deletes target different tables/rows — fire concurrently.
            await Promise.all([
              deleteLog(db, entry.id),
              deletePage(db, entry.slug),
              deleteLogBySlug(db, entry.slug),
            ]);
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
                    <LinkIcon size={18} color={colors.textSecondary} />
                  ) : (
                    <FileText size={18} color={colors.textSecondary} />
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
                    <RefreshCw
                      size={18}
                      color={item.processing ? colors.textMuted : colors.primary}
                    />
                  </Pressable>
                  <Pressable
                    onPress={() => onDelete(item)}
                    accessibilityLabel="Delete"
                    style={styles.actionBtn}
                  >
                    <Trash2 size={18} color={colors.textMuted} />
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

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    count: { padding: 12, color: c.textMuted },
    empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyTitle: { color: c.textMuted },
    card: {
      backgroundColor: c.surface,
      borderRadius: 10,
      padding: 12,
      marginVertical: 4,
      borderColor: c.borderSubtle,
      borderWidth: 1,
    },
    rowTop: { flexDirection: 'row', gap: 10 },
    iconCol: { width: 22, alignItems: 'center', paddingTop: 2 },
    main: { flex: 1, gap: 2 },
    title: { fontSize: 15, fontWeight: '600', color: c.text },
    sub: { fontSize: 12, color: c.textMuted },
    metaRow: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 4 },
    meta: { fontSize: 11, color: c.textMuted },
    actions: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
    actionBtn: { padding: 6 },
    errCard: {
      backgroundColor: c.errBannerBg,
      padding: 8,
      marginTop: 6,
      borderRadius: 6,
    },
    errText: { color: c.errBannerText, fontSize: 12 },
  });
