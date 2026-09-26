import { describe, expect, it } from 'vitest';
import { editorTitle } from '../../../src/extension/panels/editorTitle';
import type { IndexedRoot, IndexSnapshot } from '../../../src/extension/services/workspaceIndex';

const I18N = 'Frontend/src/assets/i18n';

/** A snapshot of roots given as [workspace folder name, root]; only what the title reads. */
function snapshot(...roots: [string, string][]): IndexSnapshot {
  return {
    roots: roots.map(
      ([folder, root]) =>
        ({
          folder: { name: folder, uri: { toString: () => `file:///${folder}` } },
          analysis: { root },
        }) as unknown as IndexedRoot,
    ),
    errors: [],
    durationMs: 0,
  };
}

const target = (folder: string, root: string) => ({
  folder: `file:///${folder}`,
  bundleId: JSON.stringify(['edu-sharing.angular', root, 'common']),
});

// Two installations with the same bundles had editors of the same name (audit L-13).
describe('editorTitle', () => {
  it('names only the bundle while the workspace has one root', () => {
    expect(editorTitle(snapshot(['repo', I18N]), target('repo', I18N))).toBe('common');
    expect(editorTitle(undefined, target('repo', I18N))).toBe('common');
  });

  it('adds the root when a workspace folder has several', () => {
    const two = snapshot(['repo', `a/${I18N}`], ['repo', `b/${I18N}`]);
    expect(editorTitle(two, target('repo', `b/${I18N}`))).toBe(`common (b/${I18N})`);
  });

  it('adds the workspace folder when there are several, and its root if it has more than one', () => {
    const folders = snapshot(['first', I18N], ['second', I18N]);
    expect(editorTitle(folders, target('second', I18N))).toBe('common (second)');
    const mixed = snapshot(['first', I18N], ['second', `a/${I18N}`], ['second', '']);
    expect(editorTitle(mixed, target('second', ''))).toBe('common (second: .)');
  });
});
