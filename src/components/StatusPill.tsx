import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/theme';

interface Props {
  label: string;
  tone?: 'neutral' | 'ok' | 'warn' | 'err' | 'info';
}

function tonePair(c: ThemeColors, tone: NonNullable<Props['tone']>): { bg: string; fg: string } {
  switch (tone) {
    case 'ok':
      return { bg: c.toneOkBg, fg: c.toneOkFg };
    case 'warn':
      return { bg: c.toneWarnBg, fg: c.toneWarnFg };
    case 'err':
      return { bg: c.toneErrBg, fg: c.toneErrFg };
    case 'info':
      return { bg: c.toneInfoBg, fg: c.toneInfoFg };
    case 'neutral':
    default:
      return { bg: c.toneNeutralBg, fg: c.toneNeutralFg };
  }
}

export function StatusPill({ label, tone = 'neutral' }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const t = tonePair(colors, tone);
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
