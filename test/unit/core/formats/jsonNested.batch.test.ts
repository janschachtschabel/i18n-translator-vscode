import { describe, expect, it } from 'vitest';
import { EditError, type FileOp } from '../../../../src/core/formats/adapter';
import { applyJsonOps } from '../../../../src/core/formats/json/jsonWrite';
import { keyFromSegments, type EntryKey } from '../../../../src/core/model/keys';

const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const key = (segments: readonly string[]): EntryKey => keyFromSegments([...segments]);

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

const NAMES = ['a', 'b', 'c.d', 'ümlaut', 'x', 'y', 'with space'];
const VALUES = [
  'Text',
  '',
  'with "quotes"',
  'back\\slash',
  `line${LF}break`,
  'Ärger',
  String.fromCharCode(0x2028),
];

/** A tree of texts: a name is repeated now and then, so that a key has definitions that no longer apply. */
interface Tree {
  properties: [string, string | Tree][];
}

function tree(rng: Rng, depth: number): Tree {
  const count = Math.floor(rng.next() * 6);
  const properties: [string, string | Tree][] = [];
  for (let index = 0; index < count; index++) {
    const name = rng.pick(NAMES);
    properties.push([name, depth < 2 && rng.next() < 0.3 ? tree(rng, depth + 1) : rng.pick(VALUES)]);
  }
  return { properties };
}

/** The tree written with the line breaks and indentation of a file, or on one line, or both mixed. */
function render(
  rng: Rng,
  value: Tree,
  indent: string,
  style: { eol: string; unit: string; layout: string },
): string {
  if (value.properties.length === 0) {
    return '{}';
  }
  const inner = indent + style.unit;
  const parts = value.properties.map(
    ([name, child]) =>
      `${JSON.stringify(name)}: ${typeof child === 'string' ? JSON.stringify(child) : render(rng, child, inner, style)}`,
  );
  if (style.layout === 'one') {
    return `{${parts.join(', ')}}`;
  }
  const separator = () => (style.layout === 'mixed' && rng.next() < 0.3 ? ', ' : `,${style.eol}${inner}`);
  return `{${style.eol}${inner}${parts.reduce((text, part) => `${text}${separator()}${part}`)}${style.eol}${indent}}`;
}

/** The paths of the texts that apply: with repeated names, the last definition. */
function textPaths(value: Tree, path: readonly string[] = []): string[][] {
  const last = new Map<string, string | Tree>();
  for (const [name, child] of value.properties) {
    last.set(name, child);
  }
  return [...last].flatMap(([name, child]) =>
    typeof child === 'string' ? [[...path, name]] : textPaths(child, [...path, name]),
  );
}

/** Operations as a fill or a check writes them, mostly texts set, and now and then another kind or a wrong one. */
function operations(rng: Rng, paths: readonly string[][]): FileOp[] {
  const ops: FileOp[] = [];
  const count = 1 + Math.floor(rng.next() * 12);
  for (let index = 0; index < count; index++) {
    const kind = rng.next();
    const existing = paths.length > 0 ? rng.pick(paths) : undefined;
    if (existing && kind < 0.6) {
      // Sets of the same key in a row happen too: the last one must win.
      ops.push({ kind: 'set', key: key(existing), value: rng.pick(VALUES) });
    } else if (kind < 0.75) {
      const parent = existing ? existing.slice(0, -1) : [];
      const place = rng.next();
      ops.push({
        kind: 'insert',
        key: key([...parent, `new${index}`]),
        value: rng.pick(VALUES),
        ...(existing && place < 0.5 ? { after: key(existing) } : {}),
        ...(place >= 0.5 && place < 0.7 ? { first: true as const } : {}),
      });
    } else if (existing && kind < 0.82) {
      ops.push({ kind: 'delete', key: key(existing) });
    } else if (existing && kind < 0.9) {
      ops.push({
        kind: 'rename',
        from: key(existing),
        to: key([...existing.slice(0, -1), `renamed${index}`]),
      });
    } else {
      ops.push({ kind: 'set', key: key(['never', 'there']), value: 'x' });
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

describe('applyJsonOps with many operations', () => {
  // 10,000 random cases take a few seconds, and more than the default 5 s in the CI with coverage; the test compares
  // texts, not time.
  it(
    'writes exactly what the operations write one by one, each on the text read again',
    { timeout: 30_000 },
    () => {
      for (let seed = 1; seed <= 10_000; seed++) {
        const rng = random(seed);
        const value = tree(rng, 0);
        // A batch keeps the style of the file; one by one, a text whose indented lines all went takes the default. A
        // line that no operation touches keeps the style for both.
        value.properties.unshift(['keep', 'The style of the file']);
        const style = {
          eol: rng.pick([LF, LF, CR + LF, CR]),
          unit: rng.pick(['  ', '    ', '\t']),
          layout: rng.pick(['lines', 'lines', 'one', 'mixed']),
        };
        const text = render(rng, value, '', style) + (rng.next() < 0.7 ? style.eol : '');
        const ops = operations(
          rng,
          textPaths(value).filter((path) => path[0] !== 'keep'),
        );
        const oneByOne = () => ops.reduce((current, op) => applyJsonOps(current, [op]), text);
        expect(
          outcome(() => applyJsonOps(text, ops)),
          `seed ${seed}`,
        ).toBe(outcome(oneByOne));
      }
    },
  );

  // Each text read the whole file again: 1,600 texts of a file of 120 KB took 1.9 s, e.g. a check of all texts of
  // `common` with every correction chosen (audit P-07).
  it('writes the texts of a large file at once in well under a second', () => {
    const groups = Array.from({ length: 40 }, (_, group) =>
      Array.from({ length: 40 }, (_, index) => [`GROUP_${group}`, `KEY_${index}`]),
    );
    const paths = groups.flat();
    const text = `{\n${groups
      .map(
        (keys, group) =>
          `  "GROUP_${group}": {\n${keys
            .map(([, name]) => `    "${name}": "Ein Text, wie er in einer Oberfläche steht, mit etwas Länge"`)
            .join(',\n')}\n  }`,
      )
      .join(',\n')}\n}\n`;
    const ops: FileOp[] = paths.map((path) => ({
      kind: 'set',
      key: key(path),
      value: 'Un texte comme on le lit dans une interface, assez long',
    }));
    const started = performance.now();
    const written = applyJsonOps(text, ops);
    const elapsed = performance.now() - started;
    const parsed = JSON.parse(written) as Record<string, Record<string, string>>;
    expect(paths.every(([group, name]) => parsed[group!]![name!]!.startsWith('Un texte'))).toBe(true);
    expect(elapsed).toBeLessThan(300);
  });

  // Each text looked its key up among all properties of its object: 10,000 texts of one flat object took 6.8 s
  // (review of audit P-07).
  it('writes the texts of a large flat object at once in well under a second', () => {
    const names = Array.from({ length: 10_000 }, (_, index) => `KEY_${index}`);
    const text = `{\n${names.map((name) => `  "${name}": "Ein Text"`).join(',\n')}\n}\n`;
    const ops: FileOp[] = names.map((name) => ({ kind: 'set', key: key([name]), value: 'Un texte' }));
    const started = performance.now();
    const written = applyJsonOps(text, ops);
    const elapsed = performance.now() - started;
    expect(
      Object.values(JSON.parse(written) as Record<string, string>).every((value) => value === 'Un texte'),
    ).toBe(true);
    expect(elapsed).toBeLessThan(300);
  });
});
