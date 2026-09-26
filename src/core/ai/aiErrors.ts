/** Why a request to the b-api failed, for the message the user gets. */
export type AiErrorCode =
  | 'bad-request'
  | 'unauthorized'
  | 'model-not-found'
  | 'unavailable'
  | 'network'
  | 'timeout'
  | 'aborted'
  | 'redirect'
  | 'length'
  | 'invalid-response';

/**
 * A failed request to the b-api: its code, the HTTP status and the request id the b-api gave, if any. Never the key,
 * and never the body of an answer, which may quote the request.
 */
export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    readonly status?: number,
    readonly requestId?: string,
  ) {
    super(`The b-api request failed: ${code}${status === undefined ? '' : ` (HTTP ${status})`}.`);
    this.name = 'AiError';
  }
}
