import * as vscode from 'vscode';
import { AiError } from '../../core/ai/aiErrors';
import type { AiUnavailable } from '../../core/ai/connection';
import { showError, showWarning } from '../notify';
import { messageOf } from './errors';
import type { AiStatus } from './aiService';

/** A step that solves a problem: its button in the message and the command it runs. */
interface Step {
  label: string;
  run: () => Thenable<unknown>;
}

const setKey = (): Step => ({
  label: vscode.l10n.t('Set API Key…'),
  run: () => vscode.commands.executeCommand('eduI18n.setApiKey'),
});
const chooseModel = (): Step => ({
  label: vscode.l10n.t('Choose Model…'),
  run: () => vscode.commands.executeCommand('eduI18n.selectModel'),
});
const openSettings = (): Step => ({
  label: vscode.l10n.t('Open Settings'),
  run: () => vscode.commands.executeCommand('workbench.action.openSettings', 'eduI18n.ai'),
});

/** Says why the AI cannot be used and offers the step that solves it (WCAG 3.3.3). */
export async function explainUnavailable(reason: AiUnavailable): Promise<void> {
  switch (reason) {
    case 'disabled':
      return offer(
        showWarning,
        vscode.l10n.t('The AI functions are turned off (eduI18n.ai.enabled).'),
        openSettings(),
      );
    case 'untrusted':
      return offer(
        showWarning,
        vscode.l10n.t('The AI functions are off in Restricted Mode. Trust the workspace to use them.'),
        {
          label: vscode.l10n.t('Manage Workspace Trust'),
          run: () => vscode.commands.executeCommand('workbench.trust.manage'),
        },
      );
    case 'no-key':
      return offer(
        showWarning,
        vscode.l10n.t(
          'No b-api key is set. The AI functions need one; it is the key B_API_KEY of the old app.',
        ),
        setKey(),
      );
  }
}

/**
 * Says why a request failed, with the cause and the step that solves it; a cancelled request needs no message. An
 * error that is no AiError is a fault of the extension: it goes to the log with its stack.
 */
export async function showAiFailure(
  error: unknown,
  status: AiStatus,
  log: vscode.LogOutputChannel,
): Promise<void> {
  if (!(error instanceof AiError)) {
    log.error('An AI request failed.', error);
    return offer(showError, vscode.l10n.t('The AI request failed: {error}', { error: messageOf(error) }));
  }
  log.warn(`An AI request failed: ${error.message}${error.requestId ? ` Request ${error.requestId}.` : ''}`);
  if (error.code === 'aborted') {
    return;
  }
  const { host, settings } = status;
  const [message, step] = failure(error, host, settings.model, settings.timeoutSeconds);
  const request = error.requestId ? ` ${vscode.l10n.t('Request ID: {id}', { id: error.requestId })}` : '';
  return offer(showError, message + request, ...(step ? [step] : []));
}

function failure(error: AiError, host: string, model: string, timeout: number): [string, Step?] {
  const status = String(error.status ?? '');
  switch (error.code) {
    case 'unauthorized':
      return [
        vscode.l10n.t('The b-api refused the key (HTTP {status}). Set a valid key.', { status }),
        setKey(),
      ];
    case 'model-not-found':
      return [
        vscode.l10n.t('The b-api does not know the model {model}. Choose another one.', { model }),
        chooseModel(),
      ];
    case 'bad-request':
      return [
        vscode.l10n.t(
          'The b-api refused the request (HTTP {status}). The model {model} may not take these settings, e.g. the reasoning effort.',
          { status, model },
        ),
        openSettings(),
      ];
    case 'unavailable':
      return [
        vscode.l10n.t(
          'The b-api is busy or unavailable (HTTP {status}), also after four attempts. Try again later.',
          {
            status,
          },
        ),
      ];
    case 'network':
      return [
        vscode.l10n.t(
          'The b-api at {host} could not be reached. Check the network, a proxy, or the address in eduI18n.ai.baseUrl.',
          { host },
        ),
        openSettings(),
      ];
    case 'timeout':
      return [
        vscode.l10n.t('The b-api did not answer within {seconds} seconds (eduI18n.ai.timeoutSeconds).', {
          seconds: String(timeout),
        }),
        openSettings(),
      ];
    case 'redirect':
      return [
        vscode.l10n.t(
          'The address of the b-api redirects elsewhere; requests with the key follow no redirect. Check eduI18n.ai.baseUrl.',
        ),
        openSettings(),
      ];
    case 'length':
      return [vscode.l10n.t('The answer of the b-api was cut off at its token limit.')];
    case 'invalid-response':
      return [vscode.l10n.t('The answer of the b-api could not be read.')];
    case 'aborted':
      return [''];
  }
}

async function offer(
  show: (message: string, ...actions: string[]) => Thenable<string | undefined>,
  message: string,
  ...steps: Step[]
): Promise<void> {
  const chosen = await show(message, ...steps.map((step) => step.label));
  await steps.find((step) => step.label === chosen)?.run();
}
