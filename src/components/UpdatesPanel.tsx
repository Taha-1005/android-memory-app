import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/theme';
import { toErrorMessage } from '../utils/errors';

export function UpdatesPanel(): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { currentlyRunning, isUpdateAvailable, isUpdatePending } = Updates.useUpdates();
  const [busy, setBusy] = useState<null | 'checking' | 'downloading'>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!Updates.isEnabled) {
    return (
      <View>
        <Text style={styles.h1}>App updates</Text>
        <Text style={styles.hint}>
          Over-the-air updates are disabled in this build (development client or
          Expo Go). Install a release APK to receive automatic updates.
        </Text>
      </View>
    );
  }

  const onCheck = async () => {
    setErr(null);
    setMsg(null);
    setBusy('checking');
    try {
      const r = await Updates.checkForUpdateAsync();
      setMsg(r.isAvailable ? 'A new update is available.' : 'You are on the latest version.');
    } catch (e) {
      setErr(toErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const onDownloadAndRestart = async () => {
    setErr(null);
    setMsg(null);
    setBusy('downloading');
    try {
      if (!isUpdatePending) await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    } catch (e) {
      setErr(toErrorMessage(e));
      setBusy(null);
    }
  };

  const canRestart = isUpdateAvailable || isUpdatePending;

  return (
    <View>
      <Text style={styles.h1}>App updates</Text>
      <View style={styles.card}>
        <Row label="Channel" value={currentlyRunning.channel ?? 'unknown'} styles={styles} />
        <Row
          label="Runtime"
          value={currentlyRunning.runtimeVersion ?? 'unknown'}
          styles={styles}
        />
        <Row
          label="Running"
          value={
            currentlyRunning.isEmbeddedLaunch
              ? 'embedded (bundled with APK)'
              : (currentlyRunning.updateId ?? '').slice(0, 8) || 'unknown'
          }
          styles={styles}
        />
        {isUpdatePending ? (
          <Text style={styles.pending}>
            An update is downloaded and will apply on restart.
          </Text>
        ) : null}
      </View>

      <View style={styles.btnRow}>
        <Pressable
          onPress={onCheck}
          style={[styles.secondary, busy !== null && styles.disabled]}
          disabled={busy !== null}
        >
          <Text style={styles.secondaryText}>
            {busy === 'checking' ? 'Checking…' : 'Check for updates'}
          </Text>
        </Pressable>
        {canRestart ? (
          <Pressable
            onPress={onDownloadAndRestart}
            style={[styles.primary, busy !== null && styles.disabled]}
            disabled={busy !== null}
          >
            <Text style={styles.primaryText}>
              {busy === 'downloading' ? 'Updating…' : 'Download & restart'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {busy !== null ? <ActivityIndicator style={{ marginTop: 6 }} /> : null}
      {msg ? <Text style={styles.ok}>{msg}</Text> : null}
      {err ? <Text style={styles.err}>{err}</Text> : null}
    </View>
  );
}

function Row({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof makeStyles>;
}): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    h1: { fontSize: 18, fontWeight: '700', color: c.text, marginTop: 16 },
    hint: { color: c.textMuted, fontSize: 12 },
    card: {
      backgroundColor: c.surface,
      padding: 12,
      borderRadius: 8,
      marginTop: 6,
      gap: 4,
    },
    row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
    rowLabel: { color: c.textMuted, fontSize: 13 },
    rowValue: { color: c.text, fontSize: 13, fontFamily: 'Menlo' },
    pending: { color: c.toneInfoFg, fontSize: 12, marginTop: 4 },
    btnRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 8 },
    primary: {
      backgroundColor: c.primary,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 8,
      alignSelf: 'flex-start',
    },
    primaryText: { color: c.onPrimary, fontWeight: '600' },
    secondary: {
      backgroundColor: c.surfaceAlt,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 8,
      alignSelf: 'flex-start',
    },
    secondaryText: { color: c.text, fontWeight: '600' },
    disabled: { opacity: 0.5 },
    ok: { color: c.successText, marginTop: 4 },
    err: { color: c.errBannerText, marginTop: 4 },
  });
