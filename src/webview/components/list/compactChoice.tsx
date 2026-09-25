import type { LocaleView } from '../../../shared/viewModel';
import { l10n } from '../../l10n';
import type { EditorStore } from '../../state/store';

/** The choice of the language the compact list shows beside the reference. */
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
