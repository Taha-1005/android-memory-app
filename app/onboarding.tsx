import React, { useState } from 'react';
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

const PROVIDER_LABEL: Record<Provider, string> = {
  anthropic: 'Anthropic Claude',
  gemini: 'Google Gemini (free)',
};

const PROVIDER_KEY_HINT: Record<Provider, string> = {
  anthropic: 'sk-ant-…',
  gemini: 'AIza…',
};

const PROVIDER_KEY_URL: Record<Provider, string> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  gemini: 'https://aistudio.google.com/apikey',
};

const PROVIDER_BLURB: Record<Provider, string> = {
  anthropic:
    'Pay-as-you-go Anthropic API. Highest answer quality; small per-request charge.',
  gemini:
    'Google AI Studio free tier. Rate-limited (10 req/min on Flash) but $0 to use.',
};

export default function Onboarding(): React.JSX.Element {
  const router = useRouter();
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
    <ScrollView contentContainerStyle={styles.container}>
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
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Validate &amp; save</Text>}
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

const styles = StyleSheet.create({
  container: { padding: 20, gap: 10 },
  title: { fontSize: 24, fontWeight: '700', color: '#111827' },
  body: { color: '#374151', lineHeight: 22 },
  link: { color: '#2563eb', marginVertical: 4 },
  label: { color: '#374151', marginTop: 10 },
  providerRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  providerBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderColor: '#d1d5db',
    borderWidth: 1,
  },
  providerBtnActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  providerText: { color: '#374151', fontWeight: '600' },
  providerTextActive: { color: '#fff' },
  input: {
    borderColor: '#d1d5db',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#fff',
    fontSize: 15,
  },
  primary: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryDisabled: { backgroundColor: '#93c5fd' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  hint: { color: '#6b7280', fontSize: 12, marginTop: 4 },
  skip: { color: '#6b7280', textAlign: 'center' },
});
