import type { UiState } from '../../shared/protocol';
import { l10n } from '../l10n';
import type { EditorStore } from '../state/store';
import './toolbar.css';

/**
 * How the bundle is shown (layout, wrapping, the details of the table), new keys and languages, and the undo of
 * the last change.
 */
export function Toolbar({ store }: { store: EditorStore }) {
  const { layout, wrap, details } = store.uiState.value;
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
      {store.layout.value === 'table' && (
        <label class="option">
          <input
            type="checkbox"
            checked={details}
            onChange={() => store.updateUiState({ details: !details })}
          />
          {l10n.t('Show details')}
        </label>
      )}
      {/* A new key goes after the active one of the table. */}
      <button type="button" onClick={() => store.command('addKey', store.detailsKey.value ?? undefined)}>
        {l10n.t('Add Key…')}
      </button>
      <button type="button" onClick={() => store.command('addLanguage')}>
        {l10n.t('Add Language…')}
      </button>
      <button type="button" aria-keyshortcuts="Control+Z Meta+Z" onClick={() => store.undo()}>
        {l10n.t('Undo last change')}
      </button>
    </div>
  );
}
