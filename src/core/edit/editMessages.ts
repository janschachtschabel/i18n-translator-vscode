import type { MessageText } from '../checks/messages';

/** Why an edit cannot be planned. */
export type EditProblemCode =
  | 'reference-empty'
  | 'missing-file'
  | 'unreadable-file'
  | 'missing-key'
  | 'key-exists'
  | 'path-conflict'
  | 'invalid-key'
  | 'invalid-locale'
  | 'locale-exists'
  | 'changed';

/** What the user should know before an edit that is possible. */
export type EditWarningCode = 'exists-in-other-bundle';

export interface EditProblem {
  code: EditProblemCode;
  message: MessageText;
}

export interface EditWarning {
  code: EditWarningCode;
  message: MessageText;
}

/** English templates of the problems and warnings; hosts localize them like the issue messages. */
export const EDIT_MESSAGES: Readonly<Record<EditProblemCode | EditWarningCode, string>> = {
  'reference-empty': 'The reference text of {key} cannot be empty; delete the key instead.',
  'missing-file': '{bundle} has no file for {locale} yet; add the language first.',
  'unreadable-file': '{file} has a syntax error; fix it before changing texts in this bundle.',
  'missing-key': '{key} does not exist in {bundle}.',
  'key-exists': '{key} already exists in {bundle}.',
  'path-conflict': '{key} collides with {other}: a key cannot be a text and contain other keys.',
  'invalid-key': 'Every part of a key needs a name, e.g. SECTION.TITLE.',
  'invalid-locale': '{locale} is not a language code of {area}.',
  'locale-exists': 'Every bundle already has a file for {locale}.',
  changed: '{key} in {locale} was changed in the meantime.',
  'exists-in-other-bundle':
    "{top} also exists in {bundles}. At runtime, one bundle replaces the other's {top} as a whole.",
};

export function editProblem(code: EditProblemCode, args: Record<string, string>): EditProblem {
  return { code, message: { template: EDIT_MESSAGES[code], args } };
}

export function editWarning(code: EditWarningCode, args: Record<string, string>): EditWarning {
  return { code, message: { template: EDIT_MESSAGES[code], args } };
}
