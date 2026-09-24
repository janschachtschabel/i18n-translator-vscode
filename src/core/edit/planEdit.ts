import type { AreaDefinition } from '../area/areaDefinition';
import { formatFilePattern } from '../area/filePattern';
import { hasSyntaxError, type FileOp } from '../formats/adapter';
import { ADAPTERS } from '../formats/registry';
import type { Bundle, LoadedFile } from '../model/bundle';
import { displayKey, keyFromId, type EntryKey } from '../model/keys';
import type { LocaleCode } from '../model/types';
import { detectStyle } from '../text/style';
import { editProblem, type EditProblem, type EditWarning } from './editMessages';
import { collidingKey, newKeyProblem } from './keyCheck';

export type BundleEdit =
  /** `before` is the text the user started from (null: absent); a different current text is a conflict. */
  | { kind: 'setText'; entryId: string; locale: LocaleCode; value: string; before?: string | null }
  /** Texts per locale; empty ones are skipped. `after` is the id of the key the new one should follow. */
  | { kind: 'addKey'; key: EntryKey; values: Readonly<Record<LocaleCode, string>>; after?: string }
  | { kind: 'renameKey'; entryId: string; to: EntryKey }
  | { kind: 'deleteKey'; entryId: string };

export type FileChange =
  { kind: 'edit'; relPath: string; ops: FileOp[] } | { kind: 'create'; relPath: string; content: string };

export type PlanResult =
  { ok: true; changes: FileChange[]; warnings: EditWarning[] } | { ok: false; problem: EditProblem };

const done = (changes: FileChange[]): PlanResult => ({ ok: true, changes, warnings: [] });
const fail = (problem: EditProblem): PlanResult => ({ ok: false, problem });

/** Turns an edit of a bundle into operations per file, or explains why it is not possible. Writes nothing. */
export function planEdit(bundle: Bundle, edit: BundleEdit): PlanResult {
  switch (edit.kind) {
    case 'setText':
      return planSetText(bundle, edit.entryId, edit.locale, edit.value, edit.before);
    case 'addKey':
      return planAddKey(bundle, edit.key, edit.values, edit.after);
    case 'renameKey':
      return planForEveryFile(
        bundle,
        edit.entryId,
        (key) => ({ kind: 'rename', from: key, to: edit.to }),
        edit.to,
      );
    case 'deleteKey':
      return planForEveryFile(bundle, edit.entryId, (key) => ({ kind: 'delete', key }));
  }
}

function planSetText(
  bundle: Bundle,
  entryId: string,
  locale: LocaleCode,
  value: string,
  before: string | null | undefined,
): PlanResult {
  const key = keyFromId(entryId);
  const file = bundle.file(locale);
  if (!file) {
    return fail(editProblem('missing-file', { bundle: bundle.name, locale }));
  }
  if (hasSyntaxError(file.parsed)) {
    return fail(editProblem('unreadable-file', { file: file.relPath }));
  }
  const current = bundle.value(entryId, locale);
  if (before !== undefined && (current ?? null) !== before) {
    return fail(editProblem('changed', { key: displayKey(key), locale }));
  }
  const edit = (op: FileOp) => done([{ kind: 'edit', relPath: file.relPath, ops: [op] }]);
  if (value === '') {
    if (locale === bundle.reference) {
      // Intentionally empty reference texts stay; a text there cannot be removed by clearing it.
      return current === '' ? done([]) : fail(editProblem('reference-empty', { key: displayKey(key) }));
    }
    // An empty translation would hide the fallback, so the key goes instead (B2).
    return current === undefined ? done([]) : edit({ kind: 'delete', key });
  }
  if (current !== undefined) {
    return value === current ? done([]) : edit({ kind: 'set', key, value });
  }
  const blocker = collidingKey(
    file.parsed.entries.map((entry) => entry.key),
    key,
  );
  if (blocker) {
    return fail(editProblem('path-conflict', { key: displayKey(key), other: displayKey(blocker) }));
  }
  const sibling = precedingSibling(bundle, file, key);
  return edit({ kind: 'insert', key, value, ...(sibling ? { after: sibling } : {}) });
}

