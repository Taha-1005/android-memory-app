import { slugify } from '../../src/domain/slugify';

describe('slugify', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('strips punctuation', () => {
    expect(slugify("Alice's Adventures!")).toBe('alices-adventures');
  });

  it('is idempotent', () => {
    const a = slugify('Some Title, With Commas');
    expect(slugify(a)).toBe(a);
  });

  it('falls back to a timestamped slug for empty or punctuation-only input', () => {
    expect(slugify('')).toMatch(/^page-\d+$/);
    expect(slugify('!!!')).toMatch(/^page-\d+$/);
  });

  it('clamps length to 60 characters', () => {
    const long = 'a'.repeat(200);
    const out = slugify(long);
    expect(out.length).toBeLessThanOrEqual(60);
  });
});
