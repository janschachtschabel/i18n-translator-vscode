// Bundles the extension and its editor webview (and, with --tests, the integration tests).
import * as esbuild from 'esbuild';

const args = new Set(process.argv.slice(2));
const production = args.has('--production');
const watch = args.has('--watch');
const tests = args.has('--tests');

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  sourcemap: production ? false : 'linked',
  minify: production,
  logLevel: 'info',
};

/** @type {import('esbuild').BuildOptions} */
const host = {
  ...common,
  platform: 'node',
  format: 'cjs',
  target: 'node20', // VS Code 1.90 ships Node 20
  // Prefer ESM entry points: jsonc-parser's "main" is a UMD build whose internal require() calls
  // esbuild cannot follow, which would leave them unbundled (the VSIX ships without node_modules).
  mainFields: ['module', 'main'],
};

/** @type {import('esbuild').BuildOptions[]} */
const builds = tests
  ? [
      {
        ...host,
        entryPoints: ['test/integration/**/*.test.ts'],
        outbase: 'test/integration',
        outdir: 'out/test/integration',
        external: ['vscode', 'mocha'],
      },
    ]
  : [
      {
        ...host,
        entryPoints: ['src/extension/extension.ts'],
        outfile: 'dist/extension.js',
        external: ['vscode'],
      },
      {
        // The editor webview: main.js and main.css, the only files it may load (localResourceRoots).
        ...common,
        platform: 'browser',
        format: 'iife',
        target: 'chrome122', // VS Code 1.90 runs webviews in Electron 29 (Chromium 122)
        jsx: 'automatic',
        jsxImportSource: 'preact',
        entryPoints: ['src/webview/main.tsx'],
        outdir: 'dist/webview',
      },
    ];

if (watch) {
  for (const options of builds) {
    await (await esbuild.context(options)).watch();
  }
} else {
  await Promise.all(builds.map((options) => esbuild.build(options)));
}
