import * as vscode from 'vscode';
import type { AiErrorCode } from '../../core/ai/aiErrors';
import { AiError } from '../../core/ai/aiErrors';
import { listModels } from '../../core/ai/bapiClient';
import { chatModels, testConnection } from '../../core/ai/connection';
import { showFailure, showInfo, showWarning } from '../notify';
import { explainUnavailable, showAiFailure } from '../services/aiFeedback';
import type { AiService } from '../services/aiService';
import type { Prompts } from './prompts';

/** How a connection test ended: for the integration tests; the user reads the message. */
export type ConnectionOutcome = 'connected' | 'model-missing' | 'unavailable' | AiErrorCode | 'failed';

/**
 * Tests the connection with the configured provider and model: lists the models and asks the model for a tiny
 * answer (a fixed text, nothing of the workspace). Says the result, with the step that solves a problem.
 */
export async function testAiConnection(
  ai: AiService,
  log: vscode.LogOutputChannel,
): Promise<ConnectionOutcome> {
  const client = await ai.client();
  if (!client) {
    const { reason } = await ai.status();
    void explainUnavailable(reason ?? 'no-key');
    return 'unavailable';
  }
  const { options, status } = client;
  const { model, reasoningEffort } = status.settings;
  try {
    const result = await withCancellableProgress(vscode.l10n.t('Testing the b-api connection…'), (signal) =>
      testConnection(options, { model, effort: reasoningEffort }, Date.now, signal),
    );
    if (!result.modelFound) {
      const choose = vscode.l10n.t('Choose Model…');
      void showWarning(
        vscode.l10n.t('The b-api at {host} answers, but does not offer the model {model}.', {
          host: status.host,
          model,
        }),
        choose,
      )
        .then((chosen) => chosen === choose && vscode.commands.executeCommand('eduI18n.selectModel'))
        .then(undefined, showFailure);
      return 'model-missing';
    }
    log.info(`The b-api at ${status.host} works: ${model} answered in ${result.durationMs} ms.`);
    void showInfo(
      vscode.l10n.t('The b-api at {host} works: {model} answered in {seconds} s.', {
        host: status.host,
        model,
        seconds: ((result.durationMs ?? 0) / 1000).toFixed(1),
      }),
    );
    return 'connected';
  } catch (error) {
    void showAiFailure(error, status, log);
    return error instanceof AiError ? error.code : 'failed';
  }
}

/**
 * Runs `work` with a notification that shows it runs and can cancel it: a server that hangs would otherwise keep it
 * for minutes (the timeout and the repeats). A cancelled request fails as `aborted`, which needs no message.
 */
function withCancellableProgress<T>(title: string, work: (signal: AbortSignal) => Promise<T>): Thenable<T> {
  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title, cancellable: true },
    (_progress, token) => {
      const controller = new AbortController();
      const subscription = token.onCancellationRequested(() => controller.abort());
      return work(controller.signal).finally(() => subscription.dispose());
    },
  );
}

/** Lets the user choose the model among the chat models of the provider; the model id chosen, or undefined. */
export async function selectModel(
  ai: AiService,
  prompts: Prompts,
  log: vscode.LogOutputChannel,
): Promise<string | undefined> {
  const client = await ai.client();
  if (!client) {
    const { reason } = await ai.status();
    void explainUnavailable(reason ?? 'no-key');
    return undefined;
  }
  const { options, status } = client;
  let models: string[];
  try {
    models = await withCancellableProgress(
      vscode.l10n.t('Loading the models of the b-api…'),
      async (signal) => chatModels(await listModels(options, signal)),
    );
  } catch (error) {
    void showAiFailure(error, status, log);
    return undefined;
  }
  const current = status.settings.model;
  const picked = await prompts.pick(
    models.map((model) => ({
      label: model,
      ...(model === current ? { description: vscode.l10n.t('current') } : {}),
      value: model,
    })),
    vscode.l10n.t('The model for translations and checks ({provider})', {
      provider: status.settings.provider,
    }),
  );
  if (picked === undefined) {
    return undefined;
  }
  await vscode.workspace
    .getConfiguration('eduI18n')
    .update('ai.model', picked, vscode.ConfigurationTarget.Global);
  void showInfo(vscode.l10n.t('The AI functions now use the model {model}.', { model: picked }));
  return picked;
}
