import * as vscode from 'vscode';
import type { ClientOptions } from '../../core/ai/bapiClient';
import { aiAvailability, type AiUnavailable } from '../../core/ai/connection';
import type { AiSettings } from '../../core/config/aiSettings';
import { readAiSettings } from '../config';
import type { ApiKeyStore, KeySource } from './apiKeyStore';

export interface AiStatus {
  available: boolean;
  reason?: AiUnavailable;
  settings: AiSettings;
  keySource: KeySource;
  /** Where the requests go, for messages: the host of the address. */
  host: string;
}

/**
 * The AI connection of the window: its settings, the key, and whether the AI can be used. Requests get the key here
 * and nowhere else; the log gets neither the key nor texts.
 */
export class AiService implements vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  /** Fires when the settings, the key or the trust of the workspace change, which may change the status. */
  readonly onDidChange = this.changed.event;
  private readonly subscriptions: vscode.Disposable[];
  private reported = '';

  constructor(
    private readonly keys: ApiKeyStore,
    private readonly log: vscode.LogOutputChannel,
    private readonly fetch: typeof globalThis.fetch = globalThis.fetch,
  ) {
    this.subscriptions = [
      this.changed,
      keys.onDidChange(() => this.changed.fire()),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('eduI18n.ai')) {
          this.changed.fire();
        }
      }),
      vscode.workspace.onDidGrantWorkspaceTrust(() => this.changed.fire()),
    ];
  }

  /** The settings; invalid values are logged once, when they change. */
  settings(): AiSettings {
    const { settings, errors } = readAiSettings();
    const report = errors.join('\n');
    if (report !== this.reported) {
      this.reported = report;
      errors.forEach((error) => this.log.warn(error));
    }
    return settings;
  }

  async status(): Promise<AiStatus> {
    const settings = this.settings();
    const keySource = await this.keys.source();
    const availability = aiAvailability({
      enabled: settings.enabled,
      trusted: vscode.workspace.isTrusted,
      baseUrl: settings.baseUrl,
      keySource,
    });
    const host = settings.baseUrl === undefined ? '' : new URL(settings.baseUrl).host;
    return { ...availability, settings, keySource, host };
  }

  /** What a request needs, the key included; undefined while the AI cannot be used. */
  async client(): Promise<{ options: ClientOptions; status: AiStatus } | undefined> {
    const status = await this.status();
    const key = await this.keys.key();
    const { baseUrl, provider, timeoutSeconds } = status.settings;
    if (!status.available || !key || baseUrl === undefined) {
      return undefined;
    }
    return {
      status,
      options: { baseUrl, provider, key: key.value, timeoutMs: timeoutSeconds * 1000, fetch: this.fetch },
    };
  }

  dispose(): void {
    vscode.Disposable.from(...this.subscriptions).dispose();
  }
}
