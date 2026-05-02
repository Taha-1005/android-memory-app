import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ErrorBanner } from '../src/components/ErrorBanner';
import { setApiKeyFor, setProvider } from '../src/secure/apiKey';
import { probeProviderKey, Provider } from '../src/llm/provider';
import {
  PROVIDER_BLURB,
  PROVIDER_KEY_HINT,
  PROVIDER_KEY_URL,
  PROVIDER_LABEL,
} from '../src/llm/providerInfo';
import { useTheme } from '../src/theme/ThemeContext';
import type { ThemeColors } from '../src/theme/theme';

export default function Onboarding(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [provider, setProviderLocal] = useState<Provider>('anthropic');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSave = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await probeProviderKey(provider, key.trim());
      if (!res.ok) throw new Error(res.message);
      await setProvider(provider);
      await setApiKeyFor(provider, key.trim());
      router.replace('/(tabs)/add');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Welcome to Mobile Wiki</Text>
      <Text style={styles.body}>
        This app uses an LLM to turn your sources into wiki pages. Pick a
        provider and paste your own API key — the key is stored securely on this
        device only.
      </Text>

      <Text style={styles.label}>Provider</Text>
      <View style={styles.providerRow}>
        {(['anthropic', 'gemini'] as const).map((p) => (
          <Pressable
            key={p}
            onPress={() => setProviderLocal(p)}
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
      <Text style={styles.hint}>{PROVIDER_BLURB[provider]}</Text>

      <Pressable onPress={() => Linking.openURL(PROVIDER_KEY_URL[provider])}>
        <Text style={styles.link}>Get a {PROVIDER_LABEL[provider]} key →</Text>
      </Pressable>
      <Text style={styles.label}>API key</Text>
      <TextInput
        value={key}
        onChangeText={setKey}
        placeholder={PROVIDER_KEY_HINT[provider]}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        secureTextEntry
        style={styles.input}
        accessibilityLabel={`${PROVIDER_LABEL[provider]} API key`}
      />
      <ErrorBanner message={error} />
      <Pressable
        onPress={onSave}
        disabled={busy || key.trim().length < 10}
        style={[styles.primary, (busy || key.trim().length < 10) && styles.primaryDisabled]}
      >
        {busy ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <Text style={styles.primaryText}>Validate &amp; save</Text>
        )}
      </Pressable>
      <Text style={styles.hint}>
        Uninstalling the app wipes the stored key. No cloud backup.
      </Text>
      <View style={{ height: 40 }} />
      <Pressable onPress={() => router.replace('/(tabs)/browse')}>
        <Text style={styles.skip}>Skip for now (browse-only mode)</Text>
      </Pressable>
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    container: { padding: 20, gap: 10 },
    title: { fontSize: 24, fontWeight: '700', color: c.text },
    body: { color: c.textSecondary, lineHeight: 22 },
    link: { color: c.link, marginVertical: 4 },
    label: { color: c.textSecondary, marginTop: 10 },
    providerRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    providerBtn: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 8,
      backgroundColor: c.surface,
      borderColor: c.border,
      borderWidth: 1,
    },
    providerBtnActive: { backgroundColor: c.primary, borderColor: c.primary },
    providerText: { color: c.textSecondary, fontWeight: '600' },
    providerTextActive: { color: c.onPrimary },
    input: {
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 10,
      backgroundColor: c.inputBg,
      color: c.text,
      fontSize: 15,
    },
    primary: {
      backgroundColor: c.primary,
      paddingVertical: 14,
      borderRadius: 10,
      alignItems: 'center',
      marginTop: 8,
    },
    primaryDisabled: { backgroundColor: c.primaryDisabled },
    primaryText: { color: c.onPrimary, fontSize: 16, fontWeight: '600' },
    hint: { color: c.textMuted, fontSize: 12, marginTop: 4 },
    skip: { color: c.textMuted, textAlign: 'center' },
  });
