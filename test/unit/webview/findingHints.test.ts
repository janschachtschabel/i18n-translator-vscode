import { describe, expect, it } from 'vitest';
import { RULE_IDS } from '../../../src/core/checks/types';
import { hintFor } from '../../../src/webview/components/findingHints';

/** Findings about a file as a whole: they belong to a language, not to a cell. */
const FILE_RULES = ['parse-error', 'not-utf8', 'missing-file'];

describe('hintFor', () => {
  it('says how to solve every finding a cell can show, and nothing for those about a file', () => {
    for (const rule of RULE_IDS) {
      if (FILE_RULES.includes(rule)) {
        expect(hintFor(rule), rule).toBeUndefined();
      } else {
        expect(hintFor(rule), rule).toMatch(/\.$/);
      }
    }
  });
});
