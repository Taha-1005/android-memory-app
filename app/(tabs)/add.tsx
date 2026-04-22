import React, { useCallback, useEffect, useState } from 'react';
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
import { processSource, saveSource } from '../../src/services/ingestPipeline';
import { getApiKey } from '../../src/secure/apiKey';

export default function AddScreen(): JSX.Element {
  const router = useRouter();
  const [mode, setMode] = useState<'text' | 'url'>('text');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');
  const [autoProcess, setAutoProcess] = useState(true);
  const [status, setStatus] = useState<null | 'saving' | 'processing' | 'saved'>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState<boolean>(true);

  useFocusEffect(
    useCallback(() => {
      void getApiKey().then((k) => setHasKey(!!k));
    }, []),
  );
  useEffect(() => {
    if (!hasKey && autoProcess) setAutoProcess(false);
    // We intentionally only force off — user can re-enable after adding a key.
  }, [hasKey, autoProcess]);

  const urlValid = /^https?:\/\//i.test(url);
  const canSave =
    title.trim().length > 0 &&
    (mode === 'text' ? content.trim().length > 0 : urlValid) &&
    status !== 'saving' &&
    status !== 'processing';

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
      if (autoProcess) {
        setStatus('processing');
        await processSource(entry.id);
      }
      setStatus('saved');
      setTitle('');
      setContent('');
      setUrl('');
      setTimeout(() => setStatus(null), 1800);
      if (autoProcess) router.push('/browse');
    } catch (e) {
      setStatus(null);
      setError(e instanceof Error ? e.message : String(e));
    }
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
              multiline
              style={[styles.input, styles.textarea]}
              accessibilityLabel="Source content"
            />
            <Text style={styles.hint}>{content.length} characters</Text>
          </>
        ) : (
          <>
            <Text style={styles.label}>URL</Text>
            <TextInput
              value={url}
              onChangeText={setUrl}
              placeholder="https://example.com/article"
              autoCapitalize="none"
              keyboardType="url"
              style={styles.input}
              accessibilityLabel="URL"
            />
            <Text style={styles.warn}>
              URLs aren't fetched. Claude summarises from its own knowledge.
            </Text>
          </>
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

        <Pressable
          onPress={onSave}
          disabled={!canSave}
          style={[styles.primary, !canSave && styles.primaryDisabled]}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>
            {status === 'processing'
              ? 'Processing…'
              : status === 'saving'
                ? 'Saving…'
                : status === 'saved'
                  ? 'Saved ✓'
                  : autoProcess
                    ? 'Save & process'
                    : 'Save source'}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f9fafb' },
  container: { padding: 16, gap: 8 },
  segment: { flexDirection: 'row', backgroundColor: '#e5e7eb', borderRadius: 8, padding: 4 },
  segmentBtn: { flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: 'center' },
  segmentBtnActive: { backgroundColor: '#fff' },
  segmentText: { color: '#6b7280', fontWeight: '500' },
  segmentTextActive: { color: '#111827' },
  label: { fontSize: 13, color: '#374151', marginTop: 10 },
  input: {
    borderColor: '#d1d5db',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#fff',
    fontSize: 15,
  },
  textarea: { minHeight: 160, textAlignVertical: 'top' },
  hint: { fontSize: 12, color: '#6b7280' },
  warn: { fontSize: 12, color: '#92400e', marginTop: 4 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 12 },
  switchLabel: { color: '#374151' },
  primary: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryDisabled: { backgroundColor: '#93c5fd' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  keyBanner: {
    backgroundColor: '#fef3c7',
    borderColor: '#fde68a',
    borderWidth: 1,
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  keyBannerText: { color: '#92400e', fontSize: 13, lineHeight: 18 },
});
