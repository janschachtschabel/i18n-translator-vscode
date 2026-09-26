import type { LocaleView } from '../../../shared/viewModel';
import type { EditorStore } from '../../state/store';

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
        {locales.map(({ code }) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </select>
    </label>
  );
}
