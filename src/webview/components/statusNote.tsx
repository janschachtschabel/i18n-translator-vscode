import type { Severity } from '../../core/checks/types';
import { SEVERITY_SYMBOLS, severityWord } from './cellStatus';

/** The symbol of a severity, or the check mark of a text without a finding; screen readers skip it. */
export function StatusSymbol({ severity }: { severity: Severity | 'ok' }) {
  return (
    <span aria-hidden="true" class={`status-symbol ${severity}`}>
      {severity === 'ok' ? '✓' : SEVERITY_SYMBOLS[severity]}
    </span>
  );
}

/** A symbol and a text; screen readers get the severity in words instead of the symbol. */
export function StatusNote({ severity, text }: { severity: Severity | 'ok'; text: string }) {
  return (
    <>
      <StatusSymbol severity={severity} />{' '}
      {severity !== 'ok' && <span class="visually-hidden">{severityWord(severity)}: </span>}
      {text}
    </>
  );
}
