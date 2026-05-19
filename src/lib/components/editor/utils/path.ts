export function normalizePath(p?: string): string {
  if (!p) return '';
  return p.replace(/\\/g, '/').replace(/\/+/g, '/');
}

export function isSamePath(a?: string, b?: string): boolean {
  return normalizePath(a) === normalizePath(b);
}
