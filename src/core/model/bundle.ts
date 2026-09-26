import type { AreaDefinition } from '../area/areaDefinition';
import type { ParsedEntry, ParsedFile } from '../formats/adapter';
import type { DecodedText } from '../text/decode';
import type { EntryKey } from './keys';
import { pickReference, type LocaleOptions } from './locale';
import { VALUE_FIELD, type AreaId, type BundleId, type FieldId, type LocaleCode } from './types';

export interface LoadedFile {
  locale: LocaleCode;
  /** Workspace-relative path with `/` separators. */
  relPath: string;
  doc: DecodedText;
  /** Without the entries the area hides (`ignoredKeys`). */
  parsed: ParsedFile;
  /** The hidden entries the file has, in file order; the file keeps them. */
  hidden?: readonly ParsedEntry[];
}

/** All locale files of one bundle (an Angular category, a metadataset group, the mail templates). */
export interface Bundle {
  readonly areaId: AreaId;
  /** Unique across areas and roots, see {@link parseBundleId}. */
  readonly id: BundleId;
  /** Area root the bundle lies below; two roots are two separate installations. */
  readonly root: string;
  readonly name: string;
  /** Reference locale first, then the others sorted. */
  readonly locales: readonly LocaleCode[];
  readonly reference: LocaleCode | undefined;
  /** Keys in reference file order, followed by keys that only other locales have. */
  readonly keys: readonly EntryKey[];
  file(locale: LocaleCode): LoadedFile | undefined;
  entry(entryId: string, locale: LocaleCode): ParsedEntry | undefined;
  /** undefined: the key is absent in this locale (as opposed to an empty string). */
  value(entryId: string, locale: LocaleCode, field?: FieldId): string | undefined;
}

export interface BundleOptions extends LocaleOptions {
  /** Global reference language; an area may override it. */
  referenceLanguage: string;
}

/** The parts of a bundle id: the JSON-encoded tuple of area id, root and name. */
export function parseBundleId(id: BundleId): { areaId: AreaId; root: string; name: string } {
  const [areaId, root, name] = JSON.parse(id) as [string, string, string];
  return { areaId, root, name };
}

/** Joins the locale files of one bundle; throws if two files provide the same locale. */
export function buildBundle(
  area: AreaDefinition,
  root: string,
  name: string,
  files: readonly LoadedFile[],
  opts: BundleOptions,
): Bundle {
  const byLocale = new Map<LocaleCode, LoadedFile>();
  for (const file of files) {
    const existing = byLocale.get(file.locale);
    if (existing) {
      throw new RangeError(`Both ${existing.relPath} and ${file.relPath} provide locale ${file.locale}.`);
    }
    byLocale.set(file.locale, file);
  }
  const codes = [...byLocale.keys()].sort();
  const reference = pickReference(codes, area.referenceLanguage ?? opts.referenceLanguage, opts);
  // Code-unit order (not localeCompare) keeps output identical on every machine.
  const locales = [
    ...codes.filter((code) => code === reference),
    ...codes.filter((code) => code !== reference),
  ];
  const entries = new Map(
    locales.map((locale) => [
      locale,
      new Map(byLocale.get(locale)!.parsed.entries.map((entry) => [entry.key.id, entry])),
    ]),
  );

  const keys = new Map<string, EntryKey>();
  for (const locale of locales) {
    for (const entry of entries.get(locale)!.values()) {
      if (!keys.has(entry.key.id)) {
        keys.set(entry.key.id, entry.key);
      }
    }
  }

  return {
    areaId: area.id,
    id: JSON.stringify([area.id, root, name]),
    root,
    name,
    locales,
    reference,
    keys: [...keys.values()],
    file: (locale) => byLocale.get(locale),
    entry: (entryId, locale) => entries.get(locale)?.get(entryId),
    value: (entryId, locale, field = VALUE_FIELD) => entries.get(locale)?.get(entryId)?.fields[field]?.value,
  };
}
