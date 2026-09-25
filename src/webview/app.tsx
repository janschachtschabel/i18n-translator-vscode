import type { BundleViewModel } from '../shared/viewModel';
import { LiveRegion } from './a11y/liveRegion';
import { FilterBar } from './components/filterBar';
import { LanguageChips } from './components/languageChips';
import { Table } from './components/table/table';
import { Toolbar } from './components/toolbar';
import { formatNumber, l10n } from './l10n';
import { useShortcuts } from './shortcuts';
import { missingNotice, type EditorStore, type View } from './state/store';

export function App({ store }: { store: EditorStore }) {
  useShortcuts(store);
  return (
    <>
      <main>
        <Content store={store} view={store.view.value} />
      </main>
      <LiveRegion announcement={store.announcement} />
    </>
  );
}

function Content({ store, view }: { store: EditorStore; view: View }) {
  switch (view.kind) {
    case 'starting':
      // The texts come with `init`, a few milliseconds later; better nothing than a flash of English.
      return null;
    case 'loading':
      return <p>{l10n.t('Loading translations…')}</p>;
    case 'missing':
      return (
        <>
          <h1>{view.name}</h1>
          <p>{missingNotice(view.name)}</p>
        </>
      );
    case 'bundle':
      return <BundleView store={store} model={view.model} />;
  }
}

const TITLE_ID = 'bundle-title';

function BundleView({ store, model }: { store: EditorStore; model: BundleViewModel }) {
  const { hiddenLocales, wrap } = store.uiState.value;
  const rows = store.filtered.value?.rows ?? [];
  // simplify: every layout shows the table until the list view follows (task 2.11).
  return (
    <>
      <h1 id={TITLE_ID}>{model.name}</h1>
      <p>
        {l10n.t('Keys: {keys} · Languages: {languages}', {
          keys: formatNumber(model.rows.length),
          languages: formatNumber(model.locales.length),
        })}
      </p>
      <Toolbar store={store} />
      <LanguageChips store={store} locales={model.locales} />
      <FilterBar store={store} model={model} />
      {rows.length > 0 ? (
        <Table
          store={store}
          rows={rows}
          locales={model.locales.filter((locale) => !hiddenLocales.includes(locale.code))}
          wrap={wrap}
          labelledBy={TITLE_ID}
        />
      ) : (
        <p>
          {model.rows.length > 0
            ? l10n.t('No key matches the filter.')
            : l10n.t('This bundle has no keys yet.')}
        </p>
      )}
    </>
  );
}
