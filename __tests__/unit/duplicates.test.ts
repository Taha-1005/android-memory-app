import {
  CHAT_HISTORY_WORD_BUDGET,
  chatWordCount,
  maybeCompressHistory,
  parseChatResponse,
  parseCheckResponse,
  parseScanResponse,
} from '../../src/llm/duplicates';
import { ChatTurn } from '../../src/domain/types';
import {
  buildDuplicateChatPrompt,
  buildDuplicateCheckPrompt,
  buildDuplicateScanPrompt,
  buildChatSummaryPrompt,
} from '../../src/llm/prompts';

describe('buildDuplicateScanPrompt', () => {
  it('puts persona/schema in system and the corpus in user', () => {
    const p = buildDuplicateScanPrompt([
      { slug: 'a', title: 'Apple Inc', kind: 'entity', facts: ['fa'], body: 'b' },
      { slug: 'apple', title: 'Apple', kind: 'concept', facts: ['fb'], body: 'b2' },
    ]);
    expect(p.user).toMatch(/Apple Inc/);
    expect(p.user).toMatch(/slug: a/);
    expect(p.system).toMatch(/duplicate-detection assistant/);
    expect(p.system).toMatch(/"recommendation"/);
    expect(p.tool?.name).toBe('emit_duplicate_report');
  });
});

describe('parseScanResponse', () => {
  it('parses a well-formed report', () => {
    const raw = JSON.stringify({
      groups: [
        {
          slugs: ['apple', 'apple-inc'],
          reason: 'same company',
          recommendation: 'merge',
          suggestions: [],
        },
      ],
      notes: 'looks good',
    });
    const r = parseScanResponse(raw);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].slugs).toEqual(['apple', 'apple-inc']);
    expect(r.groups[0].recommendation).toBe('merge');
    expect(r.notes).toBe('looks good');
  });

  it('drops groups with fewer than two slugs', () => {
    const raw = JSON.stringify({
      groups: [
        { slugs: ['x'], reason: '', recommendation: 'merge', suggestions: [] },
        { slugs: ['a', 'b'], reason: '', recommendation: 'keep', suggestions: [] },
      ],
    });
    const r = parseScanResponse(raw);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].recommendation).toBe('keep');
  });

  it('coerces an unknown recommendation to the safe default "keep"', () => {
    const raw = JSON.stringify({
      groups: [{ slugs: ['a', 'b'], reason: '', recommendation: 'totally-bogus', suggestions: [] }],
    });
    const r = parseScanResponse(raw);
    expect(r.groups[0].recommendation).toBe('keep');
  });

  it('parses suggestions and ignores entries without slugs', () => {
    const raw = JSON.stringify({
      groups: [
        {
          slugs: ['a', 'b'],
          reason: 'r',
          recommendation: 'disambiguate',
          suggestions: [
            { slug: 'a', newTitle: 'A (one)', newFacts: ['x'] },
            { newTitle: 'orphan' },
          ],
        },
      ],
    });
    const r = parseScanResponse(raw);
    expect(r.groups[0].suggestions).toHaveLength(1);
    expect(r.groups[0].suggestions[0]).toEqual({
      slug: 'a',
      newTitle: 'A (one)',
      newFacts: ['x'],
    });
  });
});

describe('buildDuplicateCheckPrompt + parseCheckResponse', () => {
  it('builds a prompt with both incoming and existing', () => {
    const p = buildDuplicateCheckPrompt({
      incoming: { title: 'Sock', kind: 'entity', body: 'wool', facts: ['warm'] },
      existing: [{ slug: 'sock', title: 'Sock', kind: 'entity', facts: ['cotton'], body: 'old' }],
    });
    expect(p.user).toMatch(/INCOMING/);
    expect(p.user).toMatch(/EXISTING PAGES/);
    expect(p.user).toMatch(/wool/);
    expect(p.tool?.name).toBe('emit_duplicate_check');
  });

  it('parses unique with no suggestion or questions', () => {
    const r = parseCheckResponse(
      JSON.stringify({
        status: 'unique',
        existingSlug: null,
        reason: 'totally different',
        questions: [],
        suggestion: null,
      }),
    );
    expect(r.status).toBe('unique');
    expect(r.existingSlug).toBeNull();
    expect(r.questions).toEqual([]);
    expect(r.suggestion).toBeNull();
  });

  it('parses duplicate with a suggestion', () => {
    const r = parseCheckResponse(
      JSON.stringify({
        status: 'duplicate',
        existingSlug: 'sock',
        reason: 'same pair',
        questions: ['Is this the wool pair?'],
        suggestion: { newTitle: 'Wool sock', newFacts: ['wool'] },
      }),
    );
    expect(r.status).toBe('duplicate');
    expect(r.existingSlug).toBe('sock');
    expect(r.questions).toEqual(['Is this the wool pair?']);
    expect(r.suggestion).toEqual({ newTitle: 'Wool sock', newFacts: ['wool'] });
  });

  it('drops a suggestion that has no concrete fields', () => {
    const r = parseCheckResponse(
      JSON.stringify({ status: 'unique', suggestion: { newTitle: '', newBody: '' } }),
    );
    expect(r.suggestion).toBeNull();
  });
});

