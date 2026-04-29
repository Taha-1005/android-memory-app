import { AnthropicToolDef } from './client';

export interface CompactPage {
  slug: string;
  title: string;
  kind: string;
  facts: string[];
  body: string;
}

/**
 * The shape returned by every prompt builder. `system` and `user` separate
 * persona/schema from data so Anthropic can use the dedicated `system` field;
 * Gemini receives the same content concatenated (handled by callLLM). `tool`
 * is honoured only by Anthropic (forces tool_use). `cacheSystem` opts the
 * system block into Anthropic's prompt cache.
 */
export interface BuiltPrompt {
  system: string;
  user: string;
  tool?: AnthropicToolDef;
  cacheSystem?: boolean;
}

const STRING = { type: 'string' } as const;
const STRING_ARRAY = { type: 'array', items: { type: 'string' } } as const;

// ---------------------------------------------------------------------------
// Ingest

export const INGEST_SYSTEM = `You are the ingest engine for a personal wiki.

Given a raw source, extract a small set of wiki pages. Each page represents one ENTITY (person, place, product, org), CONCEPT (idea, term, framework), or SOURCE (the raw input itself).

Return ONLY valid JSON. No prose, no markdown fences.

Schema:
{
  "pages": [
    {
      "title": "Human readable title",
      "kind": "entity" | "concept" | "source",
      "body": "Concise markdown summary. Use [[Other Page Title]] wikilinks.",
      "facts": ["short atomic fact", "..."],
      "links": ["Other Page Title", "..."]
    }
  ]
}

Rules:
- 1-6 pages per source. Fewer, higher-quality pages preferred.
- Always include ONE page with kind="source" preserving provenance.
- Entity/concept pages must read as standalone wiki entries, not summaries of this specific source.
- Use [[wikilinks]] inside bodies.
- Facts are atomic and verifiable. Skip opinions.
- Bodies under ~200 words.
- If input is a URL you don't recognize, return ONLY the source page.`;

export const INGEST_TOOL: AnthropicToolDef = {
  name: 'emit_pages',
  description: 'Emit the extracted wiki pages.',
  input_schema: {
    type: 'object',
    required: ['pages'],
    properties: {
      pages: {
        type: 'array',
        items: {
          type: 'object',
          required: ['title', 'kind', 'body', 'facts', 'links'],
          properties: {
            title: STRING,
            kind: { type: 'string', enum: ['entity', 'concept', 'source'] },
            body: STRING,
            facts: STRING_ARRAY,
            links: STRING_ARRAY,
          },
        },
      },
    },
  },
};

export function buildIngestPrompt(params: {
  title: string;
  kind: 'text' | 'url';
  content: string | null;
  url: string | null;
}): BuiltPrompt {
  const header = `SOURCE TITLE: ${params.title}\n\nSOURCE KIND: ${
    params.kind === 'text' ? 'pasted text' : 'url'
  }\n\n`;
  const body =
    params.kind === 'text'
      ? `CONTENT:\n${params.content ?? ''}`
      : `URL: ${params.url ?? ''}\n\nNote: You cannot fetch this URL. Summarize from your own knowledge if you recognize it. Otherwise return only a source page acknowledging the capture.`;
  return {
    system: INGEST_SYSTEM,
    user: `${header}${body}\n\n---\n\nReturn JSON now.`,
    tool: INGEST_TOOL,
  };
}

// ---------------------------------------------------------------------------
// Query

const QUERY_SYSTEM = `You are the query engine for a personal wiki. Answer the user's question using ONLY the wiki pages provided. If the pages don't cover the question, say so plainly — do not invent facts.

Return ONLY valid JSON:
{
  "answer": "Your answer in 1-3 short paragraphs. Use [[Page Title]] wikilinks when referencing pages.",
  "cited": ["Page Title", "..."],
  "confidence": "high" | "medium" | "low"
}

If no pages are relevant, set confidence="low" and say so in the answer.`;

