import * as ts from 'typescript';

export interface L10nCalls {
  /** First arguments of `l10n.t(...)` calls, as the runtime sees them (escape sequences resolved). */
  messages: string[];
  /** Calls whose message cannot be collected statically, as `file:line: reason`. */
  problems: string[];
}

/** Collects the messages passed to `l10n.t()` / `vscode.l10n.t()` from TypeScript source text. */
export function collectL10nCalls(sourceText: string, fileName: string): L10nCalls {
  const source = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  const result: L10nCalls = { messages: [], problems: [] };

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isL10nT(node.expression)) {
      const [first] = node.arguments;
      if (first && ts.isStringLiteralLike(first)) {
        result.messages.push(first.text);
      } else {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        result.problems.push(`${fileName}:${line}: l10n.t() needs a string literal as its first argument`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return result;
}

function isL10nT(callee: ts.Expression): boolean {
  if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== 't') {
    return false;
  }
  const owner = callee.expression;
  return (
    (ts.isIdentifier(owner) && owner.text === 'l10n') ||
    (ts.isPropertyAccessExpression(owner) && owner.name.text === 'l10n')
  );
}
