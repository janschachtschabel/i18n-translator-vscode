import js from '@eslint/js';
import { builtinModules } from 'node:module';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

// Node built-ins by bare name ('fs', 'path/posix', ...); 'node:*' imports are matched by pattern.
const nodeBuiltins = (message) => builtinModules.map((name) => ({ name, message }));
const NEUTRAL_NODE_MESSAGE = 'src/core and src/shared must also run in the webview; keep Node APIs out.';
const WEBVIEW_NODE_MESSAGE = 'The webview runs in a browser, not in Node.';
const HTML_MESSAGE = 'Show texts as text: they come from files and are never parsed as HTML.';

/**
 * Layer rule for platform-neutral code (no VS Code, no Node, no DOM): the extension host, the webview and CLI
 * scripts can all reuse it, and it stays unit-testable. `outer` are the layers it must not depend on.
 */
const platformNeutral = (layer, outer) => ({
  files: [`src/${layer}/**/*.ts`],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          { name: 'vscode', message: `src/${layer} must not depend on the VS Code API.` },
          ...nodeBuiltins(NEUTRAL_NODE_MESSAGE),
        ],
        patterns: [
          {
            group: outer.map((name) => `**/${name}/**`),
            message: `src/${layer} must not depend on ${outer.map((name) => `src/${name}`).join(', ')}.`,
          },
          { group: ['node:*'], message: NEUTRAL_NODE_MESSAGE },
        ],
      },
    ],
    'no-restricted-globals': [
      'error',
      'window',
      'document',
      'navigator',
      ...['Buffer', 'process', 'global', 'require', 'module', '__dirname', '__filename', 'setImmediate'].map(
        (name) => ({ name, message: NEUTRAL_NODE_MESSAGE }),
      ),
    ],
  },
});

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
  platformNeutral('core', ['shared', 'extension', 'webview']),
  platformNeutral('shared', ['extension', 'webview']),
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
      // Texts come from files in the repository: they are shown as text, never parsed as HTML (design §6.12).
      'no-restricted-syntax': [
        'error',
        { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: HTML_MESSAGE },
      ],
      'no-restricted-properties': [
        'error',
        ...['innerHTML', 'outerHTML', 'insertAdjacentHTML'].map((property) => ({
          property,
          message: HTML_MESSAGE,
        })),
        { object: 'document', property: 'write', message: HTML_MESSAGE },
      ],
    },
  },
);
