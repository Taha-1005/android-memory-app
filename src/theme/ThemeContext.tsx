/**
 * Theme provider and hook. Resolves the active mode from a persisted user
 * preference (`light` / `dark` / `system`) and the device's current colour
 * scheme. Preference is stored in `expo-secure-store` so it survives restarts.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';
import {
  ThemeColors,
  ThemeMode,
  ThemePreference,
  colorsFor,
  isThemePreference,
  resolveMode,
} from './theme';

const PREF_KEY = 'theme_preference';

type SecureStore = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
};

let injected: SecureStore | null = null;

export function setThemeStoreForTests(store: SecureStore | null): void {
  injected = store;
}

async function store(): Promise<SecureStore> {
  if (injected) return injected;
  const mod = (await import('expo-secure-store')) as unknown as SecureStore;
  return mod;
}

interface ThemeContextValue {
  colors: ThemeColors;
  mode: ThemeMode;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => Promise<void>;
}

const ThemeCtx = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    (async () => {
      try {
        const s = await store();
        const v = await s.getItemAsync(PREF_KEY);
        if (isThemePreference(v)) setPreferenceState(v);
      } catch {
        // Fall back silently to system preference.
      }
    })();
  }, []);

  const setPreference = useCallback(async (p: ThemePreference) => {
    // Short-circuit no-op writes — avoids a wasted secure-store round-trip
    // every time the user re-taps the already-selected appearance pill.
    setPreferenceState((prev) => (prev === p ? prev : p));
    try {
      const s = await store();
      await s.setItemAsync(PREF_KEY, p);
    } catch {
      // In-memory update still applies even if persistence fails.
    }
  }, []);

  const mode = resolveMode(preference, system ?? null);
  const colors = colorsFor(mode);

  const value = useMemo<ThemeContextValue>(
    () => ({ colors, mode, preference, setPreference }),
    [colors, mode, preference, setPreference],
  );

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): ThemeContextValue {
  const v = useContext(ThemeCtx);
  if (!v) throw new Error('useTheme must be used inside ThemeProvider');
  return v;
}