export const QUERY_TOOL: AnthropicToolDef = {
  name: 'emit_answer',
  description: 'Emit the wiki answer.',
  input_schema: {
    type: 'object',
    required: ['answer', 'cited', 'confidence'],
    properties: {
      answer: STRING,
      cited: STRING_ARRAY,
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    },
  },
};

export function buildQueryPrompt(params: {
  query: string;
  pages: Array<{ title: string; kind: string; body: string; facts: string[] }>;
}): BuiltPrompt {
  const blocks = params.pages
    .map(
      (p) =>
        `### ${p.title} (${p.kind})\n${p.body}\n\nFacts:\n${p.facts.map((f) => `- ${f}`).join('\n')}`,
    )
    .join('\n\n');
  return {
    system: QUERY_SYSTEM,
    user: `WIKI PAGES:\n\n${blocks}\n\n---\n\nQUESTION: ${params.query}\n\nReturn JSON now.`,
    tool: QUERY_TOOL,
  };
}

// ---------------------------------------------------------------------------
// Merge

const MERGE_SYSTEM = `You are helping merge two wiki pages that describe the same thing. Combine them into a single clean page.

Return ONLY valid JSON:
{
  "title": "Merged page title",
  "kind": "entity" | "concept" | "source",
  "body": "Merged markdown body with [[wikilinks]]. Under 200 words.",
  "facts": ["atomic fact", "..."],
  "links": ["Title", "..."]
}`;

export const MERGE_TOOL: AnthropicToolDef = {
  name: 'emit_merged_page',
  description: 'Emit the merged page.',
  input_schema: {
    type: 'object',
    required: ['title', 'kind', 'body', 'facts', 'links'],
    properties: {
      title: STRING,
      kind: { type: 'string', enum: ['entity', 'concept', 'source'] },
      body: STRING,
      facts: STRING_ARRAY,
      links: STRING_ARRAY,
    },
  },
};

export function buildMergePrompt(params: {
  a: { title: string; kind: string; body: string; facts: string[]; links: string[] };
  b: { title: string; kind: string; body: string; facts: string[]; links: string[] };
}): BuiltPrompt {
  const { a, b } = params;
  return {
    system: MERGE_SYSTEM,
    user: `PAGE A:
Title: ${a.title}
Kind: ${a.kind}
Body: ${a.body}
Facts: ${a.facts.join('; ')}
Links: ${a.links.join(', ')}

PAGE B:
Title: ${b.title}
Kind: ${b.kind}
Body: ${b.body}
Facts: ${b.facts.join('; ')}
Links: ${b.links.join(', ')}

Return JSON now.`,
    tool: MERGE_TOOL,
  };
}

// ---------------------------------------------------------------------------
// Duplicate scan

const SCAN_SCHEMA = `Schema:
{
  "groups": [
    {
      "slugs": ["page-slug-a", "page-slug-b"],
      "reason": "Why these pages look like duplicates of each other.",
      "recommendation": "merge" | "disambiguate" | "keep",
      "suggestions": [
        {
          "slug": "page-slug-a",
          "newTitle": "More specific title (optional)",
          "newBody": "Rewritten body that disambiguates (optional)",
          "newFacts": ["fact a", "fact b"]
        }
      ]
    }
  ],
  "notes": "Optional one-sentence overall comment."
}`;

const SCAN_SYSTEM = `You are a duplicate-detection assistant for a personal wiki.

Inspect the pages provided and identify groups of pages that describe the same underlying thing. Use SEMANTIC reasoning, not just title overlap. Two pages that share a title but describe genuinely different entities (e.g. "Apple" the company vs the fruit) are NOT duplicates.

For each duplicate group, choose ONE recommendation:
- "merge": these are clearly the same thing — fold them into one page.
- "disambiguate": they collide but are distinct — propose specific title/body edits per page so they no longer look like duplicates.
- "keep": you inspected this pair and concluded they are NOT duplicates — include this so the user can see you considered them and ruled them out.

When recommending "disambiguate", you MUST provide a "suggestions" entry per slug in the group with concrete proposed edits (newTitle, newBody, or newFacts). When recommending "merge" or "keep", "suggestions" may be empty.

Return ONLY valid JSON. No prose, no markdown fences.

${SCAN_SCHEMA}`;

