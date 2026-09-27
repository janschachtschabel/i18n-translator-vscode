import { describe, expect, it } from 'vitest';
import { EditError, type FileOp } from '../../../../src/core/formats/adapter';
import { readDefinitions } from '../../../../src/core/formats/properties/propertiesRead';
import { applyPropertiesOps } from '../../../../src/core/formats/properties/propertiesWrite';
import { keyFromSegments } from '../../../../src/core/model/keys';

const BACKSLASH = String.fromCharCode(92);
const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const key = (name: string) => keyFromSegments([name]);

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

const NAMES = [
  'a',
  'b.c',
  'key_1',
  'with space',
  'colon:key',
  'eq=key',
  'hash#',
  'ümlaut',
  'x',
  'y.z',
  'tab\tkey',
];
const VALUES = [
  'Text',
  ' leading space',
  '=starts with a sign',
  `back${BACKSLASH}slash`,
  `line${LF}break`,
  'tab\there',
  'Ärger',
  '',
  String.fromCharCode(0x2028),
];

/** A .properties text with comments, blank lines, continued lines, escapes and any line breaks, also mixed. */
function propertiesText(rng: ReturnType<typeof random>): string {
  const eol = rng.pick([LF, CR + LF, CR]);
  // Mixed line breaks: a CR and an LF after it are one, which the writer must not split or join by mistake.
  const mixed = rng.next() < 0.3;
  const lines: string[] = [];
  const count = Math.floor(rng.next() * 8);
  for (let index = 0; index < count; index++) {
    const kind = rng.next();
    const name = rng.pick(NAMES).replace(/[ =:#\t]/g, (char) => BACKSLASH + (char === '\t' ? 't' : char));
    if (kind < 0.15) {
      lines.push(rng.pick(['# a comment', '! another', '   # indented']));
    } else if (kind < 0.25) {
      lines.push('');
    } else if (kind < 0.35) {
      lines.push(`${name}=first part ${BACKSLASH}`, '    second part');
    } else if (kind < 0.4) {
      // A line of only a backslash, and one that a blank line ends.
      lines.push(rng.pick([BACKSLASH, `${name}=ends ${BACKSLASH}`]), '');
    } else {
      const separator = rng.pick(['=', ':', ' ', ' = ', '\t:\t']);
      lines.push(
        `${rng.pick(['', '  '])}${name}${separator}value ${index}${rng.pick(['', ` ${BACKSLASH}u00e4`])}`,
      );
    }
  }
  // A batch keeps the line break of the file; one by one, a text left without any takes the default (LF). Comments
  // stay, so that a file of CR or CRLF keeps one of its own whatever the operations delete.
  const header = eol === LF && !mixed ? '' : `# generated${eol}# file${eol}`;
  const text =
    header +
    lines
      .map((line, index) => (index === 0 ? '' : mixed ? rng.pick([LF, CR + LF, CR]) : eol) + line)
      .join('');
  const ending = rng.next();
  // Ends with a line break, without one, or with a backslash that continues nothing.
  return ending < 0.5
    ? text + (text === '' ? '' : eol)
    : ending < 0.8
      ? text
      : `${text}${eol}last=end ${BACKSLASH}`;
}

/** Operations on the text: mostly texts set or inserted, as a fill writes them, sometimes a delete, a rename or a wrong one. */
function operations(rng: ReturnType<typeof random>, text: string): FileOp[] {
  const read = readDefinitions(text);
  const present = new Set(read.ok ? read.definitions.map((definition) => definition.key) : []);
  const known = [...present];
  const ops: FileOp[] = [];
  const count = 1 + Math.floor(rng.next() * 12);
  for (let index = 0; index < count; index++) {
    const kind = rng.next();
    const existing = [...present];
    const fresh = `new.${index}.${rng.pick(NAMES)}`;
    if (kind < 0.45 || existing.length === 0) {
      const place = rng.next();
      const after = place < 0.6 && existing.length > 0 ? { after: key(rng.pick(existing)) } : {};
      const other = place >= 0.6 && place < 0.7 ? { after: key('missing.anchor') } : {};
      const first = place >= 0.7 && place < 0.85 ? { first: true as const } : {};
      ops.push({ kind: 'insert', key: key(fresh), value: rng.pick(VALUES), ...after, ...other, ...first });
      present.add(fresh);
    } else if (kind < 0.75) {
      ops.push({ kind: 'set', key: key(rng.pick(existing)), value: rng.pick(VALUES) });
    } else if (kind < 0.85) {
      const name = rng.pick(existing);
      ops.push({ kind: 'delete', key: key(name) });
      present.delete(name);
    } else if (kind < 0.95) {
      const name = rng.pick(existing);
      ops.push({ kind: 'rename', from: key(name), to: key(fresh) });
      present.delete(name);
      present.add(fresh);
    } else {
      // Wrong on purpose: a key that exists, or one that does not.
      ops.push(
        rng.next() < 0.5 && known.length > 0
          ? { kind: 'insert', key: key(rng.pick(known)), value: 'x' }
          : { kind: 'set', key: key('never.there'), value: 'x' },
      );
    }
  }
  return ops;
}

/** The text after the operations, or the code of the error that stopped them. */
function outcome(run: () => string): string {
  try {
    return run();
  } catch (error) {
    if (error instanceof EditError) {
      return `EditError ${error.code}`;
    }
    throw error;
  }
}

describe('applyPropertiesOps with many operations', () => {
  // 10,000 random cases take about 1.5 s alone, and more than the default 5 s in the CI, with coverage and beside
  // other test files; the test compares texts, not time.
  it(
    'writes exactly what the operations write one by one, each on the text read again',
    { timeout: 30_000 },
    () => {
      for (let seed = 1; seed <= 10000; seed++) {
        const rng = random(seed);
        const text = propertiesText(rng);
        const ops = operations(rng, text);
        const bom = rng.next() < 0.2;
        const oneByOne = () => ops.reduce((current, op) => applyPropertiesOps(current, [op], bom), text);
        expect(
          outcome(() => applyPropertiesOps(text, ops, bom)),
          `seed ${seed}`,
        ).toBe(outcome(oneByOne));
      }
    },
  );

  it('writes the texts of a new language of the largest bundle at once in well under a second', () => {
    // valuespaces_i18n: 1,546 keys, of which fr has 314; a fill inserts the other 1,232, each after the key before it.
    const all = Array.from(
      { length: 1546 },
      (_, index) => `valuespace.key_${String(index).padStart(4, '0')}`,
    );
    const present = new Set(all.filter((_, index) => index % 5 === 0));
    const text =
      [...present].map((name) => `${name}=Ein Text, wie er in einer Oberfläche steht`).join(LF) + LF;
    const ops: FileOp[] = [];
    let previous: string | undefined;
    for (const name of all) {
      if (!present.has(name)) {
        const place = previous ? { after: key(previous) } : { first: true as const };
        ops.push({
          kind: 'insert',
          key: key(name),
          value: 'Un texte comme on le lit dans une interface',
          ...place,
        });
      }
      previous = name;
    }
    const started = performance.now();
    const written = applyPropertiesOps(text, ops);
    const elapsed = performance.now() - started;
    const read = readDefinitions(written);
    expect(read.ok && read.definitions.map((definition) => definition.key)).toEqual(all);
    // Reading the whole file again after each text took about 4 s here.
    expect(elapsed).toBeLessThan(1500);
  });
});
