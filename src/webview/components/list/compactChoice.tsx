import type { LocaleView } from '../../../shared/viewModel';
import type { EditorStore } from '../../state/store';
import { localeName } from '../localeName';

/** The choice of the language the compact list shows beside the reference, or alone without one. */
export function CompactChoice({
  store,
  locales,
  selected,
  label,
}: {
  store: EditorStore;
  /** The languages to choose from. */
  locales: readonly LocaleView[];
  selected: string;
  label: string;
}) {
  return (
    <label class="field">
      {label}
      <select
        value={selected}
        onChange={(event) => store.updateUiState({ compactLocale: event.currentTarget.value })}
      >
        {locales.map((locale) => (
          <option key={locale.code} value={locale.code}>
            {localeName(locale)}
          </option>
        ))}
      </select>
    </label>
  );
}
