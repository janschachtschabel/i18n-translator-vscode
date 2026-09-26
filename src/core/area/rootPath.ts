/**
 * Canonical form of a workspace-relative root folder: `/` separators, no `.` segments, no leading,
 * duplicate or trailing slashes; the workspace folder itself is `''`. Returns undefined for paths that
 * are absolute or leave the workspace folder (`..`), since the host must never read outside it.
 */
export function normalizeRoot(root: string): string | undefined {
  const path = root.replace(/\\/g, '/');
  if (path.startsWith('/') || /^[a-z]:/i.test(path)) {
    return undefined;
  }
  const segments = path.split('/').filter((segment) => segment !== '' && segment !== '.');
  return segments.includes('..') ? undefined : segments.join('/');
}

/**
 * A relative path of named segments with `/` separators: no empty, `.` or `..` segment, no backslash and no
 * drive letter. Paths that are joined to a folder must be plain, or they could lead out of it.
 */
export function isPlainRelativePath(path: string): boolean {
  return path
    .split('/')
    .every((segment) => segment !== '' && segment !== '.' && segment !== '..' && !/[\\:]/.test(segment));
}
