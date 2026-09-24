/**
 * The part of a URI path below a folder's URI path (`/` separators), `''` for the folder itself (as for
 * roots), or undefined if it is not inside the folder. The result keeps the casing of `path`.
 *
 * The drive letter is always compared without case: on Windows, VS Code's file search reports `/c:/…` for a
 * folder opened as `/C:/…`. With `ignoreCase`, the whole folder path is (for case-insensitive file systems,
 * where a folder dialog returns the casing on disk and the workspace folder keeps the casing it was opened with).
 */
export function relativeUriPath(folderPath: string, path: string, ignoreCase = false): string | undefined {
  const base = folderPath.endsWith('/') ? folderPath : `${folderPath}/`;
  const target = path.endsWith('/') ? path : `${path}/`;
  const head = target.slice(0, base.length);
  const same = ignoreCase
    ? head.toLowerCase() === base.toLowerCase()
    : lowerDriveLetter(head) === lowerDriveLetter(base);
  return target.length >= base.length && same ? target.slice(base.length, -1) : undefined;
}

function lowerDriveLetter(path: string): string {
  return path.replace(/^\/([A-Za-z]):/, (_, letter: string) => `/${letter.toLowerCase()}:`);
}
