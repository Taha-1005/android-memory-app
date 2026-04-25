import { QueryResult, WikiPage } from '../domain/types';
import { extractJson } from '../utils/json';
import { buildQueryPrompt } from './prompts';
import { callLLM, LLMCallOptions } from './provider';

export function parseQueryResponse(raw: string): QueryResult {
  const parsed = extractJson<Partial<QueryResult>>(raw);
  const conf = parsed.confidence;
  return {
    answer: String(parsed.answer ?? '').trim(),
    cited: Array.isArray(parsed.cited) ? parsed.cited.map(String) : [],
    confidence:
      conf === 'high' || conf === 'medium' || conf === 'low' ? conf : 'low',
  };
}

export async function runQuery(
  query: string,
  pages: WikiPage[],
  opts: LLMCallOptions,
): Promise<QueryResult> {
  const prompt = buildQueryPrompt({
    query,
    pages: pages.map((p) => ({
      title: p.title,
      kind: p.kind,
      body: p.body,
      facts: p.facts,
    })),
  });
  const { text } = await callLLM(prompt, { jsonMode: true, ...opts });
  return parseQueryResponse(text);
}
