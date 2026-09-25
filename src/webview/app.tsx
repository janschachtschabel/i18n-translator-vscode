import type { BundleViewModel } from '../shared/viewModel';
import { LiveRegion } from './a11y/liveRegion';
import { l10n } from './l10n';
import { missingNotice, type EditorStore, type View } from './state/store';

export function App({ store }: { store: EditorStore }) {
  return (
    <>
      <main>
        <Content view={store.view.value} />
      </main>
      <LiveRegion announcement={store.announcement} />
    </>
  );
}

function Content({ view }: { view: View }) {
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
      return <BundleSummary model={view.model} />;
  }
}

function BundleSummary({ model }: { model: BundleViewModel }) {
  // The host puts the language of VS Code into the page.
  const numbers = new Intl.NumberFormat(document.documentElement.lang || undefined);
  return (
    <>
      <h1>{model.name}</h1>
      <p>
        {l10n.t('Keys: {keys} · Languages: {languages}', {
          keys: numbers.format(model.rows.length),
          languages: numbers.format(model.locales.length),
        })}
      </p>
    </>
  );
}
