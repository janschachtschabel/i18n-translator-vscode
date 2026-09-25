import { render } from 'preact';
import type { HostToWebview } from '../shared/protocol';
import { App } from './app';
import { EditorStore, type HostApi } from './state/store';
import './styles/base.css';

declare function acquireVsCodeApi(): HostApi;

const host = acquireVsCodeApi();
const store = new EditorStore(host);
// Only the host posts to the webview, and it builds its messages itself (see HostToWebview).
window.addEventListener('message', (event: MessageEvent<HostToWebview>) => store.receive(event.data));
render(<App store={store} />, document.getElementById('root')!);
host.postMessage({ type: 'ready' });
