import { l10n } from '../l10n';

/**
 * What a cell without a text shows when no finding says it: "–" for no text (a variant falls back to its base
 * language), "" for an empty text, which blocks that fallback (B2). Screen readers get words instead.
 */
export function EmptyValue({ value, variant }: { value: '' | undefined; variant: boolean }) {
  const [mark, words] =
    value === undefined
      ? ['–', variant ? l10n.t('no own text') : l10n.t('no text')]
      : ['""', l10n.t('empty text')];
  return (
    <>
      <span aria-hidden="true" class="empty-mark">
        {mark}
      </span>
      <span class="visually-hidden">{words}</span>
    </>
  );
}
