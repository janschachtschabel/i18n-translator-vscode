import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';
import { mailPreviewHtml, type MailPreviewPage } from '../../../src/extension/panels/mailPreviewHtml';

const page: MailPreviewPage = {
  language: 'de',
  title: 'Mail-Vorschau: invited',
  heading: 'Mail-Template invited',
  subjectLabel: 'Betreff:',
  columns: [
    {
      heading: 'de_DE (Referenz)',
      subject: { text: 'Einladung zu "A & B"', lang: 'de-DE' },
      mail: {
        html: "<style>.content{color:red}</style><div class='content'>Hallo</div>",
        lang: 'de-DE',
        frameTitle: 'Mail invited in de_DE',
      },
    },
    {
      heading: 'fr_FR',
      // Texts of the base file are English, whatever the column.
      subject: { text: 'Invitation', lang: 'en' },
      note: 'fr_FR fehlen Texte dieses Templates: Die Mail zeigt die von default (en), wie edu-sharing.',
      mail: {
        html: '<p>A & "B"</p></iframe><script>alert(1)</script>',
        lang: 'en',
        frameTitle: 'Mail invited in fr_FR',
      },
    },
    {
      heading: 'it_IT',
      mail: {
        problem:
          'edu-sharing kann die Datei von it_IT nicht lesen und verschickt in dieser Sprache keine Mail.',
      },
    },
  ],
};

// The host has no DOM; happy-dom parses the page as the webview would, with types of its own.
const parser = new new Window().DOMParser();
const parse = (html: string) => parser.parseFromString(html, 'text/html');

function policy(html: string): Record<string, string> {
  const content = parse(html)
    .querySelector('meta[http-equiv="Content-Security-Policy"]')
    ?.getAttribute('content');
  if (content === undefined || content === null) {
    throw new Error('no Content-Security-Policy');
  }
  return Object.fromEntries(
    content
      .split(';')
      .map((directive) => directive.trim().split(/\s+/))
      .map(([name = '', ...sources]) => [name, sources.join(' ')]),
  );
}

describe('mailPreviewHtml', () => {
  it('allows no script and no network: inline styles of the mails, and images only as data', () => {
    expect(policy(mailPreviewHtml(page))).toEqual({
      'default-src': "'none'",
      'style-src': "'unsafe-inline'",
      'img-src': 'data:',
    });
  });

  it('shows each mail in a sandboxed frame of its own, under the heading of its language', () => {
    const doc = parse(mailPreviewHtml(page));
    expect(doc.documentElement.lang).toBe('de');
    expect(doc.title).toBe('Mail-Vorschau: invited');
    expect(doc.querySelector('h1')?.textContent).toBe('Mail-Template invited');
    expect(
      [...doc.querySelectorAll('section')].map((section) => section.querySelector('h2')?.textContent),
    ).toEqual(['de_DE (Referenz)', 'fr_FR', 'it_IT']);
    expect(
      [...doc.querySelectorAll('iframe')].map((frame) => [frame.getAttribute('sandbox'), frame.title]),
    ).toEqual([
      ['', 'Mail invited in de_DE'],
      ['', 'Mail invited in fr_FR'],
    ]);
  });

  it('gives each frame the mail as a document of its own, in the language of its text and light', () => {
    const frames = parse(mailPreviewHtml(page)).querySelectorAll('iframe');
    expect(frames[1]!.getAttribute('srcdoc')).toBe(
      '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
        '<meta name="color-scheme" content="light"></head>' +
        '<body><p>A & "B"</p></iframe><script>alert(1)</script></body></html>',
    );
  });

  it('keeps a mail inside its frame, whatever it contains', () => {
    const doc = parse(mailPreviewHtml(page));
    expect(doc.querySelectorAll('script')).toHaveLength(0);
    expect(doc.querySelectorAll('iframe')).toHaveLength(2);
    expect(doc.querySelectorAll('style')).toHaveLength(1);
  });

  it('shows the subject in the language of its text, and the note, as text', () => {
    const [reference, translation] = [...parse(mailPreviewHtml(page)).querySelectorAll('section')];
    expect(reference!.querySelector('.subject')?.textContent).toBe('Betreff: Einladung zu "A & B"');
    expect(reference!.querySelector('.subject [lang]')?.getAttribute('lang')).toBe('de-DE');
    expect(reference!.querySelector('.note')).toBeNull();
    expect(translation!.querySelector('.subject [lang]')?.getAttribute('lang')).toBe('en');
    expect(translation!.querySelector('.note')?.textContent).toBe(
      'fr_FR fehlen Texte dieses Templates: Die Mail zeigt die von default (en), wie edu-sharing.',
    );
  });

  it('says instead of a frame why a language has no mail', () => {
    const unreadable = [...parse(mailPreviewHtml(page)).querySelectorAll('section')][2]!;
    expect(unreadable.querySelector('iframe')).toBeNull();
    expect(unreadable.querySelector('.problem')?.textContent).toBe(
      'edu-sharing kann die Datei von it_IT nicht lesen und verschickt in dieser Sprache keine Mail.',
    );
  });

  it('escapes the texts of the page', () => {
    const doc = parse(
      mailPreviewHtml({ ...page, title: 'a</title><b>', heading: '<i>x</i> & y', language: 'de" x="' }),
    );
    expect(doc.title).toBe('a</title><b>');
    expect(doc.querySelector('h1')?.textContent).toBe('<i>x</i> & y');
    expect(doc.documentElement.lang).toBe('de" x="');
  });

  it('says why there is nothing to show', () => {
    const doc = parse(mailPreviewHtml({ ...page, columns: [], message: 'Das Template ist weg.' }));
    expect(doc.querySelector('iframe')).toBeNull();
    expect(doc.body.textContent).toContain('Das Template ist weg.');
  });
});
