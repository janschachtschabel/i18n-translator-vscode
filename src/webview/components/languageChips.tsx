import { Fragment } from 'preact';
import type { LocaleView } from '../../shared/viewModel';
import { formatNumber, l10n } from '../l10n';
import type { EditorStore } from '../state/store';
import { localeName } from './localeName';
import './languageChips.css';

/** A checkbox per language to show or hide it, with its marks and what is open in it. */
export function LanguageChips({ store, locales }: { store: EditorStore; locales: readonly LocaleView[] }) {
  const hidden = store.uiState.value.hiddenLocales;
  return (
    <fieldset class="group">
      <legend>{l10n.t('Shown languages')}</legend>
      {locales.map((locale) => (
        <label key={locale.code} class="chip">
          <input
            type="checkbox"
            checked={!hidden.includes(locale.code)}
            onChange={() => store.toggleLocale(locale.code)}
          />
          <span>{localeName(locale)}</span>
          {marks(locale).map((mark) => (
            // The space keeps the parts apart in the name screen readers read.
            <Fragment key={mark}>
              {' '}
              <span class="chip-mark">{mark}</span>
            </Fragment>
          ))}
        </label>
      ))}
    </fieldset>
  );
}

function marks(locale: LocaleView): string[] {
  return [
    ...(locale.reference ? [l10n.t('reference')] : []),
    ...(locale.variant ? [l10n.t('variant')] : []),
    ...(locale.hasFile ? [] : [l10n.t('no file')]),
    ...(locale.missing > 0 ? [l10n.t('missing: {count}', { count: formatNumber(locale.missing) })] : []),
    ...(locale.findings > 0 ? [l10n.t('findings: {count}', { count: formatNumber(locale.findings) })] : []),
  ];
}
