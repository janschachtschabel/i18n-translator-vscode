import type { Rule } from '../types';
import { emptyValueRule } from './emptyValue';
import { fileProblemRules } from './fileProblems';
import { htmlMismatchRule } from './htmlMismatch';
import { keyOverriddenRule, subtreeLostRule } from './mergeRules';
import { missingFileRule } from './missingFile';
import { misplacedKeyRule, missingKeyRule, orphanKeyRule } from './missingKeys';
import { placeholderMalformedRule } from './placeholderMalformed';
import { placeholderMismatchRule } from './placeholderMismatch';
import { sameAsReferenceRule } from './sameAsReference';
import { variantInconsistentRule, variantNeededRule, variantOrphanRule } from './variantRules';

/** Every rule of the check catalog (design §6.5). */
export const ALL_RULES: readonly Rule[] = [
  ...fileProblemRules,
  missingFileRule,
  missingKeyRule,
  emptyValueRule,
  orphanKeyRule,
  misplacedKeyRule,
  placeholderMalformedRule,
  placeholderMismatchRule,
  htmlMismatchRule,
  variantNeededRule,
  variantInconsistentRule,
  variantOrphanRule,
  keyOverriddenRule,
  subtreeLostRule,
  sameAsReferenceRule,
];
