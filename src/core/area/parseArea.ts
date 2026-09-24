import {
  FORMAT_IDS,
  MERGE_SEMANTICS,
  type AreaDefinition,
  type FormatId,
  type MergeSemantics,
} from './areaDefinition';
import { compileFilePattern } from './filePattern';

export type ParseAreaResult = { ok: true; area: AreaDefinition } | { ok: false; errors: string[] };

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

/** Validates an area definition from user settings; collects every problem instead of stopping at the first. */
export function parseAreaDefinition(raw: unknown): ParseAreaResult {
  if (!isRecord(raw)) {
    return { ok: false, errors: ['An area definition must be an object.'] };
  }
  const errors: string[] = [];
  const check = <T>(value: T | undefined, valid: boolean, message: string): T | undefined => {
    if (!valid) {
      errors.push(message);
    }
    return value;
  };

  const id = check(raw.id, typeof raw.id === 'string' && ID_PATTERN.test(raw.id), idMessage());
  const label = check(
    raw.label,
    raw.label === undefined || typeof raw.label === 'string',
    '"label" must be a string.',
  );
  const format = check(
    raw.format,
    FORMAT_IDS.includes(raw.format as FormatId),
    `"format" must be one of: ${FORMAT_IDS.join(', ')}.`,
  );
  const files = check(raw.files, isNonEmptyString(raw.files), '"files" must be a non-empty path pattern.');
  const localePattern = check(
    raw.localePattern,
    isNonEmptyString(raw.localePattern),
    '"localePattern" must be a non-empty regular expression.',
  );
  const bundlePattern = check(
    raw.bundlePattern,
    isOptionalString(raw.bundlePattern),
    '"bundlePattern" must be a string.',
  );
  const bundleName = check(
    raw.bundleName,
    isOptionalString(raw.bundleName),
    '"bundleName" must be a string.',
  );
  const referenceLanguage = check(
    raw.referenceLanguage,
    isOptionalString(raw.referenceLanguage),
    '"referenceLanguage" must be a string.',
  );
  const bundleOrder = check(
    raw.bundleOrder,
    raw.bundleOrder === undefined || isStringArray(raw.bundleOrder),
    '"bundleOrder" must be a list of bundle names.',
  );
  const mergeSemantics = check(
    raw.mergeSemantics,
    raw.mergeSemantics === undefined || MERGE_SEMANTICS.includes(raw.mergeSemantics as MergeSemantics),
    `"mergeSemantics" must be one of: ${MERGE_SEMANTICS.join(', ')}.`,
  );
  const detect = check(raw.detect, raw.detect === undefined || isDetect(raw.detect), detectMessage());
  const roots = check(
    raw.roots,
    raw.roots === undefined ? raw.detect !== undefined : isStringArray(raw.roots),
    '"roots" must list the area folders (workspace-relative) unless "detect" is set.',
  );

  if (typeof files === 'string' && typeof localePattern === 'string') {
    try {
      compileFilePattern({
        files,
        localePattern,
        bundlePattern: bundlePattern as string | undefined,
        bundleName: bundleName as string | undefined,
      });
    } catch (error) {
      errors.push((error as Error).message);
    }
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    area: withoutUndefined({
      id: id as string,
      label: (label as string | undefined) ?? (id as string),
      format: format as FormatId,
      roots: (roots as string[] | undefined) ?? [],
      files: files as string,
      localePattern: localePattern as string,
      bundlePattern: bundlePattern as string | undefined,
      bundleName: bundleName as string | undefined,
      referenceLanguage: referenceLanguage as string | undefined,
      bundleOrder: bundleOrder as string[] | undefined,
      mergeSemantics: mergeSemantics as MergeSemantics | undefined,
      detect: detect as AreaDefinition['detect'],
    }),
  };
}

function idMessage(): string {
  return '"id" must be a non-empty identifier (letters, digits, ".", "_", "-").';
}

function detectMessage(): string {
  return '"detect" must be { "glob": string, "marker": string } with a glob that ends with the marker.';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isDetect(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNonEmptyString(value.glob) &&
    isNonEmptyString(value.marker) &&
    value.glob.endsWith(value.marker)
  );
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}
