import type { BundleViewModel } from '../shared/viewModel';
import { LiveRegion } from './a11y/liveRegion';
import { FilterBar } from './components/filterBar';
import { LanguageChips } from './components/languageChips';
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

function BundleView({ store, model }: { store: EditorStore; model: BundleViewModel }) {
  return (
    <>
      <h1>{model.name}</h1>
      <p>
        {l10n.t('Keys: {keys} · Languages: {languages}', {
          keys: formatNumber(model.rows.length),
          languages: formatNumber(model.locales.length),
        })}
      </p>
      <Toolbar store={store} />
      <LanguageChips store={store} locales={model.locales} />
      <FilterBar store={store} model={model} />
    </>
  );
}
