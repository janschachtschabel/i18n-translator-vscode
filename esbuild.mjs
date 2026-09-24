// Bundles the extension (and, with --tests, the integration tests) for the VS Code extension host.
import * as esbuild from 'esbuild';

const args = new Set(process.argv.slice(2));
const production = args.has('--production');
const watch = args.has('--watch');
const tests = args.has('--tests');

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20', // VS Code 1.90 ships Node 20
  // Prefer ESM entry points: jsonc-parser's "main" is a UMD build whose internal require() calls
  // esbuild cannot follow, which would leave them unbundled (the VSIX ships without node_modules).
  mainFields: ['module', 'main'],
  sourcemap: production ? false : 'linked',
  minify: production,
  logLevel: 'info',
};

/** @type {import('esbuild').BuildOptions} */
const options = tests
  ? {
      ...common,
      entryPoints: ['test/integration/**/*.test.ts'],
      outbase: 'test/integration',
      outdir: 'out/test/integration',
      external: ['vscode', 'mocha'],
    }
  : {
      ...common,
      entryPoints: ['src/extension/extension.ts'],
      outfile: 'dist/extension.js',
      external: ['vscode'],
    };

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
