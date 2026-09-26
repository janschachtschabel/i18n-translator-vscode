import { describe, expect, it } from 'vitest';
import { routeMessage, type MessageHandlers } from '../../../src/extension/panels/messageRouter';
import type { WebviewToHost } from '../../../src/shared/protocol';

function recorder() {
  const log: string[] = [];
  const received: WebviewToHost[] = [];
  return {
    log,
    received,
    channel: {
      warn: (message: string) => log.push(`warn: ${message}`),
      error: (message: string, error: unknown) => log.push(`error: ${message} ${String(error)}`),
    },
    handlers: {
      ready: (message) => void received.push(message),
      undo: (message) => void received.push(message),
    } satisfies MessageHandlers,
  };
}

describe('routeMessage', () => {
  it('passes a valid message to its handler', async () => {
    const { log, received, channel, handlers } = recorder();
    await routeMessage({ type: 'ready' }, handlers, channel);
    expect(received).toEqual([{ type: 'ready' }]);
    expect(log).toEqual([]);
  });

  it('drops an invalid message and logs its type, not its content', async () => {
    const { log, received, channel, handlers } = recorder();
    await routeMessage({ type: 'edit', value: 'private text' }, handlers, channel);
    await routeMessage('ready', handlers, channel);
    await routeMessage({ type: 'x'.repeat(500) }, handlers, channel);
    expect(received).toEqual([]);
    expect(log).toEqual([
      'warn: Dropped an invalid message from the editor (type "edit").',
      'warn: Dropped an invalid message from the editor (a string).',
      'warn: Dropped an invalid message from the editor (type of 500 characters).',
    ]);
  });

  it('drops a valid message nobody handles', async () => {
    const { log, received, channel, handlers } = recorder();
    await routeMessage({ type: 'command', command: 'addKey' }, handlers, channel);
    expect(received).toEqual([]);
    expect(log).toEqual(['warn: Dropped a "command" message from the editor: not handled.']);
  });

  it('logs a failing handler instead of rejecting', async () => {
    const { log, channel } = recorder();
    const failing: MessageHandlers = {
      ready: () => Promise.reject(new Error('disposed')),
    };
    await routeMessage({ type: 'ready' }, failing, channel);
    expect(log).toEqual(['error: Handling a "ready" message from the editor failed. Error: disposed']);
  });
});
