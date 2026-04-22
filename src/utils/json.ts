export function extractJson<T = unknown>(raw: string): T {
  if (!raw) throw new Error('Empty response from LLM.');
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first > 0 && last > first) text = text.slice(first, last + 1);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`LLM returned non-JSON: ${text.slice(0, 200)}`);
  }
}
