import { escapeHtml } from './webviewHtml';

/** The mail of a column: its HTML body, the BCP 47 tag of its language, and the name of its frame for screen readers. */
export interface PreviewedMail {
  html: string;
  lang: string;
  frameTitle: string;
}

/** One language of a mail template. The texts come in the user's language, except the mail's own. */
export interface MailPreviewColumn {
  /** The language, e.g. `de_DE (reference)`. */
  heading: string;
  /** With the tag of its language: a text of the base file is English, whatever the column. */
  subject?: { text: string; lang: string };
  /** What the reader should know, e.g. that the language shows texts of the base file. */
  note?: string;
  /** The mail, or why there is none, e.g. a file edu-sharing cannot read. */
  mail: PreviewedMail | { problem: string };
}

export interface MailPreviewPage {
  /** Language of the VS Code interface. */
  language: string;
  title: string;
  heading: string;
  /** `Subject:`, in front of each subject. */
  subjectLabel: string;
  /** The reference first. */
  columns: MailPreviewColumn[];
  /** Why there are no columns, e.g. the template is gone. */
  message?: string;
}

// Inline styles only: the page has no scripts, and nothing loads from anywhere (images only as data URLs).
const POLICY = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";

/**
 * The layout of the page in the colors of the theme. Each mail keeps its own look: the frame is light behind it, as
 * mail programs show it.
 */
const STYLE = `
body { margin: 0; padding: 12px 16px 16px; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size);
  color: var(--vscode-foreground); background: var(--vscode-editor-background); }
h1 { margin: 0 0 12px; font-size: 1.2em; overflow-wrap: anywhere; }
h2 { margin: 0 0 4px; font-size: 1em; overflow-wrap: anywhere; }
.columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 24em), 1fr)); gap: 16px; }
section { min-inline-size: 0; }
.subject, .note, .problem { margin: 0 0 6px; overflow-wrap: anywhere; }
.note { color: var(--vscode-descriptionForeground); }
.problem { padding: 8px; border: 1px solid var(--vscode-contrastBorder, var(--vscode-panel-border, #8888)); }
iframe { display: block; box-sizing: border-box; inline-size: 100%; block-size: 70vh; min-block-size: 18em;
  border: 1px solid var(--vscode-contrastBorder, var(--vscode-panel-border, #8888)); background: #fff;
  color-scheme: light; }
`;

/**
 * The page of the mail preview: a column per language, each mail in a frame of its own. The frames have `sandbox`
 * without exceptions, so no mail runs a script, submits a form or opens a window, and they inherit the page's policy,
 * so no mail loads anything; a mail's markup cannot leave its frame, as it only ever stands in an escaped attribute.
 */
export function mailPreviewHtml(page: MailPreviewPage): string {
  const body =
    page.message !== undefined
      ? `<p>${escapeHtml(page.message)}</p>`
      : `<div class="columns">\n${page.columns.map((column, index) => section(page, column, index)).join('\n')}\n</div>`;
  return `<!DOCTYPE html>
<html lang="${escapeHtml(page.language)}">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${POLICY}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(page.title)}</title>
<style>${STYLE}</style>
</head>
<body>
<h1>${escapeHtml(page.heading)}</h1>
${body}
</body>
</html>
`;
}

function section(page: MailPreviewPage, column: MailPreviewColumn, index: number): string {
  const id = `language-${index}`;
  const subject = column.subject
    ? `<p class="subject">${escapeHtml(page.subjectLabel)} <span lang="${escapeHtml(column.subject.lang)}">${escapeHtml(column.subject.text)}</span></p>`
    : '';
  const note = column.note === undefined ? '' : `<p class="note">${escapeHtml(column.note)}</p>`;
  const mail =
    'problem' in column.mail
      ? `<p class="problem">${escapeHtml(column.mail.problem)}</p>`
      : `<iframe sandbox="" title="${escapeHtml(column.mail.frameTitle)}" srcdoc="${escapeHtml(mailDocument(column.mail))}"></iframe>`;
  return `<section aria-labelledby="${id}">
<h2 id="${id}">${escapeHtml(column.heading)}</h2>
${subject}${note}${mail}
</section>`;
}

/** The mail as the document of its frame: light, as mail programs show it, whatever the theme of VS Code. */
function mailDocument(mail: PreviewedMail): string {
  return (
    `<!DOCTYPE html><html lang="${escapeHtml(mail.lang)}"><head><meta charset="UTF-8">` +
    `<meta name="color-scheme" content="light"></head><body>${mail.html}</body></html>`
  );
}
