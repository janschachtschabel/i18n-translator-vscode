import { ISSUE_MESSAGES, MISSING_KEYS_MESSAGE } from '../checks/messages';
import type { Issue, IssueArgs, IssueLocation, RuleId } from '../checks/types';
import type { MissingDiagnostics } from '../config/settings';
import type { TextRange } from '../formats/adapter';
import type { Bundle } from '../model/bundle';
import { displayKey, keyFromId } from '../model/keys';
import { VALUE_FIELD } from '../model/types';
import type { RootAnalysis } from '../pipeline/analyze';
import { createLineIndex, type LineIndex, type Position } from '../text/lineIndex';

/** An English message template with `{name}` arguments; the host localizes and fills it. */
export interface MessageText {
  template: string;
  args: IssueArgs;
}

export interface ProblemLocation {
  /** Workspace-relative path with `/` separators. */
  relPath: string;
  start: Position;
  end: Position;
}

/** An entry of a problems list, such as the Problems panel of VS Code. */
export interface Problem {
  rule: RuleId;
  severity: 'error' | 'warning';
  location: ProblemLocation;
  message: MessageText;
  /**
   * Where the user finds the text to compare with: the reference text of the same key. The label (`de: Text`,
   * `KEY: Text`) needs no translation, so hosts show it as it is.
   */
  related: { location: ProblemLocation; label: string }[];
}

/** Related information is a one-line label, so longer texts are cut. */
const MAX_TEXT_LENGTH = 80;

type Locate = (relPath: string, range?: TextRange) => ProblemLocation;
type Listed = Issue & { severity: 'error' | 'warning'; location: IssueLocation };

/**
 * The findings of one root as problems. Infos are hints, not problems, and are left out. `missing` decides
 * how missing keys appear: one problem per file that lists the keys (`aggregate`; a single key keeps its own
 * message), one problem per key (`individual`), or none (`off`).
 */
export function toProblems(analysis: RootAnalysis, missing: MissingDiagnostics): Problem[] {
  const locate = locator(analysis.bundles);
  const bundles = new Map(analysis.bundles.map((bundle) => [bundle.id, bundle]));
  const listed = analysis.issues.filter(
    (issue): issue is Listed => issue.severity !== 'info' && issue.location !== undefined,
  );
  const missingByFile = new Map<string, Listed[]>();
  for (const issue of listed.filter((candidate) => candidate.rule === 'missing-key')) {
    const group = missingByFile.get(issue.location.relPath);
    if (group) {
      group.push(issue);
    } else {
      missingByFile.set(issue.location.relPath, [issue]);
    }
  }

  const problems: Problem[] = [];
  for (const issue of listed) {
    const bundle = bundles.get(issue.bundleId);
    if (!bundle) {
      continue;
    }
    if (issue.rule === 'missing-key' && missing !== 'individual') {
      const group = missingByFile.get(issue.location.relPath)!;
      if (missing === 'aggregate' && group.length > 1) {
        if (group[0] === issue) {
          problems.push(missingKeysProblem(group, bundle, locate));
        }
        continue;
      }
      if (missing === 'off') {
        continue;
      }
    }
    problems.push(issueProblem(issue, bundle, locate));
  }
  return problems;
}

function issueProblem(issue: Listed, bundle: Bundle, locate: Locate): Problem {
  const reference = referenceText(bundle, issue.entryId);
  return {
    rule: issue.rule,
    severity: issue.severity,
    location: locate(issue.location.relPath, issue.location.range),
    message: { template: ISSUE_MESSAGES[issue.rule], args: issue.args },
    // A finding in the reference file itself already shows the reference text.
    related:
      reference && reference.relPath !== issue.location.relPath
        ? [
            {
              location: locate(reference.relPath, reference.range),
              label: `${reference.locale}: ${reference.text}`,
            },
          ]
        : [],
  };
}

/** The missing keys of one file as one problem at its start; the related information lists the keys. */
function missingKeysProblem(group: readonly Listed[], bundle: Bundle, locate: Locate): Problem {
  const [first] = group as [Listed, ...Listed[]];
  return {
    rule: 'missing-key',
    severity: first.severity,
    location: locate(first.location.relPath),
    message: { template: MISSING_KEYS_MESSAGE, args: { count: group.length, locale: first.locale ?? '' } },
    related: group.flatMap((issue) => {
      const reference = referenceText(bundle, issue.entryId);
      return reference
        ? [
            {
              location: locate(reference.relPath, reference.range),
              label: `${reference.key}: ${reference.text}`,
            },
          ]
        : [];
    }),
  };
}

/** Position of the reference text of an entry, with the text ready for a label. */
function referenceText(
  bundle: Bundle,
  entryId: string | undefined,
): { relPath: string; range: TextRange; locale: string; key: string; text: string } | undefined {
  const locale = bundle.reference;
  if (entryId === undefined || locale === undefined) {
    return undefined;
  }
  const file = bundle.file(locale);
  const field = bundle.entry(entryId, locale)?.fields[VALUE_FIELD];
  if (!file || !field) {
    return undefined;
  }
  return {
    relPath: file.relPath,
    range: field.valueRange,
    locale,
    key: displayKey(keyFromId(entryId)),
    text: oneLine(field.value),
  };
}

/** One line of at most {@link MAX_TEXT_LENGTH} characters (code points, so no emoji is cut in half). */
function oneLine(text: string): string {
  const chars = [...text.replace(/\s+/g, ' ')];
  return chars.length > MAX_TEXT_LENGTH ? `${chars.slice(0, MAX_TEXT_LENGTH - 1).join('')}…` : chars.join('');
}

/** Maps offsets in the files of the bundles to line/character positions; each file is indexed once. */
function locator(bundles: readonly Bundle[]): Locate {
  const texts = new Map<string, string>();
  for (const bundle of bundles) {
    for (const locale of bundle.locales) {
      const file = bundle.file(locale);
      if (file) {
        texts.set(file.relPath, file.doc.text);
      }
    }
  }
  const indexes = new Map<string, LineIndex>();
  return (relPath, range = [0, 0]) => {
    let index = indexes.get(relPath);
    if (!index) {
      index = createLineIndex(texts.get(relPath) ?? '');
      indexes.set(relPath, index);
    }
    return { relPath, start: index.positionAt(range[0]), end: index.positionAt(range[1]) };
  };
}
