import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

export function ErrorBanner({ message }: { message: string | null }): React.JSX.Element | null {
  const { colors } = useTheme();
  if (!message) return null;
  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: colors.errBannerBg, borderColor: colors.errBannerBorder },
      ]}
      accessibilityRole="alert"
    >
      <Text style={[styles.text, { color: colors.errBannerText }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    padding: 12,
    borderRadius: 8,
    marginVertical: 8,
  },
  text: {
    fontSize: 14,
  },
});
