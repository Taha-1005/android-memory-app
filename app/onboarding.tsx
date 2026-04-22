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
import { setApiKey } from '../src/secure/apiKey';
import { probeApiKey } from '../src/llm/client';

export default function Onboarding(): JSX.Element {
  const router = useRouter();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSave = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await probeApiKey(key.trim());
      if (!res.ok) throw new Error(res.message);
      await setApiKey(key.trim());
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
        This app uses your own Anthropic API key to call Claude. Your key is stored
        securely on this device only — we never see it or send it anywhere else.
      </Text>
      <Pressable onPress={() => Linking.openURL('https://console.anthropic.com/settings/keys')}>
        <Text style={styles.link}>Get an API key →</Text>
      </Pressable>
      <Text style={styles.label}>API key</Text>
      <TextInput
        value={key}
        onChangeText={setKey}
        placeholder="sk-ant-…"
        autoCapitalize="none"
        secureTextEntry
        style={styles.input}
        accessibilityLabel="Anthropic API key"
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
  hint: { color: '#6b7280', fontSize: 12, marginTop: 8 },
  skip: { color: '#6b7280', textAlign: 'center' },
});
