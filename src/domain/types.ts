export type PageKind = 'entity' | 'concept' | 'source';

export interface WikiPage {
  slug: string;
  title: string;
  kind: PageKind;
  body: string;
  facts: string[];
  links: string[];
  sources: string[];
  userEdited: boolean;
  filedFromQuery?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IncomingPage {
  title: string;
  kind: PageKind;
  body: string;
  facts: string[];
  links: string[];
}

export interface SourceLogEntry {
  id: string;
  slug: string;
  kind: 'text' | 'url';
  title: string;
  content: string | null;
  url: string | null;
  timestamp: string;
  processed: boolean;
  processing: boolean;
  processedAt?: string;
  pagesCreated?: number;
  error?: string | null;
}

export interface ExportState {
  version: number;
  exportedAt: string;
  pages: WikiPage[];
  log: SourceLogEntry[];
}

export interface QueryResult {
  answer: string;
  cited: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface LintResults {
  orphans: WikiPage[];
  thin: WikiPage[];
  stale: WikiPage[];
  duplicateGroups: WikiPage[][];
}

export type DuplicateRecommendation = 'merge' | 'disambiguate' | 'keep';

export interface DuplicatePageSuggestion {
  slug: string;
  newTitle?: string;
  newBody?: string;
  newFacts?: string[];
}

export interface DuplicateGroup {
  slugs: string[];
  reason: string;
  recommendation: DuplicateRecommendation;
  suggestions: DuplicatePageSuggestion[];
}

export interface DuplicateScanReport {
  groups: DuplicateGroup[];
  notes?: string;
}

export type DuplicateCheckStatus = 'unique' | 'duplicate';

export interface DuplicateCheckSuggestion {
  newTitle?: string;
  newBody?: string;
  newFacts?: string[];
}

export interface DuplicateCheckResult {
  status: DuplicateCheckStatus;
  existingSlug: string | null;
  reason: string;
  questions: string[];
  suggestion: DuplicateCheckSuggestion | null;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface DuplicateChatResponse {
  reply: string;
  revisedReport: DuplicateScanReport | null;
}
