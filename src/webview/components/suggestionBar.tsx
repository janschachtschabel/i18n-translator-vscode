import { l10n } from '../l10n';
import type { OpenEditor } from '../state/edits';
import type { EditorStore } from '../state/store';
import { StatusNote } from './statusNote';

/** The id of the line that says what the AI does, which describes the editor's field. */
export const SUGGESTION_ID = 'editor-suggestion';

interface SuggestionBarProps {
  store: EditorStore;
  editor: OpenEditor;
  /** Whether the cell has a text to translate from, as far as the page knows: the reference has one. */
  hasSource: boolean;
  /** Asks for a suggestion; the field keeps the focus. */
  onSuggest: () => void;
}

/**
 * The AI in the cell editor: the button for a suggestion (or, without a key, the way to set one), and a line that
 * says that a suggestion is on its way, why there is none, or that the field holds one to check. Nothing where the
 * AI is off or in Restricted Mode, and nothing in the reference, which has nothing to translate from.
 */
export function SuggestionBar({ store, editor, hasSource, onSuggest }: SuggestionBarProps) {
  const { suggestions } = store;
  const ai = suggestions.ai.value;
  const state = suggestions.state.value;
  if (!hasSource || (!ai.available && ai.reason !== 'no-key')) {
    return null;
  }
  if (!ai.available) {
    return (
      <div class="editor-ai">
        <button type="button" onClick={() => suggestions.setup()}>
          {l10n.t('AI Suggestion: Set API Key…')}
        </button>
      </div>
    );
  }
  const mine =
    state.kind !== 'idle' && state.cell.entryId === editor.entryId && state.cell.locale === editor.locale;
  const loading = mine && state.kind === 'loading';
  return (
    <div class="editor-ai">
      <button
        type="button"
        aria-keyshortcuts="Control+I Meta+I"
        disabled={loading || editor.conflict !== undefined}
        onClick={onSuggest}
      >
        {l10n.t('AI Suggestion')}
      </button>
      <p id={SUGGESTION_ID} role="status" class="editor-note">
        {loading ? (
          l10n.t('Fetching a suggestion from {model} … Esc cancels.', { model: ai.model })
        ) : mine && state.kind === 'failed' ? (
          <StatusNote severity="error" text={state.message} />
        ) : editor.suggestion ? (
          l10n.t('AI suggestion – please check it. Esc brings back your text.')
        ) : null}
      </p>
    </div>
  );
}
