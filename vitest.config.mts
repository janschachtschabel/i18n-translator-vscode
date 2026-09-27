import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The webview uses Preact's JSX runtime, as in esbuild.mjs and tsconfig.webview.json.
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  test: {
    include: ['test/unit/**/*.test.{ts,tsx}'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: [
        'src/core/**/*.ts',
        'src/shared/**/*.ts',
        'src/webview/**/*.{ts,tsx}',
        // The modules of the extension host that run without VS Code; the rest runs in the integration tests.
        'src/extension/commands/inputBox.ts',
        'src/extension/panels/mailPreviewHtml.ts',
        'src/extension/panels/messageRouter.ts',
        'src/extension/panels/webviewHtml.ts',
        'src/extension/services/apiKeyStore.ts',
        'src/extension/services/serialRunner.ts',
        'src/extension/services/undoHistory.ts',
        'src/extension/services/uriPaths.ts',
        'src/extension/views/viewText.ts',
      ],
      // The entry point only connects the app to VS Code; the integration tests run it in a real webview.
      exclude: ['src/webview/main.tsx'],
      thresholds: { lines: 90 },
    },
  },
});
