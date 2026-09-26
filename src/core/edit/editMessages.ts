import type { MessageText } from '../checks/messages';

/** Why an edit cannot be planned. */
export type EditProblemCode =
  | 'reference-empty'
  | 'reference-required'
  | 'no-reference'
  | 'missing-file'
  | 'unreadable-file'
  | 'missing-key'
  | 'key-exists'
  | 'path-conflict'
  | 'not-a-text'
  | 'invalid-key'
  | 'invalid-locale'
  | 'locale-exists'
  | 'changed'
  | 'missing-bundle';

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
  'reference-required': '{key} needs a text in the reference language {locale}.',
  'no-reference': '{bundle} has no file in the reference language; add that language first.',
  'missing-file': '{bundle} has no file for {locale} yet; add the language first.',
  'unreadable-file': '{file} has a syntax error; fix it before changing texts in this bundle.',
  'missing-key': '{key} does not exist in {bundle}.',
  'key-exists': '{key} already exists in {bundle}.',
  'path-conflict': '{key} collides with {other}: a key cannot be a text and contain other keys.',
  'not-a-text': '{file} has a value at {key} that is not a text; correct the file first.',
  'invalid-key': 'Every part of a key needs a name, e.g. SECTION.TITLE.',
  'invalid-locale': '{locale} is not a valid language code for {area}.',
  'locale-exists': 'Every bundle already has a file for {locale}.',
  changed: '{key} in {locale} was changed in the meantime.',
  'missing-bundle': '{bundle} is no longer in the workspace; nothing was written.',
  'exists-in-other-bundle':
    '{top} also exists in {bundles}. At runtime, the bundle that comes last in the merge order replaces {top} of the others as a whole.',
};

export function editProblem(code: EditProblemCode, args: Record<string, string>): EditProblem {
  return { code, message: { template: EDIT_MESSAGES[code], args } };
}

export function editWarning(code: EditWarningCode, args: Record<string, string>): EditWarning {
  return { code, message: { template: EDIT_MESSAGES[code], args } };
}