function planAddKey(
  bundle: Bundle,
  key: EntryKey,
  values: Readonly<Record<LocaleCode, string>>,
  afterId: string | undefined,
): PlanResult {
  const problem = newKeyProblem(key, bundle);
  if (problem) {
    return fail(problem);
  }
  if (bundle.reference === undefined || !values[bundle.reference]) {
    return fail(editProblem('reference-empty', { key: displayKey(key) }));
  }
  const withoutFile = Object.keys(values).find((locale) => values[locale] !== '' && !bundle.file(locale));
  if (withoutFile !== undefined) {
    return fail(editProblem('missing-file', { bundle: bundle.name, locale: withoutFile }));
  }
  const after = afterId !== undefined ? keyFromId(afterId) : undefined;
  const changes: FileChange[] = [];
  for (const locale of bundle.locales) {
    const value = values[locale];
    const file = bundle.file(locale)!;
    if (!value) {
      continue;
    }
    if (hasSyntaxError(file.parsed)) {
      return fail(editProblem('unreadable-file', { file: file.relPath }));
    }
    const sibling =
      after && file.parsed.entries.some((entry) => entry.key.id === after.id) ? after : undefined;
    changes.push({
      kind: 'edit',
      relPath: file.relPath,
      ops: [{ kind: 'insert', key, value, ...(sibling ? { after: sibling } : {}) }],
    });
  }
  return done(changes);
}

/** Renames or deletes a key in every file of the bundle that has it; no file may have a syntax error. */
function planForEveryFile(
  bundle: Bundle,
  entryId: string,
  opFor: (key: EntryKey) => FileOp,
  renameTo?: EntryKey,
): PlanResult {
  const key = keyFromId(entryId);
  if (renameTo) {
    if (renameTo.id === key.id) {
      return done([]);
    }
    const problem = newKeyProblem(renameTo, bundle, key);
    if (problem) {
      return fail(problem);
    }
  }
  const files = bundle.locales.map((locale) => bundle.file(locale)!);
  const unreadable = files.find((file) => hasSyntaxError(file.parsed));
  if (unreadable) {
    return fail(editProblem('unreadable-file', { file: unreadable.relPath }));
  }
  const containing = files.filter((file) => file.parsed.entries.some((entry) => entry.key.id === key.id));
  if (containing.length === 0) {
    return fail(editProblem('missing-key', { key: displayKey(key), bundle: bundle.name }));
  }
  return done(containing.map((file) => ({ kind: 'edit', relPath: file.relPath, ops: [opFor(key)] })));
}

/**
 * A new language: an empty file in every bundle that lacks one, without keys, so that missing keys fall back
 * to the default language. The files follow the layout of each bundle's reference file.
 */
export function planAddLanguage(
  bundles: readonly Bundle[],
  area: AreaDefinition,
  locale: LocaleCode,
): PlanResult {
  const invalid = fail(editProblem('invalid-locale', { locale, area: area.label }));
  if (!new RegExp(`^(?:${area.localePattern})$`).test(locale)) {
    return invalid;
  }
  const lacking = bundles.filter((bundle) => !bundle.file(locale));
  if (lacking.length === 0) {
    return fail(editProblem('locale-exists', { locale }));
  }
  const changes: FileChange[] = [];
  for (const bundle of lacking) {
    const path = formatFilePattern(area, bundle.name, locale);
    if (path === undefined) {
      return invalid;
    }
    const reference = bundle.reference !== undefined ? bundle.file(bundle.reference) : undefined;
    changes.push({
      kind: 'create',
      relPath: bundle.root ? `${bundle.root}/${path}` : path,
      content: ADAPTERS[area.format].createEmpty(detectStyle(reference?.doc.text ?? '')),
    });
  }
  return done(changes);
}

/** The nearest key before `key` in the bundle's order that has the same parent and exists in the file. */
function precedingSibling(bundle: Bundle, file: LoadedFile, key: EntryKey): EntryKey | undefined {
  const inFile = new Set(file.parsed.entries.map((entry) => entry.key.id));
  const parent = key.segments.slice(0, -1);
  const index = bundle.keys.findIndex((candidate) => candidate.id === key.id);
  for (let position = index - 1; position >= 0; position--) {
    const candidate = bundle.keys[position]!;
    const sameParent =
      candidate.segments.length === key.segments.length &&
      parent.every((segment, depth) => candidate.segments[depth] === segment);
    if (sameParent && inFile.has(candidate.id)) {
      return candidate;
    }
  }
  return undefined;
}
