import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { ErrorBanner } from '../src/components/ErrorBanner';
import { clearApiKey, getApiKey, getModel, maskKey, setApiKey, setModel } from '../src/secure/apiKey';
import { probeApiKey } from '../src/llm/client';
import { applyImport, buildExport, parseImport } from '../src/services/exportImport';
import { getDb } from '../src/db/client';
import { listPages, deletePage, upsertPage, getPage } from '../src/db/repositories/pages';
import { computeLint } from '../src/domain/lint';
import { WikiPage } from '../src/domain/types';
import { runMerge } from '../src/llm/merge';
import { mergePage } from '../src/domain/mergePage';
import { slugify } from '../src/domain/slugify';

export default function SettingsScreen(): JSX.Element {
  const router = useRouter();
  const [key, setKey] = useState<string | null>(null);
  const [newKey, setNewKey] = useState('');
  const [model, setModelLocal] = useState('claude-sonnet-4-20250514');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lint, setLint] = useState<ReturnType<typeof computeLint> | null>(null);
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [importText, setImportText] = useState('');

  const refresh = useCallback(async () => {
    setKey(await getApiKey());
    setModelLocal(await getModel());
    const db = getDb();
    const all = await listPages(db);
    setPages(all);
    setLint(computeLint(all));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onReplaceKey = async () => {
    setError(null);
    if (newKey.trim().length < 10) {
      setError('Key looks too short.');
      return;
    }
    setBusy(true);
    try {
      const r = await probeApiKey(newKey.trim());
      if (!r.ok) throw new Error(r.message);
      await setApiKey(newKey.trim());
      setNewKey('');
      setStatus('Key saved.');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onRemoveKey = async () => {
    await clearApiKey();
    setStatus('Key removed.');
    await refresh();
  };

  const onTest = async () => {
    setError(null);
    setStatus(null);
    if (!key) {
      setError('No key set.');
      return;
    }
    setBusy(true);
    const r = await probeApiKey(key);
    setBusy(false);
    setStatus(r.ok ? 'Connection OK.' : null);
    if (!r.ok) setError(r.message);
  };

  const onChangeModel = async (m: string) => {
    setModelLocal(m);
    await setModel(m);
  };

  const onExport = async () => {
    const state = await buildExport();
    const json = JSON.stringify(state, null, 2);
    await Clipboard.setStringAsync(json);
    setStatus(`Exported ${state.pages.length} pages to clipboard.`);
  };

  const onImport = async () => {
    setError(null);
    try {
      const parsed = parseImport(importText);
      const res = await applyImport(parsed);
      setStatus(`Imported. Wiki now has ${res.pages} pages.`);
      setImportText('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onMergeDupes = async (group: WikiPage[]) => {
    if (!key) {
      setError('API key required to merge with Claude.');
      return;
    }
    if (group.length < 2) return;
    setBusy(true);
    try {
      const db = getDb();
      // Iteratively fold the group down to a single page: merge(a, b) -> ab,
      // then merge(ab, c) -> abc, and so on. A group of 2 reduces to one call;
      // a group of N reduces to N-1 calls. This prevents data loss when the
      // same topic has three or more duplicate pages.
      let current: WikiPage = group[0];
      for (let i = 1; i < group.length; i++) {
        const incoming = await runMerge(current, group[i], { apiKey: key, model });
        // Re-read in case a concurrent edit landed on the target slug.
        const existing = await getPage(db, slugify(incoming.title));
        current = mergePage(existing, incoming, null);
        await upsertPage(db, current);
      }
      // Delete any original group member whose slug is not the final merged slug.
      for (const p of group) {
        if (p.slug !== current.slug) await deletePage(db, p.slug);
      }
      setStatus(`Merged ${group.length} pages into ${current.title}.`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onDeleteOrphan = (p: WikiPage) => {
    Alert.alert('Delete orphan?', `Remove "${p.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const db = getDb();
          await deletePage(db, p.slug);
          await refresh();
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <Text style={styles.h1}>API key</Text>
      <Text style={styles.mono}>{maskKey(key)}</Text>
      <TextInput
        value={newKey}
        onChangeText={setNewKey}
        placeholder="Replace with new sk-ant-…"
        secureTextEntry
        autoCapitalize="none"
        style={styles.input}
      />
      <View style={styles.btnRow}>
        <Pressable onPress={onReplaceKey} style={styles.primary} disabled={busy}>
          <Text style={styles.primaryText}>Replace</Text>
        </Pressable>
        <Pressable onPress={onTest} style={styles.secondary} disabled={busy}>
          <Text style={styles.secondaryText}>Test</Text>
        </Pressable>
        <Pressable onPress={onRemoveKey} style={styles.secondary} disabled={busy}>
          <Text style={styles.secondaryText}>Remove</Text>
        </Pressable>
      </View>
      {busy ? <ActivityIndicator style={{ marginTop: 6 }} /> : null}
      {status ? <Text style={styles.ok}>{status}</Text> : null}
      <ErrorBanner message={error} />

      <Text style={styles.h1}>Model</Text>
      <TextInput
        value={model}
        onChangeText={onChangeModel}
        autoCapitalize="none"
        style={styles.input}
      />
      <Text style={styles.hint}>Defaults to claude-sonnet-4-20250514.</Text>

      <Text style={styles.h1}>Export / Import</Text>
      <Pressable onPress={onExport} style={styles.exportCard}>
        <Text style={styles.exportTitle}>Copy wiki as JSON</Text>
        <Text style={styles.exportSub}>Your only backup. No cloud sync.</Text>
      </Pressable>
      <TextInput
        value={importText}
        onChangeText={setImportText}
        placeholder="Paste exported JSON here…"
        multiline
        style={[styles.input, { minHeight: 100 }]}
      />
      <Pressable onPress={onImport} style={styles.secondary} disabled={!importText.trim()}>
        <Text style={styles.secondaryText}>Import (merge)</Text>
      </Pressable>

      <Text style={styles.h1}>Health</Text>
      <View style={styles.grid}>
        <StatCell label="Pages" value={pages.length} warn={false} />
        <StatCell label="Orphans" value={lint?.orphans.length ?? 0} warn={(lint?.orphans.length ?? 0) > 0} />
        <StatCell label="Thin" value={lint?.thin.length ?? 0} warn={(lint?.thin.length ?? 0) > 0} />
        <StatCell label="Dupes" value={lint?.duplicateGroups.length ?? 0} warn={(lint?.duplicateGroups.length ?? 0) > 0} />
      </View>

      {lint?.duplicateGroups.length ? (
        <>
          <Text style={styles.h2}>Duplicate candidates</Text>
          {lint.duplicateGroups.map((g, i) => (
            <View key={i} style={styles.card}>
              {g.map((p) => (
                <Text key={p.slug} style={styles.dupItem}>• {p.title}</Text>
              ))}
              <Pressable onPress={() => onMergeDupes(g)} style={styles.primary}>
                <Text style={styles.primaryText}>Merge with Claude</Text>
              </Pressable>
            </View>
          ))}
        </>
      ) : null}

      {lint?.orphans.length ? (
        <>
          <Text style={styles.h2}>Orphaned pages</Text>
          {lint.orphans.map((p) => (
            <View key={p.slug} style={styles.orphanRow}>
              <Pressable onPress={() => router.push(`/page/${p.slug}`)} style={{ flex: 1 }}>
                <Text style={styles.link}>{p.title}</Text>
              </Pressable>
              <Pressable onPress={() => onDeleteOrphan(p)}>
                <Text style={styles.dangerLink}>Delete</Text>
              </Pressable>
            </View>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

function StatCell({ label, value, warn }: { label: string; value: number; warn: boolean }): JSX.Element {
  return (
    <View style={[styles.stat, warn && styles.statWarn]}>
      <Text style={[styles.statValue, warn && styles.statValueWarn]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f9fafb' },
  container: { padding: 16, gap: 8 },
  h1: { fontSize: 18, fontWeight: '700', color: '#111827', marginTop: 16 },
  h2: { fontSize: 15, fontWeight: '700', color: '#111827', marginTop: 12 },
  mono: { fontFamily: 'Menlo', color: '#374151' },
  input: {
    borderColor: '#d1d5db',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#fff',
    textAlignVertical: 'top',
  },
  btnRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  primary: {
    backgroundColor: '#2563eb',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  primaryText: { color: '#fff', fontWeight: '600' },
  secondary: {
    backgroundColor: '#e5e7eb',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  secondaryText: { color: '#111827', fontWeight: '600' },
  ok: { color: '#065f46', marginTop: 4 },
  hint: { color: '#6b7280', fontSize: 12 },
  exportCard: {
    backgroundColor: '#2563eb',
    padding: 14,
    borderRadius: 10,
    marginVertical: 6,
  },
  exportTitle: { color: '#fff', fontWeight: '700', fontSize: 16 },
  exportSub: { color: '#dbeafe', marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stat: {
    flexGrow: 1,
    minWidth: '45%',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  statWarn: { backgroundColor: '#fef3c7' },
  statValue: { fontSize: 22, fontWeight: '700', color: '#111827' },
  statValueWarn: { color: '#92400e' },
  statLabel: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  card: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginTop: 6,
    gap: 4,
  },
  dupItem: { color: '#374151' },
  orphanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomColor: '#e5e7eb',
    borderBottomWidth: 1,
  },
  link: { color: '#2563eb' },
  dangerLink: { color: '#b91c1c' },
});
