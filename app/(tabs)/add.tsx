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
import { processSource, saveSource } from '../../src/services/ingestPipeline';
import { getApiKey } from '../../src/secure/apiKey';
import { useTheme } from '../../src/theme/ThemeContext';
import type { ThemeColors } from '../../src/theme/theme';

export default function AddScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
          <>
            <Text style={styles.label}>URL</Text>
            <TextInput
              value={url}
              onChangeText={setUrl}
              placeholder="https://example.com/article"
              placeholderTextColor={colors.textMuted}
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
  });
