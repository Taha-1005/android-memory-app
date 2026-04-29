import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

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
      return (
        <ScrollView contentContainerStyle={styles.wrap}>
          <Text style={styles.title}>Something went wrong.</Text>
          <Text style={styles.body}>{this.state.error.message}</Text>
          {this.state.error.stack ? (
            <View style={styles.stack}>
              <Text style={styles.stackText}>{this.state.error.stack}</Text>
            </View>
          ) : null}
          <Pressable onPress={this.reset} style={styles.btn}>
            <Text style={styles.btnText}>Dismiss</Text>
          </Pressable>
          <Text style={styles.hint}>
            Your wiki data is safe. If this keeps happening, restart the app.
          </Text>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}
const styles = StyleSheet.create({
  wrap: { padding: 24, gap: 12, backgroundColor: '#f9fafb', flexGrow: 1 },
  title: { fontSize: 20, fontWeight: '700', color: '#991b1b' },
  body: { color: '#374151', fontSize: 14 },
  stack: {
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
  },
  stackText: { color: '#7f1d1d', fontSize: 11, fontFamily: 'Menlo' },
  btn: {
    alignSelf: 'flex-start',
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 8,
  },
  btnText: { color: '#fff', fontWeight: '600' },
  hint: { color: '#6b7280', fontSize: 12 },
});
