/** The message of a caught error, for logs and for the `{error}` part of a localized message. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
