import type * as vscode from 'vscode';

/** Where the b-api key comes from: VS Code's secret storage, the environment variable B_API_KEY, or nowhere. */
export type KeySource = 'secret' | 'env' | 'none';

const SECRET = 'eduI18n.bApiKey';
const MAX_KEY_LENGTH = 512;

/**
 * The b-api key: kept in VS Code's secret storage, which the operating system encrypts, or taken from the environment
 * variable B_API_KEY, which only this class reads. The key goes into the header of a request and nowhere else: not
 * into settings, messages, the log or a webview.
 */
export class ApiKeyStore {
  constructor(
    private readonly secrets: Pick<vscode.SecretStorage, 'get' | 'store' | 'delete' | 'onDidChange'>,
    private readonly env: Readonly<Record<string, string | undefined>> = process.env,
  ) {}

  /** Fires when the stored key changes, also when another window changed it. */
  readonly onDidChange = (listener: () => void): vscode.Disposable =>
    this.secrets.onDidChange((event) => {
      if (event.key === SECRET) {
        listener();
      }
    });

  /** The key and where it comes from; undefined without one. */
  async key(): Promise<{ value: string; source: Exclude<KeySource, 'none'> } | undefined> {
    const stored = await this.secrets.get(SECRET);
    if (stored) {
      return { value: stored, source: 'secret' };
    }
    const fromEnvironment = this.env['B_API_KEY']?.trim();
    return fromEnvironment ? { value: fromEnvironment, source: 'env' } : undefined;
  }

  async source(): Promise<KeySource> {
    return (await this.key())?.source ?? 'none';
  }

  /** Keeps a key that {@link keyProblem} accepts, trimmed. */
  set(value: string): Thenable<void> {
    return this.secrets.store(SECRET, value.trim());
  }

  clear(): Thenable<void> {
    return this.secrets.delete(SECRET);
  }
}

/** Why a typed key cannot be one, before it is trimmed; undefined if it can. */
export function keyProblem(value: string): 'empty' | 'blank' | 'too-long' | undefined {
  const key = value.trim();
  if (key === '') {
    return 'empty';
  }
  if (/\s/.test(key)) {
    return 'blank';
  }
  return key.length > MAX_KEY_LENGTH ? 'too-long' : undefined;
}
