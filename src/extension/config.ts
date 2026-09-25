import * as vscode from 'vscode';
import { parseSettings, SETTING_KEYS, type Settings } from '../core/config/settings';

/**
 * Reads and validates the `eduI18n.*` settings that apply to `scope` (a workspace folder; without one, the
 * values of the window and the workspace). In Restricted Mode, VS Code leaves out workspace values of the
 * settings listed in `restrictedConfigurations`.
 */
export function readSettings(scope?: vscode.Uri): { settings: Settings; errors: string[] } {
  const config = vscode.workspace.getConfiguration('eduI18n', scope);
  return parseSettings(Object.fromEntries(SETTING_KEYS.map((key) => [key, config.get(key)])));
}

/** One glob for the `exclude` argument of `findFiles`; null excludes nothing. */
export function excludeGlob(patterns: readonly string[]): string | null {
  if (patterns.length <= 1) {
    return patterns[0] ?? null;
  }
  return `{${patterns.join(',')}}`;
}
