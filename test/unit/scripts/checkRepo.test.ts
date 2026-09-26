import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkRepository, formatReport, formatRoundTrip, roundTrip } from '../../../scripts/lib/checkRepo';

const workspace = join(__dirname, '..', '..', 'fixtures', 'workspace-basic');

describe('checkRepository', () => {
  const report = checkRepository(workspace);

  it('finds the Angular root of the fixture workspace', () => {
    expect(report.roots.map((root) => [root.areaId, root.root, root.bundles, root.warnings])).toEqual([
      ['edu-sharing.angular', 'Frontend/src/assets/i18n', 4, []],
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

describe('roundTrip', () => {
  const formats = join(__dirname, '..', '..', 'fixtures', 'workspace-formats');

  it('reads and writes back every translation file of the presets without changing a byte', () => {
    expect(roundTrip(workspace)).toEqual({ files: 14, changed: [], unstable: [] });
  });

  it('does so for all three formats, and every text set to itself reads back the same', () => {
    expect(roundTrip(formats)).toEqual({ files: 9, changed: [], unstable: [] });
  });

  it('says how many files kept their bytes and texts, or which did not', () => {
    expect(formatRoundTrip({ files: 14, changed: [], unstable: [] })).toBe(
      'Round trip: 14 files, all byte-identical and stable',
    );
    expect(formatRoundTrip({ files: 3, changed: ['a.json'], unstable: ['b.xml'] }).split('\n')).toEqual([
      'Round trip: 3 files, 1 changed, 1 unstable:',
      '  changed: a.json',
      '  unstable: b.xml',
    ]);
  });
});
