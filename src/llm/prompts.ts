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

export function buildIngestPrompt(params: {
  title: string;
  kind: 'text' | 'url';
  content: string | null;
  url: string | null;
}): string {
  const header = `SOURCE TITLE: ${params.title}\n\nSOURCE KIND: ${
    params.kind === 'text' ? 'pasted text' : 'url'
  }\n\n`;
  const body =
    params.kind === 'text'
      ? `CONTENT:\n${params.content ?? ''}`
      : `URL: ${params.url ?? ''}\n\nNote: You cannot fetch this URL. Summarize from your own knowledge if you recognize it. Otherwise return only a source page acknowledging the capture.`;
  return `${INGEST_SYSTEM}\n\n${header}${body}\n\n---\n\nReturn JSON now.`;
}

export function buildQueryPrompt(params: {
  query: string;
  pages: Array<{ title: string; kind: string; body: string; facts: string[] }>;
}): string {
  const blocks = params.pages
    .map(
      (p) =>
        `### ${p.title} (${p.kind})\n${p.body}\n\nFacts:\n${p.facts
          .map((f) => `- ${f}`)
          .join('\n')}`,
    )
    .join('\n\n');
  return `You are the query engine for a personal wiki. Answer the user's question using ONLY the wiki pages provided below. If the pages don't cover the question, say so plainly — do not invent facts.

Return ONLY valid JSON:
{
  "answer": "Your answer in 1-3 short paragraphs. Use [[Page Title]] wikilinks when referencing pages.",
  "cited": ["Page Title", "..."],
  "confidence": "high" | "medium" | "low"
}

If no pages are relevant, set confidence="low" and say so in the answer.

WIKI PAGES:

${blocks}

---

QUESTION: ${params.query}

Return JSON now.`;
}

export function buildMergePrompt(params: {
  a: { title: string; kind: string; body: string; facts: string[]; links: string[] };
  b: { title: string; kind: string; body: string; facts: string[]; links: string[] };
}): string {
  const { a, b } = params;
  return `You are helping merge two wiki pages that describe the same thing. Combine them into a single clean page.

Return ONLY valid JSON:
{
  "title": "Merged page title",
  "kind": "entity" | "concept" | "source",
  "body": "Merged markdown body with [[wikilinks]]. Under 200 words.",
  "facts": ["atomic fact", "..."],
  "links": ["Title", "..."]
}

PAGE A:
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

Return JSON now.`;
}
