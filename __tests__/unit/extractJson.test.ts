import { extractJson } from '../../src/utils/json';

describe('extractJson', () => {
  it('parses raw JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('strips ```json fences', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('strips plain ``` fences', () => {
    expect(extractJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('trims preamble/postamble around outermost braces', () => {
    const noisy = 'Sure! Here is your JSON: {"answer":"hi"} -- done.';
    expect(extractJson(noisy)).toEqual({ answer: 'hi' });
  });

  it('throws on empty input', () => {
    expect(() => extractJson('')).toThrow(/Empty response/);
  });

  it('throws informatively on malformed input', () => {
    expect(() => extractJson('{not json')).toThrow(/non-JSON/);
  });
});
