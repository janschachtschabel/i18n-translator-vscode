import * as vscode from 'vscode';
import {
  BACKUP_SETTING_KEYS,
  parseBackupSettings,
  parseSettings,
  SETTING_KEYS,
  type BackupSettings,
  type Settings,
} from '../core/config/settings';

/**
 * Reads and validates the `eduI18n.*` settings that apply to `scope` (a workspace folder). In Restricted
 * Mode, VS Code leaves out workspace values of the settings listed in `restrictedConfigurations`.
 */
export function readSettings(scope: vscode.Uri): { settings: Settings; errors: string[] } {
  const config = vscode.workspace.getConfiguration('eduI18n', scope);
  return parseSettings(Object.fromEntries(SETTING_KEYS.map((key) => [key, config.get(key)])));
}

/** Reads and validates the `eduI18n.backup.*` settings, which apply to the window rather than to a folder. */
export function readBackupSettings(): { settings: BackupSettings; errors: string[] } {
  const config = vscode.workspace.getConfiguration('eduI18n');
  return parseBackupSettings(Object.fromEntries(BACKUP_SETTING_KEYS.map((key) => [key, config.get(key)])));
}

/** One glob for the `exclude` argument of `findFiles`; null excludes nothing. */
export function excludeGlob(patterns: readonly string[]): string | null {
  if (patterns.length <= 1) {
    return patterns[0] ?? null;
  }
  return `{${patterns.join(',')}}`;
}
