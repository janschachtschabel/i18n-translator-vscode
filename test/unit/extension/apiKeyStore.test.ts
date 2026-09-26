import type * as vscode from 'vscode';
import { describe, expect, it } from 'vitest';
import { ApiKeyStore, keyProblem } from '../../../src/extension/services/apiKeyStore';

/** VS Code's secret storage as far as the store uses it, with its change event. */
function secretStorage() {
  const values = new Map<string, string>();
  const listeners: ((event: vscode.SecretStorageChangeEvent) => void)[] = [];
  const changed = (key: string) => listeners.forEach((listener) => listener({ key }));
  return {
    values,
    changed,
    get: async (key: string) => values.get(key),
    store: async (key: string, value: string) => void (values.set(key, value), changed(key)),
    delete: async (key: string) => void (values.delete(key), changed(key)),
    onDidChange: ((listener: (event: vscode.SecretStorageChangeEvent) => void) => {
      listeners.push(listener);
      return { dispose: () => void listeners.splice(listeners.indexOf(listener), 1) };
    }) as vscode.Event<vscode.SecretStorageChangeEvent>,
  };
}

describe('ApiKeyStore', () => {
  it('keeps the key in the secret storage, which comes before the environment variable', async () => {
    const secrets = secretStorage();
    const keys = new ApiKeyStore(secrets, { B_API_KEY: 'from-the-environment' });
    expect(await keys.source()).toBe('env');
    await keys.set('stored-key');
    expect(await keys.key()).toEqual({ value: 'stored-key', source: 'secret' });
    expect([...secrets.values.keys()]).toEqual(['eduI18n.bApiKey']);
    await keys.clear();
    expect(await keys.key()).toEqual({ value: 'from-the-environment', source: 'env' });
  });

  it('has none without either; an empty or blank environment variable counts as none', async () => {
    expect(await new ApiKeyStore(secretStorage(), {}).source()).toBe('none');
    expect(await new ApiKeyStore(secretStorage(), { B_API_KEY: '  ' }).key()).toBeUndefined();
  });

  it('says when its own key changes, also in another window, and not for other secrets', async () => {
    const secrets = secretStorage();
    const keys = new ApiKeyStore(secrets, {});
    let changes = 0;
    const subscription = keys.onDidChange(() => changes++);
    await keys.set('stored-key');
    secrets.changed('another.extension.secret');
    subscription.dispose();
    await keys.clear();
    expect(changes).toBe(1);
  });
});

describe('keyProblem', () => {
  it('takes a key without blanks inside, trimmed, of up to 512 characters', () => {
    expect(keyProblem('  abc-123_XYZ.=\n')).toBeUndefined();
    expect(keyProblem('x'.repeat(512))).toBeUndefined();
    expect(keyProblem('')).toBe('empty');
    expect(keyProblem(' \n ')).toBe('empty');
    expect(keyProblem('abc def')).toBe('blank');
    expect(keyProblem('abc\ndef')).toBe('blank');
    expect(keyProblem('x'.repeat(513))).toBe('too-long');
  });
});
