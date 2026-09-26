import type { LocaleView } from '../../shared/viewModel';

/** A language as the editor names it: its label where it has one (`default (en)`), otherwise its code. */
export function localeName(locale: Pick<LocaleView, 'code' | 'label'>): string {
  return locale.label ?? locale.code;
}
