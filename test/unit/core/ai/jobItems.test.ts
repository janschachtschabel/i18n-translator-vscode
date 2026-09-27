import { describe, expect, it } from 'vitest';
import { checkItems, fillItems, requestCount } from '../../../../src/core/ai/jobItems';
import { keyFromSegments } from '../../../../src/core/model/keys';
import { bundleOf } from '../checks/rules/helpers';

const id = (name: string) => keyFromSegments([name]).id;
const keys = (count: number) => Array.from({ length: count }, (_, index) => `K${index}`);
const texts = (value: (key: string) => string, count: number) =>
  JSON.stringify(Object.fromEntries(keys(count).map((key) => [key, value(key)])));

describe('fillItems and checkItems', () => {
  const bundle = bundleOf('common', {
    de: '{"A":"Hallo","B":"Welt"}',
    en: '{"A":"Hello","B":"World"}',
    fr: '{"A":"Bonjour","B":"Monde"}',
  });

  it('give each text its source and its texts in other languages, under the key the model gets', () => {
    const choice = { locale: 'fr', source: 'de', entries: [{ entryId: id('B'), before: null }] };
    const { items, entries } = fillItems(bundle, choice, []);
    expect(items).toEqual([{ key: 'B', source: 'Welt', context: { en: 'World' } }]);
    expect(entries.get('B')).toEqual({ entryId: id('B'), source: 'Welt', before: null });
  });

  it('give a check the translation to check', () => {
    const choice = { locale: 'fr', source: 'de', entries: [{ entryId: id('A'), before: 'Bonjour' }] };
    const { items, entries } = checkItems(bundle, choice, []);
    expect(items).toEqual([{ key: 'A', source: 'Hallo', text: 'Bonjour', context: { en: 'Hello' } }]);
    expect(entries.get('A')).toEqual({ entryId: id('A'), source: 'Hallo', before: 'Bonjour' });
  });
});

// The question before a job counted texts by the batch size alone, and a job of long mail messages sent many times
// the requests it announced, without asking (audit L-17).
describe('requestCount', () => {
  it('counts the requests of a job by texts and by characters', () => {
    const long = keys(20).map((key) => ({ key, source: 'x'.repeat(3_000) }));
    expect(requestCount(long, 25)).toBe(10);
    const short = keys(60).map((key) => ({ key, source: 'Text' }));
    expect(requestCount(short, 25)).toBe(3);
  });

  it('counts the context texts, which travel with each text', () => {
    const long = (key: string) => `${key} ${'x'.repeat(2_500)}`;
    const mail = bundleOf('mail', { de: texts(long, 6), en: texts(long, 6), fr: '{}' });
    const choice = {
      locale: 'fr',
      source: 'de',
      entries: keys(6).map((key) => ({ entryId: id(key), before: null })),
    };
    // Each text carries its English one: 5,000 characters, one text per request.
    expect(requestCount(fillItems(mail, choice, []).items, 25)).toBe(6);
  });
});
