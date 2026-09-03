import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ErrorBanner } from '../../src/components/ErrorBanner';
import { SuggestionLines } from '../../src/components/SuggestionLines';
import {
  IngestPrep,
  applyIngestResults,
  processSource,
  runIngestForLog,
  saveSource,
} from '../../src/services/ingestPipeline';
import { getApiKey, getCrossCheckEnabled, loadLLMOpts } from '../../src/secure/apiKey';
import { runDuplicateCheck } from '../../src/llm/duplicates';
import { listPages } from '../../src/db/repositories/pages';
import { getDb } from '../../src/db/client';
import { DuplicateCheckResult, IncomingPage } from '../../src/domain/types';
import { useTheme } from '../../src/theme/ThemeContext';
import type { ThemeColors } from '../../src/theme/theme';
import { toErrorMessage } from '../../src/utils/errors';

const SAVE_BUTTON_LABEL = {
  saving: 'Saving…',
  processing: 'Processing…',
  checking: 'Checking duplicates…',
  saved: 'Saved ✓',
} as const;

export default function AddScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [mode, setMode] = useState<'text' | 'url'>('text');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');
  const [autoProcess, setAutoProcess] = useState(true);
  const [status, setStatus] = useState<null | 'saving' | 'processing' | 'checking' | 'saved'>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState<boolean>(true);
  const [pendingLogId, setPendingLogId] = useState<string | null>(null);
  const [pendingPrep, setPendingPrep] = useState<IngestPrep | null>(null);
  const [checks, setChecks] = useState<DuplicateCheckResult[]>([]);
  const [decisions, setDecisions] = useState<Array<'merge' | 'insert' | 'skip'>>([]);

  useFocusEffect(
    useCallback(() => {
      void getApiKey().then((k) => setHasKey(!!k));
    }, []),
  );
  useEffect(() => {
    if (!hasKey && autoProcess) setAutoProcess(false);
    // We intentionally only force off — user can re-enable after adding a key.
  }, [hasKey, autoProcess]);

  // URL ingest is disabled until we can fetch URL contents reliably (instead
  // of asking the LLM to summarise from training data, which fabricates).
  // The segmented control still shows "URL" but it routes to a Coming-soon
  // panel. canSave is therefore gated on text mode only.
  const canSave =
    mode === 'text' &&
    title.trim().length > 0 &&
    content.trim().length > 0 &&
    status !== 'saving' &&
    status !== 'processing';

  const finishWithSavedReset = () => {
    setStatus('saved');
    setTitle('');
    setContent('');
    setUrl('');
    setTimeout(() => setStatus(null), 1800);
  };

  const applySuggestion = (page: IncomingPage, check: DuplicateCheckResult): IncomingPage => {
    if (!check.suggestion) return page;
    return {
      ...page,
      title: check.suggestion.newTitle ?? page.title,
      body: check.suggestion.newBody ?? page.body,
      facts: check.suggestion.newFacts ?? page.facts,
    };
  };

  const onSave = async () => {
    setError(null);
    try {
      setStatus('saving');
      const entry = await saveSource({
        title: title.trim(),
        kind: mode,
        content: mode === 'text' ? content : null,
        url: mode === 'url' ? url : null,
      });
      if (!autoProcess) {
        finishWithSavedReset();
        return;
      }
      const crossCheckOn = await getCrossCheckEnabled();
      if (!crossCheckOn) {
        setStatus('processing');
        await processSource(entry.id);
        finishWithSavedReset();
        router.push('/browse');
        return;
      }
      setStatus('processing');
      const prep = await runIngestForLog(entry.id);
      setStatus('checking');
      const [llmOpts, allPages] = await Promise.all([loadLLMOpts(), listPages(getDb())]);
      // Per-candidate checks are independent — fire them concurrently so a
      // 5-page ingest doesn't pay 5× the per-call latency in series.
      const results: DuplicateCheckResult[] = await Promise.all(
        prep.incoming.map((p) => runDuplicateCheck(p, allPages, llmOpts)),
      );
      const anyConcern = results.some(
        (r) => r.status === 'duplicate' || r.questions.length > 0 || r.suggestion !== null,
      );
      if (!anyConcern) {
        await applyIngestResults(
          entry.id,
          prep,
          prep.incoming.map((page) => ({ page, skip: false })),
        );
        finishWithSavedReset();
        router.push('/browse');
        return;
      }
      setPendingLogId(entry.id);
      setPendingPrep(prep);
      setChecks(results);
      setDecisions(results.map((r) => (r.status === 'duplicate' ? 'merge' : 'insert')));
      setStatus(null);
    } catch (e) {
      setStatus(null);
      setError(toErrorMessage(e));
    }
  };

  const onConfirmDecisions = async () => {
    if (!pendingPrep || !pendingLogId) return;
    setError(null);
    setStatus('processing');
    try {
      const finalDecisions = pendingPrep.incoming.map((page, i) => {
        const d = decisions[i];
        const check = checks[i];
        if (d === 'skip') return { page, skip: true };
        if (d === 'insert') return { page: applySuggestion(page, check), skip: false };
        return { page, skip: false };
      });
      await applyIngestResults(pendingLogId, pendingPrep, finalDecisions);
      setPendingLogId(null);
      setPendingPrep(null);
      setChecks([]);
      setDecisions([]);
      finishWithSavedReset();
      router.push('/browse');
    } catch (e) {
      setStatus(null);
      setError(toErrorMessage(e));
    }
  };

  const onCancelDecisions = () => {
    setPendingLogId(null);
    setPendingPrep(null);
    setChecks([]);
    setDecisions([]);
    setStatus(null);
  };

  const setDecision = (i: number, d: 'merge' | 'insert' | 'skip') => {
    setDecisions((prev) => prev.map((v, idx) => (idx === i ? d : v)));
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.segment}>
          <Pressable
            onPress={() => setMode('text')}
            style={[styles.segmentBtn, mode === 'text' && styles.segmentBtnActive]}
            accessibilityRole="button"
          >
            <Text style={[styles.segmentText, mode === 'text' && styles.segmentTextActive]}>
              Paste text
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setMode('url')}
            style={[styles.segmentBtn, mode === 'url' && styles.segmentBtnActive]}
            accessibilityRole="button"
          >
            <Text style={[styles.segmentText, mode === 'url' && styles.segmentTextActive]}>
              URL
            </Text>
          </Pressable>
        </View>

        <Text style={styles.label}>Title</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Give this source a short name"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          accessibilityLabel="Title"
        />

        {mode === 'text' ? (
          <>
            <Text style={styles.label}>Content</Text>
            <TextInput
              value={content}
              onChangeText={setContent}
              placeholder="Paste the text you want Claude to ingest…"
              placeholderTextColor={colors.textMuted}
              multiline
              style={[styles.input, styles.textarea]}
              accessibilityLabel="Source content"
            />
            <Text style={styles.hint}>{content.length} characters</Text>
          </>
        ) : (
          <View style={styles.comingSoon}>
            <Text style={styles.comingSoonBadge}>Coming soon</Text>
            <Text style={styles.comingSoonTitle}>URL ingest is temporarily disabled</Text>
            <Text style={styles.comingSoonBody}>
              The previous URL flow asked the LLM to summarise from its training
              data without actually fetching the page, which produced fabricated
              content. We're rebuilding this so URLs are fetched and summarised
              from real text. In the meantime, paste the article text directly.
            </Text>
            <Pressable onPress={() => setMode('text')} style={styles.comingSoonBtn}>
              <Text style={styles.comingSoonBtnText}>Switch to Paste text</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.switchRow}>
          <Switch
            value={autoProcess}
            onValueChange={setAutoProcess}
            disabled={!hasKey}
          />
          <Text style={styles.switchLabel}>Process with Claude immediately</Text>
        </View>

        {!hasKey ? (
          <Pressable
            onPress={() => router.push('/settings')}
            style={styles.keyBanner}
            accessibilityRole="button"
          >
            <Text style={styles.keyBannerText}>
              Add your API key in Settings to enable Claude-powered features.
              You can still save sources for later.
            </Text>
          </Pressable>
        ) : null}

        <ErrorBanner message={error} />

        {pendingPrep ? (
          <View style={styles.dupePanel}>
            <Text style={styles.dupePanelTitle}>Possible duplicates</Text>
            <Text style={styles.dupePanelHint}>
              Pick how to handle each candidate. "Insert as separate" applies the
              AI's suggested clarifier so the new page does not look like a duplicate.
            </Text>
            {pendingPrep.incoming.map((p, i) => {
              const c = checks[i];
              const d = decisions[i];
              return (
                <View key={`${i}-${p.title}`} style={styles.dupeCard}>
                  <Text style={styles.dupeCardTitle}>{p.title}</Text>
                  <Text style={styles.dupeStatus}>
                    {c.status === 'duplicate'
                      ? `Looks like a duplicate of ${c.existingSlug ?? '(unknown)'}`
                      : 'No exact duplicate, but worth a look'}
                  </Text>
                  {c.reason ? <Text style={styles.dupeReason}>{c.reason}</Text> : null}
                  {c.questions.length ? (
                    <View>
                      {c.questions.map((q, qi) => (
                        <Text key={qi} style={styles.dupeQuestion}>• {q}</Text>
                      ))}
                    </View>
                  ) : null}
                  {c.suggestion ? (
                    <View style={styles.dupeSuggestion}>
                      <Text style={styles.dupeSuggestionTitle}>Suggested clarifier:</Text>
                      <SuggestionLines
                        suggestion={c.suggestion}
                        style={styles.dupeSuggestionLine}
                      />
                    </View>
                  ) : null}
                  <View style={styles.btnRow}>
                    <Pressable
                      onPress={() => setDecision(i, 'merge')}
                      style={[styles.dupeBtn, d === 'merge' && styles.dupeBtnActive]}
                    >
                      <Text style={[styles.dupeBtnText, d === 'merge' && styles.dupeBtnTextActive]}>
                        Merge
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setDecision(i, 'insert')}
                      style={[styles.dupeBtn, d === 'insert' && styles.dupeBtnActive]}
                    >
                      <Text style={[styles.dupeBtnText, d === 'insert' && styles.dupeBtnTextActive]}>
                        Insert as separate
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setDecision(i, 'skip')}
                      style={[styles.dupeBtn, d === 'skip' && styles.dupeBtnActive]}
                    >
                      <Text style={[styles.dupeBtnText, d === 'skip' && styles.dupeBtnTextActive]}>
                        Skip
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
            <View style={styles.btnRow}>
              <Pressable onPress={onConfirmDecisions} style={styles.primary}>
                <Text style={styles.primaryText}>Apply decisions</Text>
              </Pressable>
              <Pressable onPress={onCancelDecisions} style={styles.secondary}>
                <Text style={styles.secondaryText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            onPress={onSave}
            disabled={!canSave}
            style={[styles.primary, !canSave && styles.primaryDisabled]}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>
              {status
                ? SAVE_BUTTON_LABEL[status]
                : autoProcess
                  ? 'Save & process'
                  : 'Save source'}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    container: { padding: 16, gap: 8 },
    segment: { flexDirection: 'row', backgroundColor: c.segmentBg, borderRadius: 8, padding: 4 },
    segmentBtn: { flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: 'center' },
    segmentBtnActive: { backgroundColor: c.segmentBtnActiveBg },
    segmentText: { color: c.textMuted, fontWeight: '500' },
    segmentTextActive: { color: c.text },
    label: { fontSize: 13, color: c.textSecondary, marginTop: 10 },
    input: {
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 10,
      backgroundColor: c.inputBg,
      color: c.text,
      fontSize: 15,
    },
    textarea: { minHeight: 160, textAlignVertical: 'top' },
    hint: { fontSize: 12, color: c.textMuted },
    warn: { fontSize: 12, color: c.warnBannerText, marginTop: 4 },
    comingSoon: {
      backgroundColor: c.surface,
      borderColor: c.warnBannerBorder,
      borderWidth: 1,
      borderRadius: 10,
      padding: 14,
      gap: 8,
      marginTop: 8,
    },
    comingSoonBadge: {
      alignSelf: 'flex-start',
      backgroundColor: c.warnBannerBorder,
      color: c.warnBannerText,
      fontSize: 11,
      fontWeight: '700',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 4,
      overflow: 'hidden',
    },
    comingSoonTitle: { fontSize: 16, fontWeight: '700', color: c.text },
    comingSoonBody: { color: c.textSecondary, fontSize: 13, lineHeight: 18 },
    comingSoonBtn: {
      alignSelf: 'flex-start',
      backgroundColor: c.text,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 8,
      marginTop: 4,
    },
    comingSoonBtnText: { color: c.bg, fontWeight: '600' },
    switchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 12 },
    switchLabel: { color: c.textSecondary },
    primary: {
      backgroundColor: c.primary,
      paddingVertical: 14,
      borderRadius: 10,
      alignItems: 'center',
      marginTop: 8,
    },
    primaryDisabled: { backgroundColor: c.primaryDisabled },
    primaryText: { color: c.onPrimary, fontSize: 16, fontWeight: '600' },
    keyBanner: {
      backgroundColor: c.warnBannerBg,
      borderColor: c.warnBannerBorder,
      borderWidth: 1,
      padding: 12,
      borderRadius: 8,
      marginTop: 8,
    },
    keyBannerText: { color: c.warnBannerText, fontSize: 13, lineHeight: 18 },
    btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    secondary: {
      backgroundColor: c.borderSubtle,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 8,
    },
    secondaryText: { color: c.text, fontWeight: '600' },
    dupePanel: {
      backgroundColor: c.surface,
      borderColor: c.warnBannerBorder,
      borderWidth: 1,
      borderRadius: 10,
      padding: 12,
      marginTop: 8,
      gap: 8,
    },
    dupePanelTitle: { fontSize: 16, fontWeight: '700', color: c.text },
    dupePanelHint: { color: c.textMuted, fontSize: 12 },
    dupeCard: {
      backgroundColor: c.bg,
      borderRadius: 8,
      padding: 10,
      gap: 4,
    },
    dupeCardTitle: { fontWeight: '700', color: c.text },
    dupeStatus: { color: c.textSecondary, fontSize: 13 },
    dupeReason: { color: c.textSecondary },
    dupeQuestion: { color: c.textSecondary, fontSize: 13 },
    dupeSuggestion: {
      backgroundColor: c.toneInfoBg,
      borderRadius: 6,
      padding: 8,
      gap: 2,
    },
    dupeSuggestionTitle: { color: c.toneInfoFg, fontWeight: '600' },
    dupeSuggestionLine: { color: c.toneInfoFg, fontSize: 12 },
    dupeBtn: {
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 6,
      backgroundColor: c.surface,
      borderColor: c.border,
      borderWidth: 1,
    },
    dupeBtnActive: { backgroundColor: c.primary, borderColor: c.primary },
    dupeBtnText: { color: c.textSecondary, fontSize: 12, fontWeight: '600' },
    dupeBtnTextActive: { color: c.onPrimary },
  });
