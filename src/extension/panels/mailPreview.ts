import * as vscode from 'vscode';
import type { FileProblem } from '../../core/formats/adapter';
import { composeMails } from '../../core/formats/mail/mailCompose';
import { parseBundleId, type Bundle } from '../../core/model/bundle';
import { keyFromId } from '../../core/model/keys';
import { BASE_FILE_LOCALE, languageTag, parseLocale } from '../../core/model/locale';
import type { PanelState } from '../../shared/protocol';
import type { IndexSnapshot, WorkspaceIndex } from '../services/workspaceIndex';
import { findBundle } from './findBundle';
import { mailPreviewHtml, type MailPreviewColumn, type MailPreviewPage } from './mailPreviewHtml';
import { pageLanguage } from './webviewHtml';

export const MAIL_PREVIEW_VIEW_TYPE = 'eduI18n.mailPreview';

/** The template a preview shows, of the bundle of an editor. */
interface PreviewTarget extends PanelState {
  templateId: string;
}

/**
 * The preview of a mail template beside the editors (design §6.12, task 6.4): one at a time, the template in every
 * language of its bundle, the reference first, as edu-sharing sends it. It follows every index run. Its webview runs
 * no scripts and loads nothing, see {@link mailPreviewHtml}.
 */
export class MailPreview implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private target: PreviewTarget | undefined;
  private html = '';
  private readonly rendered = new vscode.EventEmitter<string>();
  /** Fires with the page whenever it changes; the integration tests read the preview with it. */
  readonly onDidRender = this.rendered.event;
  private readonly subscriptions: vscode.Disposable[];

  constructor(
    private readonly index: WorkspaceIndex,
    private readonly log: vscode.LogOutputChannel,
  ) {
    this.subscriptions = [this.rendered, index.onDidChange((snapshot) => this.render(snapshot))];
  }

  /**
   * Shows the template of a key of an editor's bundle beside it; the editor keeps the focus. The key comes from a
   * webview or a menu: one that is no mail template of a bundle in the index shows nothing.
   */
  show(editor: PanelState, entryId: string): void {
    const snapshot = this.index.current();
    const found = snapshot && findBundle(snapshot, editor);
    if (
      !found ||
      found.bundle.format !== 'mail-xml' ||
      !found.bundle.keys.some((key) => key.id === entryId)
    ) {
      this.log.warn('Ignored a preview of a key that is no mail template of the editor.');
      return;
    }
    const templateId = keyFromId(entryId).segments[0]!;
    this.target = { folder: editor.folder, bundleId: editor.bundleId, templateId };
    if (this.panel) {
      this.panel.reveal(undefined, true);
    } else {
      const panel = vscode.window.createWebviewPanel(
        MAIL_PREVIEW_VIEW_TYPE,
        previewTitle(templateId),
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        { enableScripts: false, localResourceRoots: [] },
      );
      panel.onDidDispose(() => {
        this.panel = undefined;
        this.target = undefined;
        this.html = '';
      });
      this.panel = panel;
    }
    this.render(snapshot);
  }

  dispose(): void {
    this.panel?.dispose();
    vscode.Disposable.from(...this.subscriptions).dispose();
  }

  /** Sets the page only when it changed: a new page reloads the frames and loses their scroll position. */
  private render(snapshot: IndexSnapshot | undefined): void {
    if (!this.panel || !this.target) {
      return;
    }
    const { templateId } = this.target;
    const title = previewTitle(templateId);
    const found = snapshot && findBundle(snapshot, this.target);
    const page: MailPreviewPage = {
      language: pageLanguage(vscode.env.language, vscode.l10n.bundle),
      title,
      heading: vscode.l10n.t('Mail template {template}', { template: templateId }),
      subjectLabel: vscode.l10n.t('Subject:'),
      columns: [],
    };
    if (found && found.bundle.keys.some((key) => key.segments[0] === templateId)) {
      page.columns = columns(found.bundle, templateId, found.root.settings.baseFileLanguage);
    } else {
      page.message = vscode.l10n.t('The mail template {template} is no longer in {bundle}.', {
        template: templateId,
        bundle: parseBundleId(this.target.bundleId).name,
      });
    }
    const html = mailPreviewHtml(page);
    this.panel.title = title;
    if (html !== this.html) {
      this.html = html;
      this.panel.webview.html = html;
      this.rendered.fire(html);
    }
  }
}

function previewTitle(templateId: string): string {
  return vscode.l10n.t('Mail Preview: {template}', { template: templateId });
}

/**
 * The template in every language of the bundle, the reference first, each part falling back as edu-sharing does, or
 * why edu-sharing sends no mail in a language. Each text carries the language of the file it comes from.
 */
function columns(bundle: Bundle, templateId: string, baseFileLanguage: string): MailPreviewColumn[] {
  const label = (locale: string) => {
    const info = parseLocale(locale, { baseFileLanguage });
    return info.isBaseFile ? `${locale} (${info.language})` : locale;
  };
  const tag = (locale: string) => languageTag(parseLocale(locale, { baseFileLanguage })) ?? '';
  return composeMails(bundle, templateId).map((entry) => {
    const language = label(entry.locale);
    const heading =
      entry.locale === bundle.reference ? vscode.l10n.t('{language} (reference)', { language }) : language;
    if ('unreadable' in entry) {
      return { heading, mail: { problem: unreadableMessage(entry.unreadable, label) } };
    }
    const { mail } = entry;
    const falls = [mail.subject, mail.message, mail.header, mail.footer].some(
      (text) => text !== undefined && text.locale !== entry.locale,
    );
    return {
      heading,
      ...(mail.subject ? { subject: { text: mail.subject.text, lang: tag(mail.subject.locale) } } : {}),
      ...(falls
        ? {
            note: vscode.l10n.t(
              '{language} lacks texts of this mail: it shows those of {base} instead, as edu-sharing does.',
              { language, base: label(BASE_FILE_LOCALE) },
            ),
          }
        : {}),
      mail: {
        html: mail.html,
        lang: tag(mail.message?.locale ?? entry.locale),
        frameTitle: vscode.l10n.t('Mail {template} in {language}', { template: templateId, language }),
      },
    };
  });
}

/** Why a language has no mail: a file edu-sharing cannot read, or one whose encoding the extension cannot read. */
function unreadableMessage(
  { locale, problem }: { locale: string; problem: FileProblem },
  label: (locale: string) => string,
): string {
  const file = label(locale);
  if (problem.detail === 'UnsupportedEncoding') {
    return vscode.l10n.t(
      'The extension cannot read the encoding of the file of {file}, so it shows no mail.',
      {
        file,
      },
    );
  }
  return locale === BASE_FILE_LOCALE
    ? vscode.l10n.t(
        'edu-sharing cannot read the file of {file} (see Problems), so it sends no mail in any language.',
        {
          file,
        },
      )
    : vscode.l10n.t(
        'edu-sharing cannot read the file of {file} (see Problems), so it sends no mail in this language.',
        {
          file,
        },
      );
}
