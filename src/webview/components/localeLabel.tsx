import type { LocaleView } from '../../shared/viewModel';
import { l10n } from '../l10n';

/** A language code with its mark: the reference, or a variant that leaves most texts to its base. */
export function LocaleLabel({ locale }: { locale: LocaleView }) {
  return (
    <>
      {locale.code}
      {(locale.reference || locale.variant) && (
        <>
          {' '}
          <span class="locale-mark">{locale.reference ? l10n.t('reference') : l10n.t('variant')}</span>
        </>
      )}
    </>
  );
}
