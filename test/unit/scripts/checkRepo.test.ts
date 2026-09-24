import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkRepository, formatReport } from '../../../scripts/lib/checkRepo';

const workspace = join(__dirname, '..', '..', 'fixtures', 'workspace-basic');

describe('checkRepository', () => {
  const report = checkRepository(workspace);

  it('finds the Angular root of the fixture workspace', () => {
    expect(report.roots.map((root) => [root.areaId, root.root, root.bundles])).toEqual([
      ['edu-sharing.angular', 'Frontend/src/assets/i18n', 4],
    ]);
  });

  it('counts findings per severity and rule', () => {
    expect(report.totals).toEqual({ error: 3, warning: 15, info: 3 });
    expect(report.roots[0]?.rules['missing-file']).toBe(4);
    expect(report.roots[0]?.rules['key-overridden']).toBe(2);
  });

  it('lists findings with message, file and 1-based line', () => {
    const mismatch = report.roots[0]?.issues.find((issue) => issue.rule === 'placeholder-mismatch');
    expect(mismatch).toMatchObject({
      severity: 'error',
      file: 'Frontend/src/assets/i18n/common/fr.json',
      line: 2,
      message:
        'The placeholders of ERROR_TITLE differ from the reference de: missing {{date}}, extra {{data}}.',
    });
  });
});

describe('formatReport', () => {
  it('prints a summary per rule with examples', () => {
    const text = formatReport(checkRepository(workspace));
    expect(text).toContain('edu-sharing.angular · Frontend/src/assets/i18n · 4 bundles');
    expect(text).toMatch(/placeholder-mismatch\s+error\s+1/);
    expect(text).toContain('Frontend/src/assets/i18n/common/fr.json:2');
    expect(text).toContain('Total: 3 errors, 15 warnings, 3 infos');
  });
});
