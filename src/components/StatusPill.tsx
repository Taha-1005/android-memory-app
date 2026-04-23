import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface Props {
  label: string;
  tone?: 'neutral' | 'ok' | 'warn' | 'err' | 'info';
}

const tones: Record<NonNullable<Props['tone']>, { bg: string; fg: string }> = {
  neutral: { bg: '#e5e7eb', fg: '#374151' },
  ok: { bg: '#d1fae5', fg: '#065f46' },
  warn: { bg: '#fef3c7', fg: '#92400e' },
  err: { bg: '#fee2e2', fg: '#991b1b' },
  info: { bg: '#dbeafe', fg: '#1e40af' },
};

export function StatusPill({ label, tone = 'neutral' }: Props): React.JSX.Element {
  const t = tones[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      <Text style={[styles.text, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
