import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { ErrorBanner } from '../src/components/ErrorBanner';
import {
  clearApiKeyFor,
  getApiKeyFor,
  getCrossCheckEnabled,
  getModelFor,
  getProvider,
  maskKey,
  setApiKeyFor,
  setCrossCheckEnabled,
  setModelFor,
  setProvider,
} from '../src/secure/apiKey';
import { DEFAULT_ANTHROPIC_MODEL, probeProviderKey, defaultModelFor, Provider } from '../src/llm/provider';
import {
  PROVIDER_KEY_HINT,
  PROVIDER_KEY_URL,
  PROVIDER_LABEL,
} from '../src/llm/providerInfo';
import { FREE_GEMINI_MODELS } from '../src/llm/geminiClient';
import { applyImport, buildExport, parseImport } from '../src/services/exportImport';
import { getDb } from '../src/db/client';
import { listPages, deletePage, upsertPage, getPage } from '../src/db/repositories/pages';
import { computeLint } from '../src/domain/lint';
import {
  ChatTurn,
  DuplicateGroup,
  DuplicateScanReport,
  WikiPage,
} from '../src/domain/types';
import { runMerge } from '../src/llm/merge';
import {
  maybeCompressHistory,
  runDuplicateChat,
  runDuplicateScan,
} from '../src/llm/duplicates';
import { mergePage } from '../src/domain/mergePage';
import { slugify } from '../src/domain/slugify';
import { planRename } from '../src/domain/renamePage';
import { useTheme } from '../src/theme/ThemeContext';
import type { ThemeColors, ThemePreference } from '../src/theme/theme';
import { UpdatesPanel } from '../src/components/UpdatesPanel';
import { toErrorMessage } from '../src/utils/errors';

const APPEARANCE_LABEL: Record<ThemePreference, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

