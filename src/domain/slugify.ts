export function slugify(s: string): string {
  const slug = (s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return slug || `page-${Date.now()}`;
}
