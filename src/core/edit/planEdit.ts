import type { AreaDefinition } from '../area/areaDefinition';
import { formatFilePattern } from '../area/filePattern';
import { hasSyntaxError, type FileOp } from '../formats/adapter';
import { ADAPTERS } from '../formats/registry';
import type { Bundle, LoadedFile } from '../model/bundle';
import { displayKey, isKeyPrefix, keyFromId, keyFromSegments, type EntryKey } from '../model/keys';
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
  if (!bundle.keys.some((existing) => existing.id === entryId)) {
    // Renamed or deleted in the meantime: a text for it would bring the key back (B5).
    return fail(editProblem('missing-key', { key: displayKey(key), bundle: bundle.name }));
  }
  const current = bundle.value(entryId, locale);
  if (before !== undefined && (current ?? null) !== before) {
    return fail(editProblem('changed', { key: displayKey(key), locale }));
  }
  const edit = (op: FileOp) => done([{ kind: 'edit', relPath: file.relPath, ops: [op] }]);
  if (value === '') {
    // Nothing to clear; intentionally empty reference texts stay.
    if (current === undefined || (locale === bundle.reference && current === '')) {
      return done([]);
    }
    if (locale === bundle.reference) {
      return fail(editProblem('reference-empty', { key: displayKey(key) }));
    }
    // An empty translation would hide the fallback, so the key goes instead (B2).
    return edit({ kind: 'delete', key });
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
  const position = bundle.keys.findIndex((candidate) => candidate.id === entryId);
  const after = insertAnchor(bundle.keys, position - 1, file, key);
  return edit({ kind: 'insert', key, value, ...(after ? { after } : {}) });
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
  if (bundle.reference === undefined) {
    return fail(editProblem('no-reference', { bundle: bundle.name }));
  }
  if (!values[bundle.reference]) {
    return fail(editProblem('reference-required', { key: displayKey(key), locale: bundle.reference }));
  }
  const withoutFile = Object.keys(values).find((locale) => values[locale] !== '' && !bundle.file(locale));
  if (withoutFile !== undefined) {
    return fail(editProblem('missing-file', { bundle: bundle.name, locale: withoutFile }));
  }
  // Without `after` (or with a key that is gone) the new key goes last.
  const from = bundle.keys.findIndex((candidate) => candidate.id === afterId);
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
    const after = insertAnchor(bundle.keys, from, file, key);
    changes.push({
      kind: 'edit',
      relPath: file.relPath,
      ops: [{ kind: 'insert', key, value, ...(after ? { after } : {}) }],
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
    const problem = newKeyProblem(renameTo, bundle);
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

/**
 * Where a new key goes in a file, so that the file keeps the order of the reference: after the nearest key at
 * or before position `from` of `keys` that the file has inside the key's deepest parent object in that file.
 * The anchor is cut to the level where the new entry starts, so a text that follows `OBJ.X` goes after the
 * object `OBJ`, and a missing parent object goes after its predecessor. Undefined: the entry goes last.
 */
function insertAnchor(
  keys: readonly EntryKey[],
  from: number,
  file: LoadedFile,
  key: EntryKey,
): EntryKey | undefined {
  const present = file.parsed.entries.map((entry) => entry.key);
  // The parent objects that the file has are those that contain one of its texts.
  let depth = key.segments.length - 1;
  while (depth > 0 && !present.some((other) => isKeyPrefix(key.segments.slice(0, depth), other.segments))) {
    depth--;
  }
  const parent = key.segments.slice(0, depth);
  const inFile = new Set(present.map((other) => other.id));
  for (let position = from; position >= 0; position--) {
    const candidate = keys[position]!;
    if (inFile.has(candidate.id) && isKeyPrefix(parent, candidate.segments)) {
      return keyFromSegments(candidate.segments.slice(0, depth + 1));
    }
  }
  return undefined;
}
