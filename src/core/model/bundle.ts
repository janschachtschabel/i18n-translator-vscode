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
  parsed: ParsedFile;
}

/** All locale files of one bundle (an Angular category, a metadataset group, the mail templates). */
export interface Bundle {
  readonly areaId: AreaId;
  readonly id: BundleId;
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

export function buildBundle(
  area: AreaDefinition,
  name: string,
  files: readonly LoadedFile[],
  opts: BundleOptions,
): Bundle {
  const byLocale = new Map(files.map((file) => [file.locale, file]));
  const reference = pickReference(
    [...byLocale.keys()],
    area.referenceLanguage ?? opts.referenceLanguage,
    opts,
  );
  // Code-unit order (not localeCompare) keeps output identical on every machine.
  const locales = [...byLocale.keys()].sort((a, b) =>
    a === reference ? -1 : b === reference ? 1 : a < b ? -1 : a > b ? 1 : 0,
  );
  const entries = new Map(
    locales.map((locale) => [
      locale,
      new Map(byLocale.get(locale)!.parsed.entries.map((e) => [e.key.id, e])),
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
    id: `${area.id}/${name}`,
    name,
    locales,
    reference,
    keys: [...keys.values()],
    file: (locale) => byLocale.get(locale),
    entry: (entryId, locale) => entries.get(locale)?.get(entryId),
    value: (entryId, locale, field = VALUE_FIELD) => entries.get(locale)?.get(entryId)?.fields[field]?.value,
  };
}
