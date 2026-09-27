import * as vscode from 'vscode';
import type { Prompts } from '../commands/prompts';

const GRANTED = 'eduI18n.aiConsent';

/**
 * The one-time notice before texts of the workspace go to the b-api (design §6.8), per address: moving to another
 * one (e.g. production) asks again. Kept for the user, not per workspace.
 */
export class AiConsent {
  /**
   * The hosts agreed to in this session. All windows share the global state: one that had not seen a consent yet may
   * store its older list, which would ask here again.
   */
  private readonly agreed = new Set<string>();

  constructor(private readonly memento: vscode.Memento) {}

  /** Whether texts may go to `host`; asks the first time, and remembers a yes. */
  async ensure(host: string, prompts: Prompts): Promise<boolean> {
    if (this.granted().has(host)) {
      return true;
    }
    const agreed = await prompts.confirm(
      vscode.l10n.t(
        'The AI sends texts of these translation files to {host}: the text to translate, its key and its texts in other languages. They hold no personal data. Send texts to {host}?',
        { host },
      ),
      vscode.l10n.t('Send Texts'),
      vscode.l10n.t('You are asked once per address. eduI18n.ai.enabled turns the AI off.'),
    );
    if (agreed) {
      this.agreed.add(host);
      // Read again: the question of another editor may have been answered meanwhile.
      await this.memento.update(GRANTED, [...this.granted()]);
    }
    return agreed;
  }

  /** The hosts agreed to: stored, or in this session. */
  private granted(): Set<string> {
    const stored = this.memento.get<unknown>(GRANTED);
    const hosts = Array.isArray(stored)
      ? stored.filter((item): item is string => typeof item === 'string')
      : [];
    return new Set([...hosts, ...this.agreed]);
  }
}
