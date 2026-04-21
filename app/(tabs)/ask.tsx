import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ErrorBanner } from '../../src/components/ErrorBanner';
import { ConfidenceBadge } from '../../src/components/ConfidenceBadge';
import { WikiBody } from '../../src/components/WikiBody';
import { getDb } from '../../src/db/client';
import { listPages } from '../../src/db/repositories/pages';
import { rankPagesForQuery } from '../../src/domain/rankPages';
import { runQuery } from '../../src/llm/query';
import { getApiKey, getModel } from '../../src/secure/apiKey';
import { QueryResult } from '../../src/domain/types';
import { fileAnswerAsPage } from '../../src/services/ingestPipeline';

export default function AskScreen(): JSX.Element {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [consulted, setConsulted] = useState(0);

  const [fileTitle, setFileTitle] = useState('');
  const [fileKind, setFileKind] = useState<'concept' | 'entity'>('concept');
  const [filedSlug, setFiledSlug] = useState<string | null>(null);

  const onAsk = async () => {
    setError(null);
    setResult(null);
    setFiledSlug(null);
    setLoading(true);
    try {
      const apiKey = await getApiKey();
      if (!apiKey) throw new Error('Add your API key in Settings first.');
      const model = await getModel();
      const db = getDb();
      const all = await listPages(db);
      const top = rankPagesForQuery(q, all, 8);
      setConsulted(top.length);
      if (top.length === 0) {
        setResult({
          answer: 'No pages in your wiki match this question. Try adding a source first.',
          cited: [],
          confidence: 'low',
        });
        return;
      }
      const res = await runQuery(q, top, { apiKey, model });
      setResult(res);
      setFileTitle(q.replace(/\?+$/, '').trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const onFile = async () => {
    if (!result) return;
    try {
      const page = await fileAnswerAsPage({
        title: fileTitle,
        kind: fileKind,
        body: result.answer,
        cited: result.cited,
      });
      setFiledSlug(page.slug);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <Text style={styles.label}>Ask your wiki</Text>
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="What does my wiki say about…?"
        multiline
        style={styles.input}
        accessibilityLabel="Question"
      />
      <Pressable
        onPress={onAsk}
        disabled={loading || q.trim().length === 0}
        style={[styles.primary, (loading || !q.trim()) && styles.primaryDisabled]}
        accessibilityRole="button"
      >
        <Text style={styles.primaryText}>{loading ? 'Thinking…' : 'Ask'}</Text>
      </Pressable>

      {loading ? <ActivityIndicator style={{ marginTop: 16 }} /> : null}
      <ErrorBanner message={error} />

      {result ? (
        <View style={styles.resultCard}>
          <View style={styles.row}>
            <ConfidenceBadge confidence={result.confidence} />
            <Text style={styles.meta}>{consulted} pages consulted</Text>
          </View>
          <WikiBody
            text={result.answer}
            onOpen={(slug) => router.push(`/page/${slug}`)}
            style={{ marginTop: 8 }}
          />
          {result.cited.length ? (
            <View style={styles.citedWrap}>
              <Text style={styles.citedTitle}>Cited pages</Text>
              <View style={styles.citedRow}>
                {result.cited.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => router.push(`/page/${c.toLowerCase().replace(/\s+/g, '-')}`)}
                    style={styles.pill}
                  >
                    <Text style={styles.pillText}>{c}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.fileBackCard}>
            <Text style={styles.fileBackTitle}>File this answer as a page?</Text>
            <Text style={styles.fileBackWarn}>
              LLMs make mistakes. Review before filing.
            </Text>
            <TextInput
              value={fileTitle}
              onChangeText={setFileTitle}
              style={styles.input}
              placeholder="Page title"
              accessibilityLabel="Page title"
            />
            <View style={styles.kindRow}>
              {(['concept', 'entity'] as const).map((k) => (
                <Pressable
                  key={k}
                  onPress={() => setFileKind(k)}
                  style={[styles.kindBtn, fileKind === k && styles.kindBtnActive]}
                >
                  <Text style={[styles.kindText, fileKind === k && styles.kindTextActive]}>
                    {k}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={onFile} style={styles.secondary}>
              <Text style={styles.secondaryText}>Confirm &amp; file</Text>
            </Pressable>
            {filedSlug ? (
              <View style={styles.successCard}>
                <Text style={styles.successText}>Filed.</Text>
                <Pressable onPress={() => router.push(`/page/${filedSlug}`)}>
                  <Text style={styles.successLink}>Open</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f9fafb' },
  container: { padding: 16, gap: 8 },
  label: { color: '#374151', marginBottom: 4 },
  input: {
    borderColor: '#d1d5db',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#fff',
    fontSize: 15,
    minHeight: 48,
    textAlignVertical: 'top',
  },
  primary: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryDisabled: { backgroundColor: '#93c5fd' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  resultCard: { marginTop: 16, backgroundColor: '#fff', padding: 14, borderRadius: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  meta: { color: '#6b7280', fontSize: 12 },
  citedWrap: { marginTop: 12 },
  citedTitle: { fontWeight: '600', color: '#111827', marginBottom: 6 },
  citedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pillText: { color: '#1e40af', fontSize: 12 },
  fileBackCard: {
    backgroundColor: '#fef3c7',
    borderColor: '#fde68a',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 16,
    gap: 6,
  },
  fileBackTitle: { fontWeight: '600', color: '#78350f' },
  fileBackWarn: { color: '#92400e', fontSize: 12 },
  kindRow: { flexDirection: 'row', gap: 6 },
  kindBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderColor: '#d1d5db',
    borderWidth: 1,
  },
  kindBtnActive: { backgroundColor: '#92400e', borderColor: '#92400e' },
  kindText: { color: '#374151', textTransform: 'capitalize' },
  kindTextActive: { color: '#fff' },
  secondary: {
    backgroundColor: '#111827',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 6,
  },
  secondaryText: { color: '#fff', fontWeight: '600' },
  successCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#d1fae5',
    padding: 8,
    borderRadius: 6,
    marginTop: 6,
  },
  successText: { color: '#065f46', fontWeight: '600' },
  successLink: { color: '#065f46', textDecorationLine: 'underline' },
});
