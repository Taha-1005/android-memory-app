import { ExportState, SourceLogEntry, WikiPage } from './types';
import { nowIso } from '../utils/time';

export function mergeStates(local: ExportState, remote: ExportState): ExportState {
  const pagesBySlug = new Map<string, WikiPage>();
  for (const p of local.pages) pagesBySlug.set(p.slug, p);
  for (const p of remote.pages) {
    const existing = pagesBySlug.get(p.slug);
    if (!existing || new Date(p.updatedAt) > new Date(existing.updatedAt)) {
      pagesBySlug.set(p.slug, p);
    }
  }
  const logById = new Map<string, SourceLogEntry>();
  for (const e of remote.log) logById.set(e.id, e);
  for (const e of local.log) {
    const existing = logById.get(e.id);
    if (!existing || new Date(e.timestamp) >= new Date(existing.timestamp)) {
      logById.set(e.id, e);
    }
  }
  return {
    version: 1,
    exportedAt: nowIso(),
    pages: Array.from(pagesBySlug.values()),
    log: Array.from(logById.values()).sort((a, b) =>
      a.timestamp < b.timestamp ? 1 : -1,
    ),
  };
}
