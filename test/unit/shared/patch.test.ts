import { describe, expect, it } from 'vitest';
import { applyPatch, diffModels } from '../../../src/shared/patch';
import type { BundleViewModel } from '../../../src/shared/viewModel';
import { locale, row, text } from '../support/viewModels';

const model: BundleViewModel = {
  bundleId: JSON.stringify(['angular', '', 'common']),
  name: 'common',
  locales: [locale('de', { reference: true }), locale('fr')],
  rows: [
    row('SAVE', { de: text('Speichern'), fr: text('Enregistrer') }),
    row('CANCEL', { de: text('Abbrechen'), fr: text(undefined, 'missing-key') }),
    row('OK', { de: text('OK'), fr: text('OK') }),
  ],
  issues: [],
};

/** The model with the rows given by key replaced, the others as they are (the same objects). */
const withRows = (rows: BundleViewModel['rows']): BundleViewModel => ({ ...model, rows });

describe('diffModels and applyPatch', () => {
  it('send only the rows that changed, and keep the others as the same objects', () => {
    const cancel = row('CANCEL', { de: text('Abbrechen'), fr: text('Annuler') });
    const after = withRows([model.rows[0]!, cancel, model.rows[2]!]);
    const patch = diffModels(model, after)!;
    expect(patch).toEqual({ rows: [cancel] });
    const patched = applyPatch(model, patch);
    expect(patched).toEqual(after);
    expect(patched.rows[0]).toBe(model.rows[0]);
    expect(patched.rows[2]).toBe(model.rows[2]);
  });

  it('send the order of the rows when keys come, go or are renamed', () => {
    const added = row('NEW', { de: text('Neu'), fr: text(undefined) });
    const after = withRows([model.rows[0]!, added, model.rows[2]!]);
    const patch = diffModels(model, after)!;
    expect(patch).toEqual({ rows: [added], order: after.rows.map((candidate) => candidate.entryId) });
    expect(applyPatch(model, patch)).toEqual(after);
  });

  it('send the languages and the findings of the bundle when they changed', () => {
    const after = {
      ...model,
      locales: [...model.locales, locale('it')],
      issues: [{ rule: 'x', severity: 'info' as const, message: 'x' }],
    };
    const patch = diffModels(model, after)!;
    expect(patch).toEqual({ rows: [], locales: after.locales, issues: after.issues });
    expect(applyPatch(model, patch)).toEqual(after);
  });

  it('find nothing to send when nothing changed', () => {
    expect(diffModels(model, structuredClone(model))).toBeUndefined();
  });

  it('leave out ids a patch names but has no row for', () => {
    expect(applyPatch(model, { rows: [], order: [model.rows[0]!.entryId, '["GONE"]'] }).rows).toEqual([
      model.rows[0],
    ]);
  });
});
