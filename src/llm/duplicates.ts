import {
  ChatTurn,
  DuplicateChatResponse,
  DuplicateCheckResult,
  DuplicateGroup,
  DuplicatePageSuggestion,
  DuplicateRecommendation,
  DuplicateScanReport,
  IncomingPage,
  WikiPage,
} from '../domain/types';
import { extractJson } from '../utils/json';
import {
  CompactPage,
  buildChatSummaryPrompt,
  buildDuplicateChatPrompt,
  buildDuplicateCheckPrompt,
  buildDuplicateScanPrompt,
} from './prompts';
import { LLMCallOptions, callLLM } from './provider';

const ALLOWED_RECS: DuplicateRecommendation[] = ['merge', 'disambiguate', 'keep'];
export const SCAN_PAGE_CAP = 300;
export const CHAT_HISTORY_WORD_BUDGET = 1000;

export function compactPage(p: WikiPage): CompactPage {
  return {
    slug: p.slug,
    title: p.title,
    kind: p.kind,
    facts: p.facts,
    body: p.body,
  };
}

function parseSuggestions(raw: unknown): DuplicatePageSuggestion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const e = entry as Record<string, unknown>;
      const slug = typeof e.slug === 'string' ? e.slug : null;
      if (!slug) return null;
      const out: DuplicatePageSuggestion = { slug };
      if (typeof e.newTitle === 'string' && e.newTitle.trim()) out.newTitle = e.newTitle.trim();
      if (typeof e.newBody === 'string' && e.newBody.trim()) out.newBody = e.newBody.trim();
      if (Array.isArray(e.newFacts)) out.newFacts = e.newFacts.map(String);
      return out;
    })
    .filter((x): x is DuplicatePageSuggestion => x !== null);
}

function parseGroups(raw: unknown): DuplicateGroup[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const g = entry as Record<string, unknown>;
      const slugs = Array.isArray(g.slugs)
        ? g.slugs.map(String).filter((s) => s.length > 0)
        : [];
      if (slugs.length < 2) return null;
      const recommendation = ALLOWED_RECS.includes(g.recommendation as DuplicateRecommendation)
        ? (g.recommendation as DuplicateRecommendation)
        : 'keep';
      return {
        slugs,
        reason: typeof g.reason === 'string' ? g.reason : '',
        recommendation,
        suggestions: parseSuggestions(g.suggestions),
      } as DuplicateGroup;
    })
    .filter((x): x is DuplicateGroup => x !== null);
}

export function parseScanResponse(raw: string): DuplicateScanReport {
  const parsed = extractJson<{ groups?: unknown; notes?: unknown }>(raw);
  return {
    groups: parseGroups(parsed.groups),
    notes: typeof parsed.notes === 'string' ? parsed.notes : undefined,
  };
}

export async function runDuplicateScan(
  pages: WikiPage[],
  opts: LLMCallOptions,
): Promise<DuplicateScanReport> {
  if (pages.length > SCAN_PAGE_CAP) {
    throw new Error(
      `Wiki has ${pages.length} pages; AI scan is currently capped at ${SCAN_PAGE_CAP}.`,
    );
  }
  const compact = pages.map(compactPage);
  const { system, user, tool } = buildDuplicateScanPrompt(compact);
  const { text } = await callLLM(user, {
    maxTokens: 3000,
    jsonMode: true,
    system,
    tool,
    ...opts,
  });
  return parseScanResponse(text);
}

