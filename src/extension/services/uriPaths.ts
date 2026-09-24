/**
 * The part of a URI path below a folder's URI path (`/` separators), `''` for the folder itself (as for
 * roots), or undefined if it is not inside the folder. The drive letter is compared without case: on
 * Windows, VS Code's file search reports `/c:/…` for a folder opened as `/C:/…`.
 */
export function relativeUriPath(folderPath: string, path: string): string | undefined {
  const base = lowerDriveLetter(folderPath.endsWith('/') ? folderPath : `${folderPath}/`);
  const target = lowerDriveLetter(path.endsWith('/') ? path : `${path}/`);
  return target.startsWith(base) ? target.slice(base.length, -1) : undefined;
}

function lowerDriveLetter(path: string): string {
  return path.replace(/^\/([A-Za-z]):/, (_, letter: string) => `/${letter.toLowerCase()}:`);
}
