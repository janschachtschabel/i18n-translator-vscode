import { useLayoutEffect, useRef } from 'preact/hooks';
import type { UiState } from '../../shared/protocol';
import { l10n } from '../l10n';
import type { EditorStore } from '../state/store';
import './toolbar.css';
import { focusIsLost } from './focus';

/**
 * How the bundle is shown (layout, wrapping, the details of the table), new keys and languages, the undo of the
 * last change, and the AI.
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
      {/* A new key goes after the active one of the table; the list has none. */}
      <button
        type="button"
        onClick={() =>
          store.command(
            'addKey',
            store.layout.value === 'table' ? (store.detailsKey.value ?? undefined) : undefined,
          )
        }
      >
        {l10n.t('Add Key…')}
      </button>
      <button type="button" onClick={() => store.command('addLanguage')}>
        {l10n.t('Add Language…')}
      </button>
      <button type="button" aria-keyshortcuts="Control+Z Meta+Z" onClick={() => store.undo()}>
        {l10n.t('Undo last change')}
      </button>
      <AiTools store={store} />
    </div>
  );
}

/**
 * Whether the AI is ready and with which model, the fill and the check, and the way to its setup; without a key,
 * also the way to set one, and with an address it may not use, that it is off. Nothing where the AI is turned off or
 * in Restricted Mode.
 */
function AiTools({ store }: { store: EditorStore }) {
  const ai = store.suggestions.ai.value;
  const fill = useRef<HTMLButtonElement>(null);
  const check = useRef<HTMLButtonElement>(null);
  // The review list of a job closed with the focus in it: back to the button that started the job.
  useLayoutEffect(() => {
    const back = store.review.takeFocusBack();
    (back === 'check' ? check : back === 'fill' ? fill : undefined)?.current?.focus();
  }, [store]);
  // "Set API Key…" goes once the key is set, and with it the focus it had when pressed: the fill takes it.
  const setupPressed = useRef(false);
  useLayoutEffect(() => {
    if (ai.available && setupPressed.current) {
      setupPressed.current = false;
      if (focusIsLost()) {
        fill.current?.focus();
      }
    }
  }, [ai.available]);
  // Turned off, or in Restricted Mode: no AI at all. A missing key or an unusable address the setup can fix.
  if (!ai.available && ai.reason !== 'no-key' && ai.reason !== 'address') {
    return null;
  }
  return (
    <fieldset class="group">
      <legend>{l10n.t('AI')}</legend>
      <span class="ai-status">
        {ai.available
          ? l10n.t('ready · {model}', { model: ai.model })
          : ai.reason === 'no-key'
            ? l10n.t('no API key')
            : l10n.t('address of the b-api not valid')}
      </span>
      {ai.available && (
        <>
          <button ref={fill} type="button" onClick={() => store.review.fill()}>
            {l10n.t('Fill with AI…')}
          </button>
          <button ref={check} type="button" onClick={() => store.review.check()}>
            {l10n.t('Check with AI…')}
          </button>
        </>
      )}
      {ai.reason === 'no-key' && (
        <button
          type="button"
          onClick={() => {
            setupPressed.current = true;
            store.suggestions.setup();
          }}
        >
          {l10n.t('Set API Key…')}
        </button>
      )}
      <button type="button" onClick={() => store.suggestions.configure()}>
        {l10n.t('Set Up AI…')}
      </button>
    </fieldset>
  );
}