const SCAN_GROUP_SCHEMA = {
  type: 'object',
  required: ['slugs', 'reason', 'recommendation', 'suggestions'],
  properties: {
    slugs: STRING_ARRAY,
    reason: STRING,
    recommendation: { type: 'string', enum: ['merge', 'disambiguate', 'keep'] },
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['slug'],
        properties: {
          slug: STRING,
          newTitle: STRING,
          newBody: STRING,
          newFacts: STRING_ARRAY,
        },
      },
    },
  },
} as const;

export const DUP_SCAN_TOOL: AnthropicToolDef = {
  name: 'emit_duplicate_report',
  description: 'Emit the duplicate-scan report.',
  input_schema: {
    type: 'object',
    required: ['groups'],
    properties: {
      groups: { type: 'array', items: SCAN_GROUP_SCHEMA as unknown as Record<string, unknown> },
      notes: STRING,
    },
  },
};

export function buildDuplicateScanPrompt(pages: CompactPage[]): BuiltPrompt {
  const corpus = pages
    .map(
      (p) =>
        `- slug: ${p.slug}\n  title: ${p.title}\n  kind: ${p.kind}\n  facts: ${p.facts.join('; ')}\n  body: ${p.body.replace(/\s+/g, ' ').slice(0, 200)}`,
    )
    .join('\n');
  return {
    system: SCAN_SYSTEM,
    user: `PAGES (${pages.length}):\n${corpus}\n\nReturn JSON now.`,
    tool: DUP_SCAN_TOOL,
  };
}

// ---------------------------------------------------------------------------
// Duplicate check (per incoming page)

const CHECK_SCHEMA = `Schema:
{
  "status": "unique" | "duplicate",
  "existingSlug": "slug-of-best-match-or-null",
  "reason": "One short paragraph: why is this a duplicate, or why not.",
  "questions": ["Clarifying question 1?", "Clarifying question 2?"],
  "suggestion": {
    "newTitle": "More specific title (optional)",
    "newBody": "Rewritten body that disambiguates (optional)",
    "newFacts": ["fact a", "fact b"]
  }
}`;

const CHECK_SYSTEM = `You are a duplicate-detection assistant for a personal wiki.

Decide whether the INCOMING page describes the same underlying thing as any EXISTING page. Use SEMANTIC reasoning, not just title overlap.

If the incoming page is clearly the same thing as an existing one, status="duplicate" and set existingSlug to the best match.
If it might be confused with an existing page but is actually different (e.g. a second pair of socks the user owns), status="unique" but populate "questions" with clarifying questions the user could answer to make the new page more specific, and a "suggestion" with concrete proposed edits.
If there is no risk of confusion, status="unique", existingSlug=null, questions=[], suggestion=null.

Return ONLY valid JSON. No prose, no markdown fences.

${CHECK_SCHEMA}`;

export const DUP_CHECK_TOOL: AnthropicToolDef = {
  name: 'emit_duplicate_check',
  description: 'Emit the duplicate check verdict.',
  input_schema: {
    type: 'object',
    required: ['status', 'existingSlug', 'reason', 'questions', 'suggestion'],
    properties: {
      status: { type: 'string', enum: ['unique', 'duplicate'] },
      existingSlug: { type: ['string', 'null'] },
      reason: STRING,
      questions: STRING_ARRAY,
      suggestion: {
        type: ['object', 'null'],
        properties: {
          newTitle: STRING,
          newBody: STRING,
          newFacts: STRING_ARRAY,
        },
      },
    },
  },
};

