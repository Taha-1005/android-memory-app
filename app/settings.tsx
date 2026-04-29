import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
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
import {
  clearApiKeyFor,
  getApiKeyFor,
  getModelFor,
  getProvider,
  maskKey,
  setApiKeyFor,
  setModelFor,
  setProvider,
} from '../src/secure/apiKey';
import { probeProviderKey, defaultModelFor, Provider } from '../src/llm/provider';
import { FREE_GEMINI_MODELS } from '../src/llm/geminiClient';
import { applyImport, buildExport, parseImport } from '../src/services/exportImport';
import { getDb } from '../src/db/client';
import { listPages, deletePage, upsertPage, getPage } from '../src/db/repositories/pages';
import { computeLint } from '../src/domain/lint';
import { WikiPage } from '../src/domain/types';
import { runMerge } from '../src/llm/merge';
import { mergePage } from '../src/domain/mergePage';
import { slugify } from '../src/domain/slugify';
import { useTheme } from '../src/theme/ThemeContext';
import type { ThemeColors, ThemePreference } from '../src/theme/theme';

const PROVIDER_LABEL: Record<Provider, string> = {
  anthropic: 'Anthropic Claude',
  gemini: 'Google Gemini (free)',
};

const PROVIDER_KEY_HINT: Record<Provider, string> = {
  anthropic: 'sk-ant-…',
  gemini: 'AIza… (Google AI Studio)',
};

const PROVIDER_KEY_URL: Record<Provider, string> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  gemini: 'https://aistudio.google.com/apikey',
};

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
  const [model, setModelLocal] = useState('claude-sonnet-4-6');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lint, setLint] = useState<ReturnType<typeof computeLint> | null>(null);
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [importText, setImportText] = useState('');

  const refresh = useCallback(async () => {
    const p = await getProvider();
    setProviderLocal(p);
    setKey(await getApiKeyFor(p));
    setModelLocal(await getModelFor(p));
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
      setError(e instanceof Error ? e.message : String(e));
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
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onMergeDupes = async (group: WikiPage[]) => {
    if (!key) {
      setError(`API key required for ${PROVIDER_LABEL[provider]} to run merge.`);
      return;
    }
    if (group.length < 2) return;
    setBusy(true);
    try {
      const db = getDb();
      let current: WikiPage = group[0];
      for (let i = 1; i < group.length; i++) {
        const incoming = await runMerge(current, group[i], {
          provider,
          apiKey: key,
          model,
        });
        const existing = await getPage(db, slugify(incoming.title));
        current = mergePage(existing, incoming, null);
        await upsertPage(db, current);
      }
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

      {lint?.duplicateGroups.length ? (
        <>
          <Text style={styles.h2}>Duplicate candidates</Text>
          {lint.duplicateGroups.map((g, i) => (
            <View key={i} style={styles.card}>
              {g.map((p) => (
                <Text key={p.slug} style={styles.dupItem}>• {p.title}</Text>
              ))}
              <Pressable onPress={() => onMergeDupes(g)} style={styles.primary}>
                <Text style={styles.primaryText}>Merge with {PROVIDER_LABEL[provider]}</Text>
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
    orphanRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      borderBottomColor: c.borderSubtle,
      borderBottomWidth: 1,
    },
    dangerLink: { color: c.dangerText },
  });
