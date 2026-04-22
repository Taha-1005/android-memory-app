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

export interface Settings {
  anthropicApiKey: string | null;
  model: string;
  maxTokens: number;
  lastBackupAt?: string;
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
