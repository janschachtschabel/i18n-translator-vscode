import type { FileProblemCode } from '../../formats/adapter';
import { displayKey } from '../../model/keys';
import type { Rule, Severity } from '../types';
import { finding } from './support';

const DEFAULT_SEVERITY: Record<FileProblemCode, Severity> = {
  'parse-error': 'error',
  'non-string-value': 'warning',
  'duplicate-key': 'warning',
  'not-utf8': 'error',
  'bom-first-key': 'warning',
};

/** One rule per problem the format adapter reports while parsing, so each can get its own severity. */
export const fileProblemRules: Rule[] = (Object.keys(DEFAULT_SEVERITY) as FileProblemCode[]).map((code) => ({
  id: code,
  defaultSeverity: DEFAULT_SEVERITY[code],
  run: (ctx) =>
    ctx.bundles.flatMap((bundle) =>
      bundle.locales.flatMap((locale) => {
        const file = bundle.file(locale)!;
        return file.parsed.problems
          .filter((problem) => problem.code === code)
          .map((problem) =>
            finding(code, bundle, {
              locale,
              ...(problem.key ? { key: problem.key } : {}),
              args: { detail: problem.detail ?? '', key: problem.key ? displayKey(problem.key) : '' },
              location: { relPath: file.relPath, range: problem.range },
            }),
          );
      }),
    ),
}));