describe('chat helpers', () => {
  it('counts words across turns', () => {
    expect(chatWordCount([{ role: 'user', content: 'hello world' }])).toBe(2);
    expect(
      chatWordCount([
        { role: 'user', content: 'one two three' },
        { role: 'assistant', content: 'four five' },
      ]),
    ).toBe(5);
  });

  it('parseChatResponse handles a reply-only turn', () => {
    const r = parseChatResponse(JSON.stringify({ reply: 'noted', revisedReport: null }));
    expect(r.reply).toBe('noted');
    expect(r.revisedReport).toBeNull();
  });

  it('parseChatResponse picks up a revised report', () => {
    const r = parseChatResponse(
      JSON.stringify({
        reply: 'updated',
        revisedReport: {
          groups: [
            {
              slugs: ['a', 'b'],
              reason: 'still dupes',
              recommendation: 'merge',
              suggestions: [],
            },
          ],
        },
      }),
    );
    expect(r.revisedReport).not.toBeNull();
    expect(r.revisedReport!.groups[0].recommendation).toBe('merge');
  });

  it('buildChatSummaryPrompt embeds turns and forbids JSON', () => {
    const s = buildChatSummaryPrompt([
      { role: 'user', content: 'context' },
      { role: 'assistant', content: 'ack' },
    ]);
    expect(s.user).toMatch(/USER: context/);
    expect(s.user).toMatch(/ASSISTANT: ack/);
    expect(s.system).toMatch(/plain text/i);
    expect(s.tool).toBeUndefined();
  });

  it('buildDuplicateChatPrompt embeds report+history (latest at end), caches system, includes corpus in system', () => {
    const p = buildDuplicateChatPrompt({
      report: { groups: [], notes: 'n' },
      pages: [{ slug: 's', title: 't', kind: 'entity', facts: ['f'], body: 'b' }],
      history: [
        { role: 'user', content: 'q1' },
        { role: 'assistant', content: 'a1' },
        { role: 'user', content: 'follow-up' },
      ],
    });
    expect(p.user).toMatch(/CURRENT PLAN/);
    expect(p.user).toMatch(/USER: q1/);
    expect(p.user).toMatch(/ASSISTANT: a1/);
    expect(p.user).toMatch(/USER: follow-up/);
    // Page corpus belongs in the cacheable system block, not the user turn.
    expect(p.system).toMatch(/PAGE CORPUS/);
    expect(p.cacheSystem).toBe(true);
    // The latest user turn must appear exactly once in the user prompt.
    const occurrences = p.user.split('follow-up').length - 1;
    expect(occurrences).toBe(1);
  });

  it('CHAT_HISTORY_WORD_BUDGET is 1000', () => {
    expect(CHAT_HISTORY_WORD_BUDGET).toBe(1000);
  });
});

describe('maybeCompressHistory', () => {
  function jsonResponse(body: unknown, status = 200): Response {
    return {
      ok: status < 400,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  }

  // History below budget passes through untouched without an LLM call.
  it('returns input unchanged when under the budget', async () => {
    const fetchImpl = jest.fn();
    const history: ChatTurn[] = [{ role: 'user', content: 'short' }];
    const out = await maybeCompressHistory(history, {
      provider: 'anthropic',
      apiKey: 'k',
      fetchImpl,
      timeoutMs: 1000,
    });
    expect(out).toBe(history);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('replaces history with a single summary turn when above budget', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({ content: [{ type: 'text', text: 'condensed.' }] }),
    );
    // Build > 1000 words.
    const long = 'word '.repeat(1100).trim();
    const history: ChatTurn[] = [
      { role: 'user', content: long },
      { role: 'assistant', content: 'ok' },
    ];
    const out = await maybeCompressHistory(history, {
      provider: 'anthropic',
      apiKey: 'k',
      fetchImpl,
      timeoutMs: 1000,
    });
    expect(out).toHaveLength(1);
    expect(out[0].role).toBe('assistant');
    expect(out[0].content).toMatch(/SUMMARY OF EARLIER DISCUSSION/);
    expect(out[0].content).toMatch(/condensed\./);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
