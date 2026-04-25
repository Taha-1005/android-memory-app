import { IncomingPage, PageKind } from '../domain/types';
import { extractJson } from '../utils/json';
import { buildIngestPrompt } from './prompts';
import { callLLM, LLMCallOptions } from './provider';

export interface IngestInput {
  title: string;
  kind: 'text' | 'url';
  content: string | null;
  url: string | null;
}

export interface IngestResponse {
  pages: IncomingPage[];
}

const ALLOWED_KINDS: PageKind[] = ['entity', 'concept', 'source'];

export function parseIngestResponse(raw: string): IncomingPage[] {
  const parsed = extractJson<Partial<IngestResponse>>(raw);
  const pages = Array.isArray(parsed.pages) ? parsed.pages : [];
  if (pages.length === 0) throw new Error('LLM returned zero pages.');
  return pages.map((p) => {
    const kind: PageKind = ALLOWED_KINDS.includes(p.kind as PageKind)
      ? (p.kind as PageKind)
      : 'concept';
    return {
      title: String(p.title ?? '').trim() || 'Untitled',
      kind,
      body: String(p.body ?? ''),
      facts: Array.isArray(p.facts) ? p.facts.map(String) : [],
      links: Array.isArray(p.links) ? p.links.map(String) : [],
    };
  });
}

export async function runIngest(
  input: IngestInput,
  opts: LLMCallOptions,
): Promise<IncomingPage[]> {
  const prompt = buildIngestPrompt(input);
  const { text } = await callLLM(prompt, { jsonMode: true, ...opts });
  return parseIngestResponse(text);
}
