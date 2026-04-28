import { IncomingPage, WikiPage, PageKind } from '../domain/types';
import { extractJson } from '../utils/json';
import { buildMergePrompt } from './prompts';
import { callLLM, LLMCallOptions } from './provider';

const ALLOWED_KINDS: PageKind[] = ['entity', 'concept', 'source'];

export function parseMergeResponse(raw: string): IncomingPage {
  const parsed = extractJson<Partial<IncomingPage>>(raw);
  const kind: PageKind = ALLOWED_KINDS.includes(parsed.kind as PageKind)
    ? (parsed.kind as PageKind)
    : 'concept';
  return {
    title: String(parsed.title ?? '').trim() || 'Merged',
    kind,
    body: String(parsed.body ?? ''),
    facts: Array.isArray(parsed.facts) ? parsed.facts.map(String) : [],
    links: Array.isArray(parsed.links) ? parsed.links.map(String) : [],
  };
}

export async function runMerge(
  a: WikiPage,
  b: WikiPage,
  opts: LLMCallOptions,
): Promise<IncomingPage> {
  const prompt = buildMergePrompt({ a, b });
  const { text } = await callLLM(prompt, { maxTokens: 1500, jsonMode: true, ...opts });
  return parseMergeResponse(text);
}
