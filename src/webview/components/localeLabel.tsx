import type { LocaleView } from '../../shared/viewModel';
import { l10n } from '../l10n';
import { localeName } from './localeName';

/** A language code with its mark: the reference, or a variant that leaves most texts to its base. */
export function LocaleLabel({
  locale,
}: {
  locale: Pick<LocaleView, 'code' | 'label' | 'reference' | 'variant'>;
}) {
  return (
    <>
      {localeName(locale)}
      {(locale.reference || locale.variant) && (
        <>
          {' '}
          <span class="locale-mark">{locale.reference ? l10n.t('reference') : l10n.t('variant')}</span>
        </>
      )}
    </>
  );
}
