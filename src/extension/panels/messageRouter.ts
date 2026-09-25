import { isWebviewToHost, type WebviewToHost } from '../../shared/protocol';

/** A handler per message type; messages of a type without one are logged and dropped. */
export type MessageHandlers = {
  [Type in WebviewToHost['type']]?: (message: Extract<WebviewToHost, { type: Type }>) => void | Promise<void>;
};

/** The part of the output channel the router writes to. */
export interface RouterLog {
  warn(message: string): void;
  error(message: string, error: unknown): void;
}

/**
 * Passes a message from the webview to its handler. The webview is a separate context, so nothing it sends
 * is trusted: invalid and unhandled messages are logged (never their texts) and dropped. A failing handler is
 * logged, since nobody awaits a message listener.
 */
export async function routeMessage(
  message: unknown,
  handlers: MessageHandlers,
  log: RouterLog,
): Promise<void> {
  if (!isWebviewToHost(message)) {
    log.warn(`Dropped an invalid message from the editor (${describe(message)}).`);
    return;
  }
  // TypeScript cannot relate the handler's parameter to the message's type.
  const handler = handlers[message.type] as ((message: WebviewToHost) => void | Promise<void>) | undefined;
  if (!handler) {
    log.warn(`Dropped a "${message.type}" message from the editor: not handled.`);
    return;
  }
  try {
    await handler(message);
  } catch (error) {
    log.error(`Handling a "${message.type}" message from the editor failed.`, error);
  }
}

const MAX_LOGGED_TYPE_LENGTH = 50;

/** What a dropped message was, without its content: it may hold texts of the user's files. */
function describe(message: unknown): string {
  if (message === null || message === undefined) {
    return String(message);
  }
  if (typeof message !== 'object') {
    return `a ${typeof message}`;
  }
  const type = (message as Record<string, unknown>)['type'];
  if (typeof type !== 'string') {
    return 'without a type';
  }
  return type.length <= MAX_LOGGED_TYPE_LENGTH
    ? `type ${JSON.stringify(type)}`
    : `type of ${type.length} characters`;
}
