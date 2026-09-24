/**
 * The part of a URI path below a folder's URI path (`/` separators), or undefined if it is not below it.
 * The drive letter is compared without case: on Windows, VS Code's file search reports `/c:/…` for a
 * folder opened as `/C:/…`.
 */
export function relativeUriPath(folderPath: string, path: string): string | undefined {
  const base = lowerDriveLetter(folderPath.endsWith('/') ? folderPath : `${folderPath}/`);
  const target = lowerDriveLetter(path);
  return target.length > base.length && target.startsWith(base) ? target.slice(base.length) : undefined;
}

function lowerDriveLetter(path: string): string {
  return path.replace(/^\/([A-Za-z]):/, (_, letter: string) => `/${letter.toLowerCase()}:`);
}
