import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { WikiPage } from '../domain/types';
import { formatRelative } from '../utils/time';
import { StatusPill } from './StatusPill';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/theme';

interface Props {
  page: WikiPage;
  onPress: (slug: string) => void;
}

const kindTone: Record<
  WikiPage['kind'],
  'neutral' | 'ok' | 'warn' | 'err' | 'info'
> = {
  entity: 'info',
  concept: 'ok',
  source: 'warn',
};

export function PageCard({ page, onPress }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      onPress={() => onPress(page.slug)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${page.title}`}
    >
      <View style={styles.row}>
        <Text style={styles.title} numberOfLines={1}>
          {page.title}
        </Text>
        <StatusPill label={page.kind} tone={kindTone[page.kind]} />
      </View>
      <Text style={styles.meta}>Updated {formatRelative(page.updatedAt)}</Text>
    </Pressable>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.surface,
      borderRadius: 10,
      padding: 12,
      marginVertical: 4,
      borderColor: c.borderSubtle,
      borderWidth: 1,
    },
    pressed: { opacity: 0.7 },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
      gap: 8,
    },
    title: { fontSize: 16, fontWeight: '600', color: c.text, flex: 1 },
    meta: { fontSize: 12, color: c.textMuted },
  });
