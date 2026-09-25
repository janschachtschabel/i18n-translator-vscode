import { useEffect } from 'preact/hooks';
import type { BundleViewModel } from '../shared/viewModel';
import { LiveRegion } from './a11y/liveRegion';
import { FileFindings } from './components/fileFindings';
import { FilterBar } from './components/filterBar';
import { Details } from './components/details';
import { CompactChoice } from './components/list/compactChoice';
import { List } from './components/list/list';
import { LanguageChips } from './components/languageChips';
import { SkipLinks } from './components/skipLinks';
import { Table } from './components/table/table';
import { Toolbar } from './components/toolbar';
import { formatNumber, l10n } from './l10n';
import { useShortcuts } from './shortcuts';
import { missingNotice, type EditorStore, type View } from './state/store';

export function App({ store }: { store: EditorStore }) {
  useShortcuts(store);
  useWidth(store);
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
  const rows = store.rows.value;
  const layout = store.layout.value;
  const shown = store.shownLocales.value;
  const reference = model.locales.find((locale) => locale.reference)?.code;
  return (
    <div class={layout === 'table' ? 'bundle fill' : 'bundle'}>
      <SkipLinks layout={layout} />
      <h1 id={TITLE_ID}>{model.name}</h1>
      <p>
        {l10n.t('Keys: {keys} · Languages: {languages}', {
          keys: formatNumber(model.rows.length),
          languages: formatNumber(model.locales.length),
        })}
      </p>
      <Toolbar store={store} />
      <LanguageChips store={store} locales={model.locales} />
      <FileFindings model={model} />
      <FilterBar store={store} model={model} />
      {layout === 'compact' && shown[1] && (
        <CompactChoice store={store} locales={model.locales} selected={shown[1].code} />
      )}
      {rows.length === 0 && (
        <p>
          {model.rows.length > 0
            ? l10n.t('No key matches the filter.')
            : l10n.t('This bundle has no keys yet.')}
        </p>
      )}
      {layout === 'table' && model.rows.length > 0 ? (
        <div class="workspace">
          <Table
            store={store}
            rows={rows}
            locales={shown}
            reference={reference}
            wrap={store.uiState.value.wrap}
            labelledBy={TITLE_ID}
          />
          {store.uiState.value.details && (
            <Details store={store} locales={model.locales} reference={reference} />
          )}
        </div>
      ) : rows.length > 0 ? (
        <List store={store} rows={rows} locales={shown} reference={reference} labelledBy={TITLE_ID} />
      ) : null}
    </div>
  );
}

/** Keeps the store's width up to date; only a change of layout renders the rows again. */
function useWidth(store: EditorStore): void {
  useEffect(() => {
    const onResize = () => {
      store.width.value = window.innerWidth;
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [store]);
}
