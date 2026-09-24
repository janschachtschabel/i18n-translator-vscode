import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist/', 'out/', 'coverage/', '.vscode-test/', 'node_modules/', 'test/fixtures/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
  },
  {
    // Layer rule: the core is platform-neutral (no VS Code, no Node, no DOM) so the extension host,
    // the webview and CLI scripts can all reuse it, and it stays unit-testable.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'vscode', message: 'src/core must not depend on the VS Code API.' }],
          patterns: [
            {
              group: ['**/extension/**', '**/webview/**'],
              message: 'src/core must not depend on outer layers.',
            },
            { group: ['node:*'], message: 'src/core must also run in the webview; keep Node APIs out.' },
          ],
        },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'navigator'],
    },
  },
  {
    // Layer rule: the webview runs in a browser sandbox and talks to the host only via messages.
    files: ['src/webview/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'vscode', message: 'The webview cannot use the VS Code API; post a message instead.' },
          ],
          patterns: [
            { group: ['**/extension/**'], message: 'The webview must not import extension-host code.' },
            { group: ['node:*'], message: 'The webview runs in a browser, not in Node.' },
          ],
        },
      ],
    },
  },
);
