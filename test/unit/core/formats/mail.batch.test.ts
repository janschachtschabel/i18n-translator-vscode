import { describe, expect, it } from 'vitest';
import { EditError, type FileOp } from '../../../../src/core/formats/adapter';
import { applyMailOps } from '../../../../src/core/formats/mail/mailWrite';
import { readMail } from '../../../../src/core/formats/mail/mailRead';
import { keyFromSegments } from '../../../../src/core/model/keys';

const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const key = (id: string, field: string) => keyFromSegments([id, field]);
const doc = (text: string) => ({ text, encoding: 'utf-8' as const, bom: false });

/** A small seeded generator (mulberry32), so that a failing case can be run again. */
function random(seed: number) {
  let state = seed;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;
  return { next, pick };
}

type Rng = ReturnType<typeof random>;

const NAMES = ['invited', 'reset', 'share', 'invited'];
const VALUES = ['Text', '', 'A & B <c>', '<p>x ]]> y</p>', 'Ärger', `two${LF}lines`];

/** A file of templates: the subject as text or empty, the message in CDATA, as text or empty; a field may be missing. */
function mailText(rng: Rng): string {
  const eol = rng.pick([LF, LF, CR + LF, CR]);
  const unit = rng.pick(['\t', '  ']);
  const inline = rng.next() < 0.3;
  const templates: string[] = [];
  // A template that no operation touches keeps the style of the file, for a batch and one by one alike.
  const all = ['keep', ...Array.from({ length: Math.floor(rng.next() * 5) }, () => rng.pick(NAMES))];
  for (const name of all) {
    const fields: string[] = [];
    const subject = name === 'keep' ? 'text' : rng.pick(['text', 'empty', 'none']);
    const message = name === 'keep' ? 'none' : rng.pick(['cdata', 'text', 'empty', 'none']);
    if (subject !== 'none') {
      fields.push(subject === 'empty' ? '<subject/>' : `<subject>S ${name}</subject>`);
    }
    if (message !== 'none') {
      fields.push(
        message === 'empty'
          ? '<message/>'
          : message === 'cdata'
            ? `<message><![CDATA[<p>M ${name}</p>]]></message>`
            : `<message>M ${name}</message>`,
      );
    }
    const body = inline
      ? fields.join('')
      : fields.map((field) => `${eol}${unit}${unit}${field}`).join('') + `${eol}${unit}`;
    templates.push(`${unit}<template name="${name}">${body}</template>`);
  }
  return `<templates>${eol}${templates.join(eol)}${eol}</templates>${rng.next() < 0.8 ? eol : ''}`;
}

/** Operations as a fill or a check writes them, mostly texts set, and now and then another kind or a wrong one. */
function operations(rng: Rng, text: string): FileOp[] {
  const read = readMail(text);
  const present = read.ok
    ? read.templates
        .filter((template) => template.id !== 'keep')
        .flatMap((template) => template.fields.map((info) => [template.id, info.field] as const))
    : [];
  const ops: FileOp[] = [];
  const count = 1 + Math.floor(rng.next() * 10);
  for (let index = 0; index < count; index++) {
    const kind = rng.next();
    const existing = present.length > 0 ? rng.pick(present) : undefined;
    if (existing && kind < 0.6) {
      // Sets of the same field in a row happen too: the last one must win.
      ops.push({ kind: 'set', key: key(...existing), value: rng.pick(VALUES) });
    } else if (kind < 0.75) {
      ops.push({
        kind: 'insert',
        key: key(
          rng.next() < 0.5 && existing ? existing[0] : `new${index}`,
          rng.pick(['subject', 'message']),
        ),
        value: rng.pick(VALUES),
      });
    } else if (existing && kind < 0.82) {
      ops.push({ kind: 'delete', key: key(...existing) });
    } else if (existing && kind < 0.9) {
      ops.push({ kind: 'rename', from: key(...existing), to: key(`renamed${index}`, existing[1]) });
    } else {
      ops.push({ kind: 'set', key: key('never', 'subject'), value: 'x' });
    }
  }
  return ops;
}

/** The text after the operations, or the error that stopped them, with the keys it names. */
function outcome(run: () => string): string {
  try {
    return run();
  } catch (error) {
    if (error instanceof EditError) {
      return `EditError ${error.code} ${error.key?.id} ${error.other?.id}`;
    }
    throw error;
  }
}

describe('applyMailOps with many operations', () => {
  // The texts, not the time, are compared: the default 5 s is too little in the CI with coverage.
  it(
    'writes exactly what the operations write one by one, each on the text read again',
    { timeout: 30_000 },
    () => {
      for (let seed = 1; seed <= 5_000; seed++) {
        const rng = random(seed);
        const text = mailText(rng);
        const ops = operations(rng, text);
        const oneByOne = () => ops.reduce((current, op) => applyMailOps(doc(current), [op]), text);
        expect(
          outcome(() => applyMailOps(doc(text), ops)),
          `seed ${seed}`,
        ).toBe(outcome(oneByOne));
      }
    },
  );

  // Each text read the whole file again (audit P-07): a check of all texts of a language with every correction chosen.
  // Each text looked its template up among all templates of the file (review of audit P-07).
  it('writes the texts of many templates at once in well under a second', () => {
    const names = Array.from({ length: 5_000 }, (_, index) => `template_${index}`);
    const text = `<templates>\n${names
      .map(
        (name) =>
          `\t<template name="${name}">\n\t\t<subject>Ein Betreff</subject>\n` +
          `\t\t<message><![CDATA[<p>Eine Nachricht, wie sie edu-sharing verschickt.</p>]]></message>\n\t</template>`,
      )
      .join('\n')}\n</templates>\n`;
    const ops: FileOp[] = names.flatMap((name) => [
      { kind: 'set', key: key(name, 'subject'), value: 'Un sujet' } as const,
      {
        kind: 'set',
        key: key(name, 'message'),
        value: '<p>Un message, comme edu-sharing l’envoie.</p>',
      } as const,
    ]);
    const started = performance.now();
    const written = applyMailOps(doc(text), ops);
    const elapsed = performance.now() - started;
    const read = readMail(written);
    expect(read.ok && read.templates.every((template) => template.fields.length === 2)).toBe(true);
    expect(written.split('Un sujet')).toHaveLength(names.length + 1);
    // Reading the file once takes most of it: 5,000 templates are 750 KB. Looked up one by one: 1.9 s.
    expect(elapsed).toBeLessThan(800);
  });
});
