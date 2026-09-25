import type { LocaleView } from '../../../shared/viewModel';
import { l10n } from '../../l10n';
import type { EditorStore } from '../../state/store';

/**
 * The reference and the one language the compact list shows beside it: the chosen one, else the first
 * visible full language (a variant leaves most texts to its base), else any.
 */
export function compactLocales(
  locales: readonly LocaleView[],
  hidden: readonly string[],
  chosen: string | null,
): LocaleView[] {
  const reference = locales.find((locale) => locale.reference);
  const others = locales.filter((locale) => !locale.reference);
  const second =
    others.find((locale) => locale.code === chosen) ??
    others.find((locale) => !locale.variant && !hidden.includes(locale.code)) ??
    others[0];
  return [reference, second].filter((locale) => locale !== undefined);
}

export function CompactChoice({
  store,
  locales,
  selected,
}: {
  store: EditorStore;
  locales: readonly LocaleView[];
  selected: string;
}) {
  return (
    <label class="field">
      {l10n.t('Second language')}
      <select
        value={selected}
        onChange={(event) => store.updateUiState({ compactLocale: event.currentTarget.value })}
      >
        {locales
          .filter((locale) => !locale.reference)
          .map(({ code }) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
      </select>
    </label>
  );
}
