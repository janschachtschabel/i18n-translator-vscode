import type { UiState } from '../../shared/protocol';
import { l10n } from '../l10n';
import type { EditorStore } from '../state/store';
import './toolbar.css';

/** How the bundle is shown (layout, wrapping) and the undo of the last change. */
export function Toolbar({ store }: { store: EditorStore }) {
  const { layout, wrap } = store.uiState.value;
  const layouts: [UiState['layout'], string][] = [
    ['auto', l10n.t('Automatic')],
    ['table', l10n.t('Table')],
    ['list', l10n.t('List')],
  ];
  return (
    <div class="toolbar">
      <fieldset class="group">
        <legend>{l10n.t('View')}</legend>
        {layouts.map(([value, label]) => (
          <label key={value} class="option">
            <input
              type="radio"
              name="layout"
              checked={layout === value}
              onChange={() => store.updateUiState({ layout: value })}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <label class="option">
        <input type="checkbox" checked={wrap} onChange={() => store.updateUiState({ wrap: !wrap })} />
        {l10n.t('Wrap long texts')}
      </label>
      <button type="button" aria-keyshortcuts="Control+Z Meta+Z" onClick={() => store.undo()}>
        {l10n.t('Undo last change')}
      </button>
    </div>
  );
}
