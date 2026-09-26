/** Identifier of a translation area, e.g. `edu-sharing.angular`. */
export type AreaId = string;
/** Identifier of a bundle within its area: `${areaId}/${bundleName}`. */
export type BundleId = string;
/** Locale code exactly as it appears in the file name, e.g. `de`, `de-informal`, `de_DE`, `default`. */
export type LocaleCode = string;
/** Name of a translatable part of an entry; single-value formats use {@link VALUE_FIELD}. */
export type FieldId = string;

export const VALUE_FIELD: FieldId = 'value';
