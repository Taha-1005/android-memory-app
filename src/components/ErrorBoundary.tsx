import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/theme';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last-line-of-defence error boundary mounted at the layout root. Without
 * one, a render-time exception in any screen white-screens the whole app.
 * The user can dismiss the error and try again — state inside individual
 * screens will be reset because we re-mount the children when error clears.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // No remote logging in this offline-first app; surface to the dev console.
    console.error('Unhandled render error:', error, info.componentStack);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    if (this.state.error) {
      return <ErrorFallback error={this.state.error} onReset={this.reset} />;
    }
    return this.props.children;
  }
}

function ErrorFallback({
  error,
  onReset,
}: {
  error: Error;
  onReset: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.title}>Something went wrong.</Text>
      <Text style={styles.body}>{error.message}</Text>
      {error.stack ? (
        <View style={styles.stack}>
          <Text style={styles.stackText}>{error.stack}</Text>
        </View>
      ) : null}
      <Pressable onPress={onReset} style={styles.btn}>
        <Text style={styles.btnText}>Dismiss</Text>
      </Pressable>
      <Text style={styles.hint}>
        Your wiki data is safe. If this keeps happening, restart the app.
      </Text>
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { padding: 24, gap: 12, backgroundColor: c.bg, flexGrow: 1 },
    title: { fontSize: 20, fontWeight: '700', color: c.errBannerText },
    body: { color: c.textSecondary, fontSize: 14 },
    stack: {
      backgroundColor: c.errBannerBg,
      borderRadius: 8,
      padding: 10,
      marginTop: 4,
    },
    stackText: { color: c.errBannerText, fontSize: 11, fontFamily: 'Menlo' },
    btn: {
      alignSelf: 'flex-start',
      backgroundColor: c.primary,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 8,
      marginTop: 8,
    },
    btnText: { color: c.onPrimary, fontWeight: '600' },
    hint: { color: c.textMuted, fontSize: 12 },
  });