export function buildDuplicateCheckPrompt(params: {
  incoming: { title: string; kind: string; body: string; facts: string[] };
  existing: CompactPage[];
}): BuiltPrompt {
  const { incoming, existing } = params;
  const corpus = existing
    .map(
      (p) =>
        `- slug: ${p.slug}\n  title: ${p.title}\n  kind: ${p.kind}\n  facts: ${p.facts.join('; ')}\n  body: ${p.body.replace(/\s+/g, ' ').slice(0, 200)}`,
    )
    .join('\n');
  return {
    system: CHECK_SYSTEM,
    user: `INCOMING:
Title: ${incoming.title}
Kind: ${incoming.kind}
Facts: ${incoming.facts.join('; ')}
Body: ${incoming.body.replace(/\s+/g, ' ').slice(0, 400)}

EXISTING PAGES (${existing.length}):
${corpus || '(none)'}

Return JSON now.`,
    tool: DUP_CHECK_TOOL,
  };
}

// ---------------------------------------------------------------------------
// Duplicate chat — system carries the static page corpus so we can mark it
// cacheable on Anthropic; user holds the changing report + transcript.

const CHAT_PERSONA = `You are the same duplicate-detection assistant continuing a conversation about a duplicate-scan plan you produced earlier.

The user may push back on your recommendations, ask follow-up questions, or give context (e.g. "those two socks are different pairs"). Update the plan when the new context warrants it. Do NOT silently invent new pages.

Respond to the LATEST user turn at the bottom of the transcript.

Return ONLY valid JSON:
{
  "reply": "Your conversational reply to the user, 1-3 short paragraphs.",
  "revisedReport": null OR a full updated scan report in the same shape as the original (groups + optional notes). Return null if your reply alone is enough and the plan does not change.
}`;

export const DUP_CHAT_TOOL: AnthropicToolDef = {
  name: 'emit_chat_turn',
  description: 'Emit a conversational reply, optionally with a revised plan.',
  input_schema: {
    type: 'object',
    required: ['reply', 'revisedReport'],
    properties: {
      reply: STRING,
      revisedReport: {
        type: ['object', 'null'],
        properties: {
          groups: { type: 'array', items: SCAN_GROUP_SCHEMA as unknown as Record<string, unknown> },
          notes: STRING,
        },
      },
    },
  },
};

export function buildDuplicateChatPrompt(params: {
  report: { groups: unknown[]; notes?: string };
  pages: CompactPage[];
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}): BuiltPrompt {
  const { report, pages, history } = params;
  const corpus = pages
    .map(
      (p) =>
        `- ${p.slug}: ${p.title} (${p.kind}) — facts: ${p.facts.slice(0, 4).join('; ')}`,
    )
    .join('\n');
  const transcript = history.map((t) => `${t.role.toUpperCase()}: ${t.content}`).join('\n');
  return {
    system: `${CHAT_PERSONA}\n\nPAGE CORPUS (compact):\n${corpus}`,
    user: `ORIGINAL / CURRENT PLAN:\n${JSON.stringify(report)}\n\nCONVERSATION:\n${transcript || '(no prior turns)'}\n\nReturn JSON now.`,
    tool: DUP_CHAT_TOOL,
    cacheSystem: true,
  };
}

// ---------------------------------------------------------------------------
// Chat summary — free-form text, no tool

export function buildChatSummaryPrompt(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
): BuiltPrompt {
  const transcript = history.map((t) => `${t.role.toUpperCase()}: ${t.content}`).join('\n');
  return {
    system: `Summarise the chat between a user and a duplicate-detection assistant. Preserve every concrete decision, constraint, or correction the user has made. The summary will REPLACE the chat history for future turns, so anything you drop is lost.

Return ONLY plain text, 1-3 short paragraphs. No JSON, no markdown.`,
    user: `CONVERSATION:\n${transcript}`,
  };
}
