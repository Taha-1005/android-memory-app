import {
  colorsFor,
  darkColors,
  isThemePreference,
  lightColors,
  resolveMode,
} from '../../src/theme/theme';

describe('theme', () => {
  describe('resolveMode', () => {
    it('honours an explicit light preference regardless of system', () => {
      expect(resolveMode('light', 'dark')).toBe('light');
      expect(resolveMode('light', 'light')).toBe('light');
      expect(resolveMode('light', null)).toBe('light');
    });

    it('honours an explicit dark preference regardless of system', () => {
      expect(resolveMode('dark', 'light')).toBe('dark');
      expect(resolveMode('dark', 'dark')).toBe('dark');
      expect(resolveMode('dark', null)).toBe('dark');
    });

    it('falls back to the system colour scheme when set to system', () => {
      expect(resolveMode('system', 'dark')).toBe('dark');
      expect(resolveMode('system', 'light')).toBe('light');
    });

    it('treats an unknown system value as light', () => {
      expect(resolveMode('system', null)).toBe('light');
      expect(resolveMode('system', undefined)).toBe('light');
    });
  });

  describe('colorsFor', () => {
    it('returns the correct palette for each mode', () => {
      expect(colorsFor('light')).toBe(lightColors);
      expect(colorsFor('dark')).toBe(darkColors);
    });

    it('exposes distinct backgrounds for light and dark', () => {
      expect(lightColors.bg).not.toBe(darkColors.bg);
      expect(lightColors.text).not.toBe(darkColors.text);
    });
  });

  describe('isThemePreference', () => {
    it('accepts the three valid preferences', () => {
      expect(isThemePreference('light')).toBe(true);
      expect(isThemePreference('dark')).toBe(true);
      expect(isThemePreference('system')).toBe(true);
    });

    it('rejects everything else', () => {
      expect(isThemePreference(null)).toBe(false);
      expect(isThemePreference(undefined)).toBe(false);
      expect(isThemePreference('')).toBe(false);
      expect(isThemePreference('LIGHT')).toBe(false);
      expect(isThemePreference('auto')).toBe(false);
    });
  });
});
