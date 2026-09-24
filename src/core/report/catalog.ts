import { ISSUE_MESSAGES, MISSING_KEYS_MESSAGE } from '../checks/messages';
import { EDIT_MESSAGES } from '../edit/editMessages';

/** Every English template a host shows to users and has to translate. */
export const MESSAGE_TEMPLATES: readonly string[] = [
  ...Object.values(ISSUE_MESSAGES),
  MISSING_KEYS_MESSAGE,
  ...Object.values(EDIT_MESSAGES),
];
