import js from '@eslint/js';
import { builtinModules } from 'node:module';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

// Node built-ins by bare name ('fs', 'path/posix', ...); 'node:*' imports are matched by pattern.
const nodeBuiltins = (message) => builtinModules.map((name) => ({ name, message }));
const CORE_NODE_MESSAGE = 'src/core must also run in the webview; keep Node APIs out.';
const WEBVIEW_NODE_MESSAGE = 'The webview runs in a browser, not in Node.';

export default defineConfig(
  { ignores: ['dist/', 'out/', 'coverage/', '.vscode-test/', 'node_modules/', 'test/fixtures/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      // Omitting a property via rest destructuring (`const { a, ...rest } = obj`) is intentional.
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
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
          paths: [
            { name: 'vscode', message: 'src/core must not depend on the VS Code API.' },
            ...nodeBuiltins(CORE_NODE_MESSAGE),
          ],
          patterns: [
            {
              group: ['**/extension/**', '**/webview/**'],
              message: 'src/core must not depend on outer layers.',
            },
            { group: ['node:*'], message: CORE_NODE_MESSAGE },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'navigator',
        ...[
          'Buffer',
          'process',
          'global',
          'require',
          'module',
          '__dirname',
          '__filename',
          'setImmediate',
        ].map((name) => ({ name, message: CORE_NODE_MESSAGE })),
      ],
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
            ...nodeBuiltins(WEBVIEW_NODE_MESSAGE),
          ],
          patterns: [
            { group: ['**/extension/**'], message: 'The webview must not import extension-host code.' },
            { group: ['node:*'], message: WEBVIEW_NODE_MESSAGE },
          ],
        },
      ],
    },
  },
);
