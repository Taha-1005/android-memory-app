export function extractJson<T = unknown>(raw: string): T {
  if (!raw) throw new Error('Empty response from LLM.');
  let text = raw.trim();

  // Strip markdown code fences, including any trailing whitespace/newlines after them.
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

  // Find the opening brace.
  const start = text.indexOf('{');
  if (start === -1) throw new Error(`LLM returned non-JSON: ${text.slice(0, 200)}`);

  // Walk forward with a bracket counter, respecting strings and escapes,
  // to find the matching closing brace. This is robust against:
  //   - trailing prose after the JSON
  //   - nested objects
  //   - `}` characters inside string values
  let depth = 0;
  let inString = false;
  let escape = false;
  let end = -1;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }

  if (end === -1) throw new Error(`LLM returned non-JSON: ${text.slice(0, 200)}`);

  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    throw new Error(`LLM returned non-JSON: ${text.slice(0, 200)}`);
  }
}
