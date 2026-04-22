import { mergeStates } from '../../src/domain/mergeStates';
import { ExportState, WikiPage } from '../../src/domain/types';

const page = (slug: string, updatedAt: string, body = 'b'): WikiPage => ({
  slug,
  title: slug,
  kind: 'concept',
  body,
  facts: [],
  links: [],
  sources: [],
  userEdited: false,
  createdAt: updatedAt,
  updatedAt,
});

describe('mergeStates', () => {
  it('newest updatedAt wins when the same slug appears in both sides', () => {
    const local: ExportState = {
      version: 1,
      exportedAt: '',
      pages: [page('a', '2024-01-01T00:00:00.000Z', 'old')],
      log: [],
    };
    const remote: ExportState = {
      version: 1,
      exportedAt: '',
      pages: [page('a', '2024-06-01T00:00:00.000Z', 'new')],
      log: [],
    };
    const merged = mergeStates(local, remote);
    expect(merged.pages.find((p) => p.slug === 'a')?.body).toBe('new');
  });

  it('keeps non-overlapping pages from both sides', () => {
    const local: ExportState = {
      version: 1, exportedAt: '',
      pages: [page('a', '2024-01-01T00:00:00.000Z')], log: [],
    };
    const remote: ExportState = {
      version: 1, exportedAt: '',
      pages: [page('b', '2024-01-01T00:00:00.000Z')], log: [],
    };
    const merged = mergeStates(local, remote);
    expect(merged.pages.map((p) => p.slug).sort()).toEqual(['a', 'b']);
  });
});
