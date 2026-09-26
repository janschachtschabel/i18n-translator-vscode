import type { LocaleView } from '../../shared/viewModel';

/**
 * What the rows and headers show of a language: not its counts, which the chips take from the model, so that a
 * new count renders no row again.
 */
export type LocaleColumn = Pick<LocaleView, 'code' | 'label' | 'lang' | 'reference' | 'variant' | 'hasFile'>;

/**
 * A memo for the languages the rows show: it gives back the array it gave last as long as the columns are the
 * same, also with new counts of findings, so that the rows, which show no counts, render again only where a text
 * changed.
 */
export function sameColumnsAsBefore(): (columns: readonly LocaleColumn[]) => readonly LocaleColumn[] {
  let last: readonly LocaleColumn[] = [];
  return (columns) => (sameColumns(columns, last) ? last : (last = columns));
}

function sameColumns(a: readonly LocaleColumn[], b: readonly LocaleColumn[]): boolean {
  return (
    a.length === b.length &&
    a.every((locale, index) => {
      const other = b[index]!;
      return (
        locale.code === other.code &&
        locale.label === other.label &&
        locale.lang === other.lang &&
        locale.reference === other.reference &&
        locale.variant === other.variant &&
        locale.hasFile === other.hasFile
      );
    })
  );
}