export function parseCheckResponse(raw: string): DuplicateCheckResult {
  const parsed = extractJson<Record<string, unknown>>(raw);
  const status = parsed.status === 'duplicate' ? 'duplicate' : 'unique';
  const existingSlug =
    typeof parsed.existingSlug === 'string' && parsed.existingSlug.trim()
      ? parsed.existingSlug.trim()
      : null;
  const reason = typeof parsed.reason === 'string' ? parsed.reason : '';
  const questions = Array.isArray(parsed.questions)
    ? parsed.questions.map(String).filter((s) => s.trim().length > 0)
    : [];
  let suggestion: DuplicateCheckResult['suggestion'] = null;
  if (parsed.suggestion && typeof parsed.suggestion === 'object') {
    const s = parsed.suggestion as Record<string, unknown>;
    const out: NonNullable<DuplicateCheckResult['suggestion']> = {};
    if (typeof s.newTitle === 'string' && s.newTitle.trim()) out.newTitle = s.newTitle.trim();
    if (typeof s.newBody === 'string' && s.newBody.trim()) out.newBody = s.newBody.trim();
    if (Array.isArray(s.newFacts)) out.newFacts = s.newFacts.map(String);
    if (out.newTitle || out.newBody || out.newFacts) suggestion = out;
  }
  return { status, existingSlug, reason, questions, suggestion };
}

export async function runDuplicateCheck(
  incoming: IncomingPage,
  existing: WikiPage[],
  opts: LLMCallOptions,
): Promise<DuplicateCheckResult> {
  const { system, user, tool } = buildDuplicateCheckPrompt({
    incoming: {
      title: incoming.title,
      kind: incoming.kind,
      body: incoming.body,
      facts: incoming.facts,
    },
    existing: existing.slice(0, SCAN_PAGE_CAP).map(compactPage),
  });
  const { text } = await callLLM(user, {
    maxTokens: 1200,
    jsonMode: true,
    system,
    tool,
    ...opts,
  });
  return parseCheckResponse(text);
}

export function parseChatResponse(raw: string): DuplicateChatResponse {
  const parsed = extractJson<Record<string, unknown>>(raw);
  const reply = typeof parsed.reply === 'string' ? parsed.reply : '';
  let revisedReport: DuplicateScanReport | null = null;
  if (parsed.revisedReport && typeof parsed.revisedReport === 'object') {
    const r = parsed.revisedReport as Record<string, unknown>;
    revisedReport = {
      groups: parseGroups(r.groups),
      notes: typeof r.notes === 'string' ? r.notes : undefined,
    };
  }
  return { reply, revisedReport };
}

export async function runDuplicateChat(params: {
  report: DuplicateScanReport;
  pages: WikiPage[];
  /** Full chat history including the latest user turn at the end. */
  history: ChatTurn[];
  opts: LLMCallOptions;
}): Promise<DuplicateChatResponse> {
  const { report, pages, history, opts } = params;
  const { system, user, tool, cacheSystem } = buildDuplicateChatPrompt({
    report,
    pages: pages.slice(0, SCAN_PAGE_CAP).map(compactPage),
    history,
  });
  const { text } = await callLLM(user, {
    maxTokens: 2500,
    jsonMode: true,
    system,
    tool,
    cacheSystem,
    ...opts,
  });
  return parseChatResponse(text);
}

export function chatWordCount(history: ChatTurn[]): number {
  return history.reduce((acc, t) => acc + t.content.trim().split(/\s+/).filter(Boolean).length, 0);
}

export async function summariseChat(
  history: ChatTurn[],
  opts: LLMCallOptions,
): Promise<string> {
  const { system, user } = buildChatSummaryPrompt(history);
  const { text } = await callLLM(user, {
    maxTokens: 600,
    jsonMode: false,
    system,
    ...opts,
  });
  return text.trim();
}

/**
 * Compress chat history when it exceeds the word budget, replacing prior turns
 * with a single assistant "summary" turn so future calls keep their context
 * but stay under token caps. Idempotent below the budget.
 */
export async function maybeCompressHistory(
  history: ChatTurn[],
  opts: LLMCallOptions,
): Promise<ChatTurn[]> {
  if (chatWordCount(history) <= CHAT_HISTORY_WORD_BUDGET) return history;
  const summary = await summariseChat(history, opts);
  return [{ role: 'assistant', content: `SUMMARY OF EARLIER DISCUSSION:\n${summary}` }];
}