export default function SettingsScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors, preference, setPreference } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [provider, setProviderLocal] = useState<Provider>('anthropic');
  const [key, setKey] = useState<string | null>(null);
  const [newKey, setNewKey] = useState('');
  const [model, setModelLocal] = useState(DEFAULT_ANTHROPIC_MODEL);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lint, setLint] = useState<ReturnType<typeof computeLint> | null>(null);
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [importText, setImportText] = useState('');
  const [crossCheck, setCrossCheck] = useState(false);
  const [scanReport, setScanReport] = useState<DuplicateScanReport | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);

  const refresh = useCallback(async () => {
    const p = await getProvider();
    setProviderLocal(p);
    setKey(await getApiKeyFor(p));
    setModelLocal(await getModelFor(p));
    setCrossCheck(await getCrossCheckEnabled());
    const db = getDb();
    const all = await listPages(db);
    setPages(all);
    setLint(computeLint(all));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onSwitchProvider = async (p: Provider) => {
    if (p === provider) return;
    setError(null);
    setStatus(null);
    await setProvider(p);
    await refresh();
  };

  const onReplaceKey = async () => {
    setError(null);
    if (newKey.trim().length < 10) {
      setError('Key looks too short.');
      return;
    }
    setBusy(true);
    try {
      const r = await probeProviderKey(provider, newKey.trim(), { model });
      if (!r.ok) throw new Error(r.message);
      await setApiKeyFor(provider, newKey.trim());
      setNewKey('');
      setStatus('Key saved.');
      await refresh();
    } catch (e) {
      setError(toErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onRemoveKey = async () => {
    await clearApiKeyFor(provider);
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
    const r = await probeProviderKey(provider, key, { model });
    setBusy(false);
    setStatus(r.ok ? 'Connection OK.' : null);
    if (!r.ok) setError(r.message);
  };

  const onChangeModel = async (m: string) => {
    setModelLocal(m);
    await setModelFor(provider, m);
  };

  const onResetModel = async () => {
    const d = defaultModelFor(provider);
    setModelLocal(d);
    await setModelFor(provider, d);
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
      setError(toErrorMessage(e));
    }
  };

  const onAiScan = async () => {
    setError(null);
    setStatus(null);
    if (!key) {
      setError(`API key required for ${PROVIDER_LABEL[provider]} to scan for duplicates.`);
      return;
    }
    setScanBusy(true);
    try {
      const report = await runDuplicateScan(pages, { provider, apiKey: key, model });
      setScanReport(report);
      setChatHistory([]);
      setStatus(
        report.groups.length
          ? `AI flagged ${report.groups.length} duplicate group${report.groups.length === 1 ? '' : 's'}.`
          : 'AI found no duplicates.',
      );
    } catch (e) {
      setError(toErrorMessage(e));
    } finally {
      setScanBusy(false);
    }
  };

  const onMergeGroup = async (group: DuplicateGroup) => {
    if (!key) {
      setError(`API key required for ${PROVIDER_LABEL[provider]} to run merge.`);
      return;
    }
    const db = getDb();
    // Resolve the group's pages concurrently — each getPage is an independent
    // round-trip; the previous serial loop paid N× latency for nothing.
    const resolved = (await Promise.all(group.slugs.map((slug) => getPage(db, slug))))
      .filter((p): p is WikiPage => p !== null);
    if (resolved.length < 2) {
      setError('Merge needs at least two existing pages.');
      return;
    }
    setBusy(true);
    try {
      let current: WikiPage = resolved[0];
      for (let i = 1; i < resolved.length; i++) {
        const incoming = await runMerge(current, resolved[i], { provider, apiKey: key, model });
        const existing = await getPage(db, slugify(incoming.title));
        current = mergePage(existing, incoming, null);
        await upsertPage(db, current);
      }
      for (const p of resolved) {
        if (p.slug !== current.slug) await deletePage(db, p.slug);
      }
      setStatus(`Merged ${resolved.length} pages into ${current.title}.`);
      setScanReport((prev) =>
        prev ? { ...prev, groups: prev.groups.filter((g) => g !== group) } : prev,
      );
      await refresh();
    } catch (e) {
      setError(toErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onApplyDisambiguation = async (group: DuplicateGroup) => {
    if (!group.suggestions.length) {
      setError('No suggested edits in this group.');
      return;
    }
    const db = getDb();
    setBusy(true);
    try {
      // `others` doesn't depend on the loop variable — load once, reuse.
      const others = await listPages(db);
      let applied = 0;
      for (const sug of group.suggestions) {
        const existing = await getPage(db, sug.slug);
        if (!existing) continue;
        const newTitle = sug.newTitle?.trim() || existing.title;
        const newSlug = slugify(newTitle);
        const collision =
          newSlug !== existing.slug ? await getPage(db, newSlug) : null;
        try {
          const plan = planRename(
            existing,
            { newTitle, newBody: sug.newBody, newFacts: sug.newFacts },
            others,
            collision,
          );
          await upsertPage(db, plan.renamed);
          if (plan.slugChanged) await deletePage(db, existing.slug);
          for (const ref of plan.rewrittenReferers) await upsertPage(db, ref);
          applied++;
        } catch (e) {
          setError(toErrorMessage(e));
        }
      }
      setStatus(`Applied disambiguation to ${applied} page${applied === 1 ? '' : 's'}.`);
      setScanReport((prev) =>
        prev ? { ...prev, groups: prev.groups.filter((g) => g !== group) } : prev,
      );
      await refresh();
    } catch (e) {
      setError(toErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onIgnoreGroup = (group: DuplicateGroup) => {
    setScanReport((prev) =>
      prev ? { ...prev, groups: prev.groups.filter((g) => g !== group) } : prev,
    );
  };

  const onSendChat = async () => {
    const trimmed = chatInput.trim();
    if (!trimmed || !scanReport) return;
    if (!key) {
      setError(`API key required for ${PROVIDER_LABEL[provider]}.`);
      return;
    }
    setChatBusy(true);
    setChatInput('');
    // Compress the PRIOR history (without the new user turn), then append the
    // user turn once. Without this split the latest message would appear both
    // in the transcript AND in any summary that compression produced.
    const userTurn: ChatTurn = { role: 'user', content: trimmed };
    try {
      const compressed = await maybeCompressHistory(chatHistory, {
        provider,
        apiKey: key,
        model,
      });
      const historyForCall: ChatTurn[] = [...compressed, userTurn];
      setChatHistory(historyForCall);
      const res = await runDuplicateChat({
        report: scanReport,
        pages,
        history: historyForCall,
        opts: { provider, apiKey: key, model },
      });
      const replyTurn: ChatTurn = { role: 'assistant', content: res.reply };
      setChatHistory([...historyForCall, replyTurn]);
      if (res.revisedReport) setScanReport(res.revisedReport);
    } catch (e) {
      setError(toErrorMessage(e));
    } finally {
      setChatBusy(false);
    }
  };

  const onToggleCrossCheck = async (v: boolean) => {
    setCrossCheck(v);
    await setCrossCheckEnabled(v);
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
      <Text style={styles.h1}>Appearance</Text>
      <View style={styles.providerRow}>
        {(['light', 'dark', 'system'] as const).map((p) => (
          <Pressable
            key={p}
            onPress={() => void setPreference(p)}
            style={[styles.providerBtn, preference === p && styles.providerBtnActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: preference === p }}
          >
            <Text
              style={[styles.providerText, preference === p && styles.providerTextActive]}
            >
              {APPEARANCE_LABEL[p]}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.hint}>
        "System" follows your phone's light/dark setting. Changes apply
        immediately.
      </Text>

      <Text style={styles.h1}>Provider</Text>
      <View style={styles.providerRow}>
        {(['anthropic', 'gemini'] as const).map((p) => (
          <Pressable
            key={p}
            onPress={() => onSwitchProvider(p)}
            style={[styles.providerBtn, provider === p && styles.providerBtnActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: provider === p }}
          >
            <Text
              style={[styles.providerText, provider === p && styles.providerTextActive]}
            >
              {PROVIDER_LABEL[p]}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.hint}>
        Anthropic is paid; Gemini Flash is on the free tier (rate-limited).
      </Text>

      <Text style={styles.h1}>API key</Text>
      <Text style={styles.mono}>{maskKey(key)}</Text>
      <Pressable onPress={() => Linking.openURL(PROVIDER_KEY_URL[provider])}>
        <Text style={styles.link}>Get a {PROVIDER_LABEL[provider]} key →</Text>
      </Pressable>
      <TextInput
        value={newKey}
        onChangeText={setNewKey}
        placeholder={`Replace with new ${PROVIDER_KEY_HINT[provider]}`}
        placeholderTextColor={colors.textMuted}
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
      {busy ? <ActivityIndicator style={{ marginTop: 6 }} color={colors.primary} /> : null}
      {status ? <Text style={styles.ok}>{status}</Text> : null}
      <ErrorBanner message={error} />

      <Text style={styles.h1}>Model</Text>
      {provider === 'gemini' ? (
        <View style={styles.modelRow}>
          {FREE_GEMINI_MODELS.map((m) => (
            <Pressable
              key={m}
              onPress={() => onChangeModel(m)}
              style={[styles.modelBtn, model === m && styles.modelBtnActive]}
            >
              <Text style={[styles.modelText, model === m && styles.modelTextActive]}>
                {m}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {provider === 'anthropic' ? (
        <View style={styles.lockedModel}>
          <Text style={styles.lockedModelLabel}>Model</Text>
          <Text style={styles.lockedModelValue}>{defaultModelFor('anthropic')}</Text>
          <Text style={styles.hint}>
            All Claude calls in this project use Sonnet 4.6. Model selection is
            disabled for Anthropic.
          </Text>
        </View>
      ) : (
        <>
          <TextInput
            value={model}
            onChangeText={onChangeModel}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            style={styles.input}
          />
          <View style={styles.btnRow}>
            <Pressable onPress={onResetModel} style={styles.secondary}>
              <Text style={styles.secondaryText}>Reset to default</Text>
            </Pressable>
          </View>
          <Text style={styles.hint}>
            Default for {PROVIDER_LABEL[provider]}: {defaultModelFor(provider)}.
          </Text>
        </>
      )}

      <Text style={styles.h1}>Export / Import</Text>
      <Pressable onPress={onExport} style={styles.exportCard}>
        <Text style={styles.exportTitle}>Copy wiki as JSON</Text>
        <Text style={styles.exportSub}>Your only backup. No cloud sync.</Text>
      </Pressable>
      <TextInput
        value={importText}
        onChangeText={setImportText}
        placeholder="Paste exported JSON here…"
        placeholderTextColor={colors.textMuted}
        multiline
        style={[styles.input, { minHeight: 100 }]}
      />
      <Pressable onPress={onImport} style={styles.secondary} disabled={!importText.trim()}>
        <Text style={styles.secondaryText}>Import (merge)</Text>
      </Pressable>

      <Text style={styles.h1}>Health</Text>
      <View style={styles.grid}>
        <StatCell label="Pages" value={pages.length} warn={false} colors={colors} />
        <StatCell label="Orphans" value={lint?.orphans.length ?? 0} warn={(lint?.orphans.length ?? 0) > 0} colors={colors} />
        <StatCell label="Thin" value={lint?.thin.length ?? 0} warn={(lint?.thin.length ?? 0) > 0} colors={colors} />
        <StatCell label="Dupes" value={lint?.duplicateGroups.length ?? 0} warn={(lint?.duplicateGroups.length ?? 0) > 0} colors={colors} />
      </View>

      <Text style={styles.h1}>Duplicate detection</Text>
      <View style={styles.switchRow}>
        <Switch value={crossCheck} onValueChange={onToggleCrossCheck} disabled={!key} />
        <Text style={styles.switchLabel}>Cross-check new entries with AI before saving</Text>
      </View>
      <Text style={styles.hint}>
        When enabled, each ingested page is compared against the existing wiki and
        you'll be prompted before duplicates are inserted.
      </Text>
      <Pressable
        onPress={onAiScan}
        style={[styles.primary, scanBusy && styles.primaryDisabled]}
        disabled={scanBusy || !key}
      >
        <Text style={styles.primaryText}>
          {scanBusy ? 'Scanning…' : 'Scan for duplicates with AI'}
        </Text>
      </Pressable>

      {scanReport ? (
        <View style={styles.card}>
          {scanReport.notes ? <Text style={styles.dupNote}>{scanReport.notes}</Text> : null}
          {scanReport.groups.length === 0 ? (
            <Text style={styles.dupItem}>No duplicate groups remain.</Text>
          ) : (
            scanReport.groups.map((g, i) => (
              <DupGroupCard
                key={`${i}-${g.slugs.join('|')}`}
                group={g}
                onMerge={() => onMergeGroup(g)}
                onApply={() => onApplyDisambiguation(g)}
                onIgnore={() => onIgnoreGroup(g)}
              />
            ))
          )}

          <Text style={styles.h2}>Discuss the plan</Text>
          {chatHistory.length === 0 ? (
            <Text style={styles.hint}>
              Ask the AI to revisit a group, give it more context (e.g. "those two
              socks are different pairs"), or request alternative wording.
            </Text>
          ) : (
            chatHistory.map((t, i) => (
              <View
                key={i}
                style={[styles.chatBubble, t.role === 'user' ? styles.chatUser : styles.chatAi]}
              >
                <Text style={styles.chatBubbleText}>{t.content}</Text>
              </View>
            ))
          )}
          <TextInput
            value={chatInput}
            onChangeText={setChatInput}
            placeholder="Message the AI about this plan…"
            multiline
            style={[styles.input, { minHeight: 60 }]}
            editable={!chatBusy}
          />
          <Pressable
            onPress={onSendChat}
            style={[styles.secondary, (chatBusy || !chatInput.trim()) && styles.primaryDisabled]}
            disabled={chatBusy || !chatInput.trim()}
          >
            <Text style={styles.secondaryText}>{chatBusy ? 'Thinking…' : 'Send'}</Text>
          </Pressable>
        </View>
      ) : null}

      <UpdatesPanel />

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

function StatCell({
  label,
  value,
  warn,
  colors,
}: {
  label: string;
  value: number;
  warn: boolean;
  colors: ThemeColors;
}): React.JSX.Element {
  return (
    <View
      style={{
        flexGrow: 1,
        minWidth: '45%',
        backgroundColor: warn ? colors.warnBannerBg : colors.surface,
        borderColor: colors.borderSubtle,
        borderWidth: 1,
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
      }}
    >
      <Text
        style={{
          fontSize: 22,
          fontWeight: '700',
          color: warn ? colors.warnBannerText : colors.text,
        }}
      >
        {value}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function DupGroupCard({
  group,
  onMerge,
  onApply,
  onIgnore,
}: {
  group: DuplicateGroup;
  onMerge: () => void;
  onApply: () => void;
  onIgnore: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.dupGroup}>
      {group.slugs.map((s) => (
        <Text key={s} style={styles.dupItem}>• {s}</Text>
      ))}
      <Text style={styles.dupRec}>Recommendation: {group.recommendation}</Text>
      {group.reason ? <Text style={styles.dupReason}>{group.reason}</Text> : null}
      {group.suggestions.map((sug) => (
        <View key={sug.slug} style={styles.dupSuggestion}>
          <Text style={styles.dupSuggestionTitle}>{sug.slug}</Text>
          {sug.newTitle ? (
            <Text style={styles.dupSuggestionLine}>title → {sug.newTitle}</Text>
          ) : null}
          {sug.newBody ? (
            <Text style={styles.dupSuggestionLine}>body → {sug.newBody}</Text>
          ) : null}
          {sug.newFacts?.length ? (
            <Text style={styles.dupSuggestionLine}>
              facts → {sug.newFacts.join('; ')}
            </Text>
          ) : null}
        </View>
      ))}
      <View style={styles.btnRow}>
        {group.recommendation === 'merge' ? (
          <Pressable onPress={onMerge} style={styles.primary}>
            <Text style={styles.primaryText}>Merge</Text>
          </Pressable>
        ) : null}
        {group.recommendation === 'disambiguate' && group.suggestions.length ? (
          <Pressable onPress={onApply} style={styles.primary}>
            <Text style={styles.primaryText}>Apply suggested edits</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={onIgnore} style={styles.secondary}>
          <Text style={styles.secondaryText}>Ignore</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    container: { padding: 16, gap: 8 },
    h1: { fontSize: 18, fontWeight: '700', color: c.text, marginTop: 16 },
    h2: { fontSize: 15, fontWeight: '700', color: c.text, marginTop: 12 },
    mono: { fontFamily: 'Menlo', color: c.textSecondary },
    input: {
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 10,
      backgroundColor: c.inputBg,
      color: c.text,
      textAlignVertical: 'top',
    },
    btnRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    primary: {
      backgroundColor: c.primary,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 8,
      alignSelf: 'flex-start',
    },
    primaryText: { color: c.onPrimary, fontWeight: '600' },
    primaryDisabled: { backgroundColor: c.primaryDisabled },
    secondary: {
      backgroundColor: c.borderSubtle,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 8,
      alignSelf: 'flex-start',
    },
    secondaryText: { color: c.text, fontWeight: '600' },
    ok: { color: c.successText, marginTop: 4 },
    hint: { color: c.textMuted, fontSize: 12 },
    link: { color: c.link, marginVertical: 4 },
    providerRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    providerBtn: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      backgroundColor: c.surface,
      borderColor: c.border,
      borderWidth: 1,
    },
    providerBtnActive: { backgroundColor: c.primary, borderColor: c.primary },
    providerText: { color: c.textSecondary, fontWeight: '600' },
    providerTextActive: { color: c.onPrimary },
    modelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
    modelBtn: {
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 8,
      backgroundColor: c.surface,
      borderColor: c.border,
      borderWidth: 1,
    },
    modelBtnActive: { backgroundColor: c.text, borderColor: c.text },
    modelText: { color: c.textSecondary, fontSize: 12 },
    modelTextActive: { color: c.bg },
    lockedModel: {
      backgroundColor: c.surface,
      borderColor: c.borderSubtle,
      borderWidth: 1,
      borderRadius: 8,
      padding: 10,
      gap: 4,
    },
    lockedModelLabel: { color: c.textMuted, fontSize: 12, textTransform: 'uppercase' },
    lockedModelValue: { fontFamily: 'Menlo', color: c.text, fontWeight: '600' },
    exportCard: {
      backgroundColor: c.primary,
      padding: 14,
      borderRadius: 10,
      marginVertical: 6,
    },
    exportTitle: { color: c.onPrimary, fontWeight: '700', fontSize: 16 },
    exportSub: { color: c.primaryMuted, marginTop: 2 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    card: {
      backgroundColor: c.surface,
      borderColor: c.borderSubtle,
      borderWidth: 1,
      padding: 12,
      borderRadius: 8,
      marginTop: 6,
      gap: 4,
    },
    dupItem: { color: c.textSecondary },
    dupNote: { color: c.textSecondary, fontStyle: 'italic', marginBottom: 4 },
    dupGroup: {
      borderTopColor: c.borderSubtle,
      borderTopWidth: 1,
      paddingTop: 8,
      marginTop: 8,
      gap: 4,
    },
    dupRec: { color: c.text, fontWeight: '700', marginTop: 4 },
    dupReason: { color: c.textSecondary },
    dupSuggestion: {
      backgroundColor: c.surfaceAlt,
      borderRadius: 6,
      padding: 8,
      gap: 2,
      marginTop: 4,
    },
    dupSuggestionTitle: { color: c.text, fontWeight: '600' },
    dupSuggestionLine: { color: c.textSecondary, fontSize: 12 },
    switchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 8 },
    switchLabel: { color: c.textSecondary },
    chatBubble: {
      padding: 8,
      borderRadius: 8,
      marginVertical: 2,
      maxWidth: '90%',
    },
    chatUser: { backgroundColor: c.toneInfoBg, alignSelf: 'flex-end' },
    chatAi: { backgroundColor: c.surfaceAlt, alignSelf: 'flex-start' },
    chatBubbleText: { color: c.text },
    orphanRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      borderBottomColor: c.borderSubtle,
      borderBottomWidth: 1,
    },
    dangerLink: { color: c.dangerText },
  });
