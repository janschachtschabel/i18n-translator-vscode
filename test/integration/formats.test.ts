import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { planEdit } from '../../src/core/edit/planEdit';
import { keyFromSegments } from '../../src/core/model/keys';
import { addKey } from '../../src/extension/commands/addKey';
import { addLanguage } from '../../src/extension/commands/addLanguage';
import type { KeyCommandContext } from '../../src/extension/commands/commandTarget';
import type { Prompts } from '../../src/extension/commands/prompts';
import type { ExtensionApi } from '../../src/extension/extension';
import { rootRef, type IndexedRoot } from '../../src/extension/services/workspaceIndex';
import { activateExtension, answering, keepTranslationFiles, nextPost } from './helpers';

const decoder = new TextDecoder();

/**
 * The workspace of the profile "formats" (.vscode-test.mjs): a data folder like the one of the old standalone app,
 * with Angular JSON, metadatasets and mail templates in its subfolders. Skipped in the other profiles.
 */
suite('a data folder with all three areas', () => {
  let api: ExtensionApi;
  let restoreFiles: () => Promise<void>;

  suiteSetup(async function () {
    api = await activateExtension();
    const { roots } = await api.index.refresh();
    if (!roots.some((root) => root.analysis.area.id === 'edu-sharing.mail')) {
      this.skip();
    }
    restoreFiles = await keepTranslationFiles('data/**/*.{json,properties,xml}');
  });
  teardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await restoreFiles();
    await api.index.refresh();
  });

  const rootOf = async (areaId: string): Promise<IndexedRoot> =>
    (await api.index.refresh()).roots.find((root) => root.analysis.area.id === areaId)!;
  const bundleOf = (root: IndexedRoot, name: string) =>
    root.analysis.bundles.find((bundle) => bundle.name === name)!;
  const fileOf = (root: IndexedRoot, name: string) =>
    vscode.Uri.joinPath(root.folder.uri, root.analysis.root, name);
  const bytesOf = (root: IndexedRoot, name: string) => vscode.workspace.fs.readFile(fileOf(root, name));
  const textOf = async (root: IndexedRoot, name: string) => decoder.decode(await bytesOf(root, name));
  const context = (prompts: Prompts): KeyCommandContext => ({
    index: api.index,
    fileStore: api.fileStore,
    prompts,
  });
  const setText = (root: IndexedRoot, bundle: string, segments: string[], locale: string, value: string) =>
    api.fileStore.write(rootRef(root), (analysis) =>
      planEdit(
        analysis.bundles.find((candidate) => candidate.name === bundle)!,
        {
          kind: 'setText',
          entryId: keyFromSegments(segments).id,
          locale,
          value,
        },
      ),
    );

  test('finds the three areas in the subfolders of the data folder', async () => {
    const { roots } = await api.index.refresh();
    assert.deepEqual(
      roots.map((root) => [
        root.analysis.area.id,
        root.analysis.root,
        root.analysis.bundles.map((bundle) => bundle.name),
      ]),
      [
        ['edu-sharing.angular', 'data/1.0.0/json', ['common']],
        ['edu-sharing.mds', 'data/1.0.0/metadatasets/i18n', ['mds', 'valuespaces_i18n']],
        ['edu-sharing.mail', 'data/1.0.0/mailtemplates', ['templates']],
      ],
    );
  });

  test('fills a gap in a metadataset file with one line, after the key before it', async () => {
    const mds = await rootOf('edu-sharing.mds');
    assert.deepEqual(await setText(mds, 'mds', ['group_hint'], 'fr_FR', 'Conseil pour {user}'), { ok: true });
    assert.equal(
      await textOf(mds, 'mds_fr_FR.properties'),
      'this_is_a_bug_the_first_line_will_not_be_translated: guard\ngroup_title: Groupe\ngroup_hint: Conseil pour {user}\n',
    );
  });

  test('keeps an ISO-8859-1 file in ISO-8859-1 and changes only the edited line', async () => {
    const mds = await rootOf('edu-sharing.mds');
    const before = Buffer.from(await bytesOf(mds, 'mds_de_DE.properties')).toString('latin1');
    assert.deepEqual(await setText(mds, 'mds', ['group_title'], 'de_DE', 'Gruppe ä'), { ok: true });
    const after = Buffer.from(await bytesOf(mds, 'mds_de_DE.properties')).toString('latin1');
    assert.equal(after, before.replace('group_title: Gruppe\n', 'group_title: Gruppe ä\n'));
  });

  test('fills a missing mail field in its template', async () => {
    const mail = await rootOf('edu-sharing.mail');
    assert.deepEqual(
      await setText(mail, 'templates', ['invited', 'message'], 'fr_FR', '<p>Bonjour {{name}}</p>'),
      {
        ok: true,
      },
    );
    assert.equal(
      await textOf(mail, 'templates_fr_FR.xml'),
      '<templates>\n\t<template name="invited">\n\t\t<subject>Invitation</subject>\n' +
        '\t\t<message><![CDATA[<p>Bonjour {{name}}</p>]]></message>\n\t</template>\n</templates>\n',
    );
  });

  test('adds a missing mail template after the template before it', async () => {
    const mail = await rootOf('edu-sharing.mail');
    assert.deepEqual(await setText(mail, 'templates', ['added_inbox', 'subject'], 'fr_FR', 'Nouvel objet'), {
      ok: true,
    });
    assert.match(
      await textOf(mail, 'templates_fr_FR.xml'),
      /<\/template>\n\t<template name="added_inbox">\n\t\t<subject>Nouvel objet<\/subject>\n\t<\/template>\n<\/templates>/,
    );
  });

  test('adds a metadataset key with dots as one key, in the reference file', async () => {
    const mds = await rootOf('edu-sharing.mds');
    const before = Buffer.from(await bytesOf(mds, 'mds_de_DE.properties')).toString('latin1');
    await addKey(context(answering('group.extra', 'Mehr')), { root: mds, bundle: bundleOf(mds, 'mds') });
    const after = Buffer.from(await bytesOf(mds, 'mds_de_DE.properties')).toString('latin1');
    assert.equal(after, `${before}group.extra: Mehr\n`);
  });

  test('adds a language to the metadatasets: each new file begins with the guard line of its reference', async () => {
    const mds = await rootOf('edu-sharing.mds');
    await addLanguage(context(answering('es_ES')), mds);
    assert.equal(
      await textOf(mds, 'mds_es_ES.properties'),
      'this_is_a_bug_the_first_line_will_not_be_translated=guard\n',
    );
    assert.equal(await textOf(mds, 'valuespaces_i18n_es_ES.properties'), '');
  });

  test('opens the mail templates in the editor, a row per field and the base file named by its language', async () => {
    const mail = await rootOf('edu-sharing.mail');
    const panel = api.editors.open(mail, bundleOf(mail, 'templates'));
    const { model } = await nextPost(panel, 'bundle');
    assert.deepEqual(
      model.rows.map((row) => row.key),
      ['invited.subject', 'invited.message', 'added_inbox.subject', 'added_inbox.message'],
    );
    assert.deepEqual(
      model.locales.map((locale) => locale.label ?? locale.code),
      ['de_DE', 'default (en)', 'fr_FR'],
    );
    assert.equal(model.rows[1]!.cells['fr_FR']!.value, undefined);
  });

  test('opens a metadataset with the placeholders it uses', async () => {
    const mds = await rootOf('edu-sharing.mds');
    const panel = api.editors.open(mds, bundleOf(mds, 'mds'));
    const { model } = await nextPost(panel, 'bundle');
    assert.equal(model.placeholderSyntax, 'single-brace');
    assert.deepEqual(
      model.rows.map((row) => row.key),
      ['group_title', 'group_hint'],
    );
  });
});
