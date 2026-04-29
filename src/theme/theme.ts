/**
 * Semantic colour tokens for the app's two themes (light / dark).
 *
 * Every screen pulls colours from a `ThemeColors` object via `useTheme()`,
 * so adding a new theme is a matter of supplying another `ThemeColors`
 * record — no per-screen branching.
 */
import { ColorSchemeName } from 'react-native';

export type ThemeMode = 'light' | 'dark';
export type ThemePreference = 'light' | 'dark' | 'system';

export interface ThemeColors {
  bg: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderSubtle: string;
  primary: string;
  primaryMuted: string;
  primaryDisabled: string;
  onPrimary: string;
  link: string;
  toneNeutralBg: string;
  toneNeutralFg: string;
  toneOkBg: string;
  toneOkFg: string;
  toneWarnBg: string;
  toneWarnFg: string;
  toneErrBg: string;
  toneErrFg: string;
  toneInfoBg: string;
  toneInfoFg: string;
  warnBannerBg: string;
  warnBannerBorder: string;
  warnBannerText: string;
  errBannerBg: string;
  errBannerBorder: string;
  errBannerText: string;
  successBg: string;
  successText: string;
  pillBg: string;
  pillBorder: string;
  pillText: string;
  inputBg: string;
  segmentBg: string;
  segmentBtnActiveBg: string;
  dangerText: string;
  tabBarBg: string;
  headerBg: string;
}

export const lightColors: ThemeColors = {
  bg: '#f9fafb',
  surface: '#ffffff',
  surfaceAlt: '#f3f4f6',
  text: '#111827',
  textSecondary: '#374151',
  textMuted: '#6b7280',
  border: '#d1d5db',
  borderSubtle: '#e5e7eb',
  primary: '#2563eb',
  primaryMuted: '#dbeafe',
  primaryDisabled: '#93c5fd',
  onPrimary: '#ffffff',
  link: '#2563eb',
  toneNeutralBg: '#e5e7eb',
  toneNeutralFg: '#374151',
  toneOkBg: '#d1fae5',
  toneOkFg: '#065f46',
  toneWarnBg: '#fef3c7',
  toneWarnFg: '#92400e',
  toneErrBg: '#fee2e2',
  toneErrFg: '#991b1b',
  toneInfoBg: '#dbeafe',
  toneInfoFg: '#1e40af',
  warnBannerBg: '#fef3c7',
  warnBannerBorder: '#fde68a',
  warnBannerText: '#92400e',
  errBannerBg: '#fee2e2',
  errBannerBorder: '#fecaca',
  errBannerText: '#991b1b',
  successBg: '#d1fae5',
  successText: '#065f46',
  pillBg: '#eff6ff',
  pillBorder: '#bfdbfe',
  pillText: '#1e40af',
  inputBg: '#ffffff',
  segmentBg: '#e5e7eb',
  segmentBtnActiveBg: '#ffffff',
  dangerText: '#b91c1c',
  tabBarBg: '#ffffff',
  headerBg: '#ffffff',
};

export const darkColors: ThemeColors = {
  bg: '#000000',
  surface: '#101216',
  surfaceAlt: '#1c1f26',
  text: '#f9fafb',
  textSecondary: '#d1d5db',
  textMuted: '#9ca3af',
  border: '#374151',
  borderSubtle: '#1f2937',
  primary: '#3b82f6',
  primaryMuted: '#1e3a8a',
  primaryDisabled: '#1e3a8a',
  onPrimary: '#ffffff',
  link: '#60a5fa',
  toneNeutralBg: '#1f2937',
  toneNeutralFg: '#d1d5db',
  toneOkBg: '#064e3b',
  toneOkFg: '#a7f3d0',
  toneWarnBg: '#78350f',
  toneWarnFg: '#fde68a',
  toneErrBg: '#7f1d1d',
  toneErrFg: '#fecaca',
  toneInfoBg: '#1e3a8a',
  toneInfoFg: '#bfdbfe',
  warnBannerBg: '#78350f',
  warnBannerBorder: '#92400e',
  warnBannerText: '#fde68a',
  errBannerBg: '#7f1d1d',
  errBannerBorder: '#991b1b',
  errBannerText: '#fecaca',
  successBg: '#064e3b',
  successText: '#a7f3d0',
  pillBg: '#1e3a8a',
  pillBorder: '#1e40af',
  pillText: '#bfdbfe',
  inputBg: '#101216',
  segmentBg: '#1f2937',
  segmentBtnActiveBg: '#374151',
  dangerText: '#f87171',
  tabBarBg: '#101216',
  headerBg: '#101216',
};

export function colorsFor(mode: ThemeMode): ThemeColors {
  return mode === 'dark' ? darkColors : lightColors;
}

export function resolveMode(pref: ThemePreference, system: ColorSchemeName): ThemeMode {
  if (pref === 'light' || pref === 'dark') return pref;
  return system === 'dark' ? 'dark' : 'light';
}

export function isThemePreference(v: string | null | undefined): v is ThemePreference {
  return v === 'light' || v === 'dark' || v === 'system';
}
