// Copies the synthetic fixture workspace into out/dev-workspace, which F5 ("Run Extension") opens: the extension
// writes files, and test/fixtures must stay byte for byte as committed. Every launch starts from a fresh copy.
import { cpSync, rmSync } from 'node:fs';

rmSync('out/dev-workspace', { recursive: true, force: true });
cpSync('test/fixtures/workspace-basic', 'out/dev-workspace', { recursive: true });
