# Taskliste: edu-sharing i18n – VS-Code-Extension

> Gehört zu [`2026-09-24-edu-sharing-i18n-vscode-design.md`](2026-09-24-edu-sharing-i18n-vscode-design.md).
> **Phase 0 und 1 sind vollständig ausgearbeitet.** Die Phasen 2–8 stehen hier als Gliederung. Ihre Tasks werden
> vor dem Start der jeweiligen Phase im selben Detailgrad ausgearbeitet und kurz abgenommen. So stecken
> Entscheidungen aus der Abnahme (E1–E9) nicht in bereits geschriebenem Plan-Code fest.

## Arbeitsweise je Task (gilt für alle Tasks)

1. Test schreiben, dabei die Testfälle aus dem Task wörtlich übernehmen.
2. `npm run test:unit -- <datei>` ausführen; erwartet: **rot** mit der genannten Fehlerart (Import- oder Assertion-Fehler).
3. Minimal implementieren, bis der Test grün ist. Keine Vorgriffe auf spätere Tasks.
4. `npm run test:unit && npm run typecheck && npm run lint` ausführen; erwartet: **grün**.
5. Commit mit der angegebenen Message (Conventional Commits, Englisch).

**Rollback** jedes Tasks: `git revert <commit>`. Die Tasks sind so geschnitten, dass jeder Commit für sich baut.

---

## Phase 0 – Projektgerüst

**Schritt 0:** `/better-coding-workflow` aufrufen (Skills werden entladen, deshalb vor dem Coden neu laden).

> **Umsetzungsnotizen (24.09.2026):**
> - **TypeScript ist auf `~6.0.3` gepinnt,** nicht 7.x: `typescript-eslint` 8.70 unterstützt TypeScript nur bis < 6.1.
> - **`@types/node@22`:** vitest 5 verlangt ≥ 22 als Peer. VS Code 1.90 läuft auf Node 20, deshalb keine Node-22-exklusiven APIs verwenden.
> - **Webview-Bundle, `tsconfig.webview.json` und Preact kommen erst in Phase 2,** wo die erste Webview entsteht.
> - **Presets für MDS und Mail** kommen mit ihren Adaptern in Phase 5/6. Phase 1 enthält nur das Angular-Preset.
> - **Kein Smoke-Test:** vitest wird durch die echten Tests bestätigt (zuerst der l10n-Vollständigkeitstest).
> - **Vitest-Konfiguration als `vitest.config.mts`,** weil das Paket CommonJS bleibt.
> - **Zusätzlich:** `.gitattributes` (Fixtures byte-genau), `.vscode/launch.json` (F5) und ein l10n-Vollständigkeitstest.
> - **Ebenenregeln geschärft:** Der Kern verbietet zusätzlich `node:*`. Die Webview darf den Kern importieren, aber weder `vscode`, `node:*` noch Extension-Code (Design §5/§6.1).
> - **Kein `deactivate()`:** VS Code verlangt es nicht; alle Ressourcen hängen an `context.subscriptions`.
> - **`src/extension/l10n.ts`** (Texte für die Webview) sowie `happy-dom`, `@testing-library/preact` und `axe-core` kommen mit der ersten Webview in Phase 2.
>
> **Review Phase 0 (unabhängiger Reviewer, 24.09.2026): 0 kritisch, 0 major, 4 minor, 3 Nits – alle behoben:**
> - esbuild bündelte den UMD-Build von `jsonc-parser` unvollständig (latenter Laufzeitfehler, reproduziert und behoben).
> - Der l10n-Test sammelt jetzt über den TypeScript-Syntaxbaum.
> - Die Abdeckungsschwelle wird wirklich geprüft.
> - Die Regel-Wechselwirkungen hinter den Fixture-Summen sind festgeschrieben.
> - Prettier wird erzwungen.
> - Die CI läuft ohne Doppelläufe.
> - Die Ebenenregeln sind vollständig.

### Task 0.1: Branch und Repo-Grunddateien
**Dateien:** Create `.gitignore`, `.editorconfig`, `.nvmrc`, `.vscodeignore`, `.prettierrc.json`
**Was:** Arbeitszweig `feat/scaffold`. `.gitignore`: `node_modules/ dist/ out/ coverage/ .vscode-test/ *.vsix`.
`.vscodeignore`: `src/** test/** docs/** scripts/** .github/** **/*.map tsconfig*.json eslint.config.mjs vitest.config.ts .vscode-test.mjs`.
`.nvmrc`: `22`. `.editorconfig`: UTF-8, LF, 2 Leerzeichen, Newline am Dateiende. Prettier: `{"singleQuote": true, "printWidth": 110}`.
**Verifikation:** `git status` zeigt nur diese Dateien.
**Commit:** `chore: add repository scaffolding files`

### Task 0.2: Extension-Manifest und npm-Skripte
**Dateien:** Create `package.json`, `package.nls.json`, `package.nls.de.json`, `media/activity.svg`
**Was:** Manifest mit dem Kern aus dem folgenden Ausschnitt. Titel stehen über `%…%` in `package.nls*.json`.
Die Abhängigkeiten werden mit `npm i -D …` bzw. `npm i jsonc-parser` installiert, damit die Versionen gepinnt in der Lockfile landen.
```json
{
  "name": "edu-sharing-i18n",
  "displayName": "%displayName%",
  "description": "%description%",
  "version": "0.0.1",
  "publisher": "janschachtschabel",
  "license": "Apache-2.0",
  "repository": { "type": "git", "url": "https://github.com/janschachtschabel/i18n-translator-vscode" },
  "engines": { "vscode": "^1.90.0" },
  "categories": ["Linters", "Other"],
  "main": "./dist/extension.js",
  "l10n": "./l10n",
  "activationEvents": [
    "workspaceContains:**/common/de.json",
    "workspaceContains:**/mailtemplates/templates.xml",
    "workspaceContains:**/metadatasets/i18n/mds.properties"
  ],
  "capabilities": { "untrustedWorkspaces": { "supported": "limited", "description": "%untrusted.description%" } },
  "contributes": {
    "viewsContainers": { "activitybar": [{ "id": "eduI18n", "title": "%view.container%", "icon": "media/activity.svg" }] },
    "views": { "eduI18n": [{ "id": "eduI18n.areas", "name": "%view.areas%" }] },
    "viewsWelcome": [{ "view": "eduI18n.areas", "contents": "%view.areas.welcome%" }],
    "commands": [
      { "command": "eduI18n.check", "title": "%cmd.check%", "category": "edu-sharing i18n", "icon": "$(checklist)" },
      { "command": "eduI18n.configureRoots", "title": "%cmd.configureRoots%", "category": "edu-sharing i18n" }
    ]
  },
  "scripts": {
    "build": "node esbuild.mjs",
    "watch": "node esbuild.mjs --watch",
    "package": "node esbuild.mjs --production && vsce package --no-dependencies",
    "typecheck": "tsc -p tsconfig.json --noEmit && tsc -p tsconfig.webview.json --noEmit",
    "lint": "eslint .",
    "test:unit": "vitest run",
    "test:integration": "node esbuild.mjs --tests && vscode-test",
    "check:repo": "tsx scripts/check-repo.ts"
  }
}
```
`package.nls.json` (en) und `package.nls.de.json` (de) enthalten: `displayName` = „edu-sharing i18n",
`description`, `view.container`, `view.areas` („Bereiche"), `view.areas.welcome` (Text plus
`[Ordner festlegen](command:eduI18n.configureRoots)`), `cmd.check` („Prüfen"), `cmd.configureRoots` („Ordner festlegen…"),
`untrusted.description` („Im eingeschränkten Modus nur Anzeige und Prüfung; Schreiben und KI sind deaktiviert.").
**Dev-Abhängigkeiten:** `typescript esbuild vitest @vitest/coverage-v8 happy-dom @testing-library/preact axe-core @vscode/test-cli @vscode/test-electron @vscode/vsce eslint typescript-eslint prettier tsx @types/vscode@1.90.0 @types/node@20`.
**Abhängigkeiten:** `jsonc-parser` (Phase 0), später `preact @preact/signals @vscode/codicons` (Phase 2).
**Verifikation:** `npm install` endet ohne Fehler; `npx vsce ls` listet `package.json` und `dist/…` (nach dem Build).
**Commit:** `chore: add extension manifest and npm scripts`

### Task 0.3: TypeScript, ESLint (inkl. Architekturregeln), Prettier
**Dateien:** Create `tsconfig.base.json`, `tsconfig.json`, `tsconfig.webview.json`, `eslint.config.mjs`
**Was:**
- `tsconfig.base.json`: `target ES2022`, `module ESNext`, `moduleResolution Bundler`, `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `isolatedModules`, `skipLibCheck`.
- `tsconfig.json` für `src/core`, `src/extension`, `src/shared`, `scripts`, `test/unit/core`, `test/integration` mit `lib: ["ES2022"]`.
- `tsconfig.webview.json` für `src/webview`, `src/shared`, `test/unit/webview` mit `lib: ["ES2022","DOM","DOM.Iterable"]`, `jsx: "react-jsx"`, `jsxImportSource: "preact"`.
- ESLint (flat config, `typescript-eslint` recommended). **Architekturregeln:**
```js
{ files: ['src/core/**'], rules: {
  'no-restricted-imports': ['error', { paths: ['vscode'], patterns: ['**/extension/**', '**/webview/**'] }],
  'no-restricted-globals': ['error', 'window', 'document', 'navigator'] } },
{ files: ['src/webview/**'], rules: {
  'no-restricted-imports': ['error', { paths: ['vscode'], patterns: ['**/extension/**', 'node:*'] }] } },
```
**Test:** In `src/core/_probe.ts` testweise `import * as vscode from 'vscode'` einfügen; `npm run lint` muss mit `no-restricted-imports` scheitern. Danach die Datei löschen.
**Verifikation:** `npm run typecheck && npm run lint` → grün.
**Commit:** `chore: add typescript and eslint config with layer rules`

### Task 0.4: Build mit esbuild
**Dateien:** Create `esbuild.mjs`
**Was:** Zwei Bundles:
- `src/extension/extension.ts` → `dist/extension.js` (`platform: node`, `format: cjs`, `external: ['vscode']`, `target: node20`).
- `src/webview/main.tsx` → `dist/webview/main.js` (`platform: browser`, `format: iife`, `target: chrome114`), dazu `src/webview/styles/main.css` → `dist/webview/main.css`.

Flags: `--watch`; `--production` (minify, ohne Sourcemaps); `--tests` (bündelt `test/integration/**/*.test.ts` nach `out/test/integration/`, `external: ['vscode','mocha']`).
Zunächst gibt es nur Stubs: `src/webview/main.tsx` rendert `<p>edu-sharing i18n</p>`.
**Verifikation:** `npm run build` erzeugt `dist/extension.js` und `dist/webview/main.js`; `npm run build -- --production` bricht nicht ab.
**Commit:** `build: add esbuild bundling for extension, webview and tests`

### Task 0.5: Minimale Aktivierung mit leerer Seitenleiste
**Dateien:** Create `src/extension/extension.ts`, `src/extension/views/areasTree.ts`; Test: `test/integration/activation.test.ts`
**Interfaces:**
```ts
export function activate(context: vscode.ExtensionContext): void;
export function deactivate(): void;
export class AreasTreeProvider implements vscode.TreeDataProvider<AreaTreeNode> { /* Phase 0: getChildren() → [] */ }
```
**Test (integration, mocha):**
```ts
suite('activation', () => {
  test('registers commands', async () => {
    await vscode.extensions.getExtension('janschachtschabel.edu-sharing-i18n')!.activate();
    const cmds = await vscode.commands.getCommands(true);
    assert.ok(cmds.includes('eduI18n.check'));
    assert.ok(cmds.includes('eduI18n.configureRoots'));
  });
});
```
**Verifikation:** `npm run test:integration` → 1 passing (erwartet vorher: rot, weil keine Befehle registriert sind).
**Commit:** `feat: activate extension with empty areas view`

### Task 0.6: Test-Infrastruktur und synthetischer Fixture-Workspace
**Dateien:** Create `vitest.config.ts`, `.vscode-test.mjs`, `test/unit/core/smoke.test.ts`, `test/fixtures/workspace-basic/**`, `test/fixtures/README.md`
**Was:**
- vitest: `include: ['test/unit/**/*.test.{ts,tsx}']`, Coverage v8 über `src/core/**` mit Schwelle 90 % Zeilen (ab Phase 1 scharf).
- `.vscode-test.mjs`: zwei Profile (`min` → `version: '1.90.0'`, `stable` → `version: 'stable'`), `workspaceFolder: 'test/fixtures/workspace-basic'`, `mocha.timeout: 20000`.

**Fixture-Workspace** (synthetische Texte, **keine** Kopien aus dem GPL-Repo). Die Kategorien `common`, `admin`,
`editorial` und `broken` enthalten bewusst eingebaute Befunde. **Maßgeblich ist `test/fixtures/README.md`**: Es listet
alle 21 erwarteten Befunde (3 Fehler, 15 Warnungen, 3 Hinweise; 17 Diagnosen im Problems-Panel), die Regel-
Wechselwirkungen, von denen die Summen abhängen, und was absichtlich *nicht* gemeldet wird.

**Verifikation:** `npm run test:unit` und `npm run test:integration` → grün.
**Commit:** `test: add vitest, vscode-test and synthetic fixture workspace`

### Task 0.7: l10n-Gerüst
**Dateien:** Create `l10n/bundle.l10n.de.json`, `src/extension/l10n.ts`
**Was:** `vscode.l10n.t()` wird für alle Laufzeittexte verwendet. `l10n.ts` exportiert `webviewStrings(): Record<string,string>` (Phase 2).
Die Meldungen des Kerns sind englische Vorlagen mit Argumenten; die deutsche Übersetzung liegt im Bundle.
**Verifikation:** VS Code mit `--locale=de` starten (F5 → Extension Development Host); die Befehlstitel erscheinen auf Deutsch.
**Commit:** `feat: add localization scaffolding (de, en)`

### Task 0.8: CI (GitHub Actions)
**Dateien:** Create `.github/workflows/ci.yml`
**Was:** Matrix `ubuntu-latest`, `windows-latest`; Node 22; Schritte `npm ci` → `lint` → `typecheck` → `test:unit` → `build`.
Unter Ubuntu zusätzlich `xvfb-run -a npm run test:integration` und `npm run package` mit Upload der VSIX als Artefakt.
**Verifikation:** Push des Branches; beide Jobs sind grün, das Artefakt `edu-sharing-i18n-0.0.1.vsix` ist vorhanden.
**Commit:** `ci: add build, test and package workflow`

### Task 0.9: README und CONTRIBUTING
**Dateien:** Modify `README.md`; Create `CONTRIBUTING.md`
**Was:** README (Deutsch, kurzer englischer Abschnitt): Zweck, Status „in Entwicklung", Installation aus VSIX, Link auf `docs/plans`.
CONTRIBUTING: Entwicklungsumgebung (`npm ci`, F5), Tests, Architekturregeln (Ebenen), Commit-Konventionen.
**Verifikation:** Markdown-Vorschau ohne kaputte Links.
**Commit:** `docs: describe project status and development setup`

**Abnahme Phase 0:**
- `npm run package` erzeugt eine VSIX.
- Installation über „Extensions: Install from VSIX…" in VS Code 1.131 **und** Antigravity 1.107.
- Die Seitenleiste „edu-sharing i18n" erscheint mit Willkommenstext.
- CI ist grün.

---

## Phase 1 – Generischer Kern und „Prüfen" (Angular JSON, nur lesend)

**Schritt 0:** `/better-coding-workflow` aufrufen.

> **Umsetzungsnotizen Block A (Tasks 1.1–1.7, 24.09.2026):**
> - **1.1:** Nur der Zeilenindex. `applyEdits`, `detectEol` und `detectIndent` braucht erst das Schreiben in Phase 2. Der Testfall `positionAt(5)` im Plan war falsch (Offset 5 ist das `\n` von `\r\n`) und ist korrigiert. Wie VS Code beendet auch ein einzelnes `\r` eine Zeile.
> - **1.4:** Zusätzlich `parseAreaDefinition` (`src/core/area/parseArea.ts`), das eigene Bereiche aus `eduI18n.areas` validiert und alle Fehler gesammelt meldet. `FormatId` enthält nur Formate mit Adapter (Phase 1: `json-nested`).
> - **1.5:** Kein eigener Glob-Matcher im Kern. Der Host findet Markerdateien (VS Code `findFiles`, CLI `fs.glob`), `rootsFromMarkers` leitet daraus die Wurzeln ab.
> - **1.6:** Die Dekodierung liegt als `src/core/text/decode.ts` bei allen Formaten. Sie liest exaktes ISO-8859-1 statt `TextDecoder('latin1')`, das in Wahrheit Windows-1252 ist. Dateien mit Syntaxfehler liefern keine Einträge, weil ein teilweises Parsen nicht vertrauenswürdig ist. Doppelte Keys verhalten sich wie `JSON.parse`. Ein `DecodedText.eol` kommt erst mit dem Schreiben.
> - **1.7:** `Bundle` bietet `file()`, `entry()` und `value()` statt `location()`; die Position ergibt sich aus `entry().fields.value.valueRange` und `file().relPath`. Locales werden deterministisch nach Codepunkten sortiert.

### Task 1.1: Textänderungen und Zeilenindex
**Dateien:** Create `src/core/text/edits.ts`, `src/core/text/lineIndex.ts`; Test: `test/unit/core/text/edits.test.ts`, `lineIndex.test.ts`
**Interfaces:**
```ts
export interface TextEdit { offset: number; length: number; text: string }
export function applyEdits(text: string, edits: readonly TextEdit[]): string;   // throws RangeError on overlap
export function detectEol(text: string): '\n' | '\r\n';                         // majority, default '\n'
export function detectIndent(text: string): { insertSpaces: boolean; tabSize: number };
export interface LineIndex { positionAt(offset: number): { line: number; character: number } }
export function createLineIndex(text: string): LineIndex;                         // UTF-16 code units (like VS Code)
```
**Testfälle:**

| Aufruf | Erwartung |
|---|---|
| `applyEdits('abcdef', [{offset:4,length:1,text:'X'},{offset:1,length:1,text:'Y'}])` | `'aYcdXf'` (Reihenfolge egal) |
| `applyEdits('abc', [{offset:0,length:2,text:''},{offset:1,length:1,text:''}])` | wirft `RangeError` |
| `detectEol('a\r\nb\r\nc\n')` | `'\r\n'` |
| `detectIndent('{\n  "a": 1\n}')` | `{insertSpaces:true, tabSize:2}` |
| `detectIndent('{\n\t"a": 1\n}')` | `{insertSpaces:false, tabSize:1}` |
| `createLineIndex('a\nbc\r\nd').positionAt(5)` | `{line:2, character:0}` |

**Commit:** `feat(core): add text edit and line index utilities`

### Task 1.2: Modelltypen und Key-Kodierung
**Dateien:** Create `src/core/model/types.ts`, `src/core/model/keys.ts`; Test: `test/unit/core/model/keys.test.ts`
**Interfaces:**
```ts
export type AreaId = string; export type BundleId = string; export type LocaleCode = string; export type FieldId = string;
export const VALUE_FIELD: FieldId = 'value';
export interface EntryKey { readonly id: string; readonly segments: readonly string[] }
export function keyFromSegments(segments: readonly string[]): EntryKey;   // id = JSON.stringify(segments)
export function keyFromId(id: string): EntryKey;                           // inverse; throws on invalid id
export function displayKey(key: EntryKey): string;                         // segments.join('.')
```
**Testfälle:**
- `keyFromSegments(['ADMIN','mail.smtp.server']).id` → `'["ADMIN","mail.smtp.server"]'`
- `displayKey(…)` → `'ADMIN.mail.smtp.server'`
- `keyFromId(k.id).segments` ist gleich `k.segments`
- `keyFromId('x')` wirft einen Fehler

**Commit:** `feat(core): add entry key model with segment paths`

### Task 1.3: Locale-Modell und Referenzwahl
**Dateien:** Create `src/core/model/locale.ts`; Test: `test/unit/core/model/locale.test.ts`
**Interfaces:**
```ts
export interface LocaleInfo { code: LocaleCode; language: string; region?: string; variant?: string; isBaseFile: boolean }
export function parseLocale(code: LocaleCode, opts: { baseFileLanguage: string }): LocaleInfo;
export function pickReference(codes: readonly LocaleCode[], referenceLanguage: string, opts: { baseFileLanguage: string }): LocaleCode | undefined;
export function isVariant(code: LocaleCode, variants: Readonly<Record<string, { base: string }>>): boolean;
```
**Testfälle:**

| Aufruf | Erwartung |
|---|---|
| `parseLocale('de')` | `{code:'de', language:'de', isBaseFile:false}` |
| `parseLocale('de-no-binnen-i')` | `language:'de', variant:'no-binnen-i'` |
| `parseLocale('de_DE')` | `language:'de', region:'DE'` |
| `parseLocale('default', {baseFileLanguage:'en'})` | `language:'en', isBaseFile:true` |
| `pickReference(['de_DE','default','fr_FR'], 'de')` | `'de_DE'` |
| `pickReference(['de','de-informal','en'], 'de')` | `'de'` (Variante wird nie Referenz) |
| `pickReference(['en','fr'], 'de')` | `undefined` |

**Commit:** `feat(core): add locale parsing and reference selection`

### Task 1.4: Bereichsdefinition, Dateimuster und Presets
**Dateien:** Create `src/core/area/areaDefinition.ts`, `src/core/area/filePattern.ts`, `src/core/area/presets.ts`; Test: `test/unit/core/area/filePattern.test.ts`
**Interfaces:**
```ts
export type FormatId = 'json-nested' | 'json-flat' | 'properties' | 'mail-xml';
export interface AreaDefinition {
  id: AreaId; label: string; format: FormatId; roots: string[];
  files: string;                 // e.g. '{bundle}/{locale}.json' ; '[...]' = optional part
  localePattern: string;         // regex source
  bundlePattern?: string;        // default '[^/]+?'
  bundleName?: string;           // used when 'files' has no {bundle}
  referenceLanguage?: string;
  bundleOrder?: string[]; mergeSemantics?: 'shallow-toplevel' | 'none';
  ignoredKeys?: string[];
  detect?: { glob: string; marker: string };   // auto root detection
}
export interface PatternMatch { bundle: string; locale: LocaleCode }   // locale 'default' if absent
export function compileFilePattern(area: Pick<AreaDefinition, 'files' | 'localePattern' | 'bundlePattern' | 'bundleName'>): (relPath: string) => PatternMatch | null;
export const PRESETS: readonly AreaDefinition[];   // edu-sharing.angular / .mds / .mail (Tabelle 6.3 im Design)
```
Algorithmus: Literale werden regex-escaped. `{bundle}` wird zu `(?<bundle>…)`, `{locale}` zu `(?<locale>…)`,
`[…]` zu `(?:…)?`. Das Muster ist mit `^…$` verankert; Pfade verwenden `/`.
**Testfälle:**

| Muster | Pfad | Erwartung |
|---|---|---|
| Angular `{bundle}/{locale}.json` | `common/de-no-binnen-i.json` | `{bundle:'common', locale:'de-no-binnen-i'}` |
| Angular | `README.md` | `null` |
| MDS `{bundle}[_{locale}].properties` | `mds_brockhaus_de_DE.properties` | `{bundle:'mds_brockhaus', locale:'de_DE'}` |
| MDS | `valuespaces_i18n.properties` | `{bundle:'valuespaces_i18n', locale:'default'}` |
| MDS | `mds_override_de_DE.properties` | `{bundle:'mds_override', locale:'de_DE'}` |
| Mail `templates[_{locale}].xml` (bundleName `templates`) | `templates_fr_FR.xml` | `{bundle:'templates', locale:'fr_FR'}` |
| Mail | `templates.xml` | `{bundle:'templates', locale:'default'}` |

**Commit:** `feat(core): add declarative area definitions and file patterns`

### Task 1.5: Discovery (Wurzeln erkennen, Dateien klassifizieren)
**Dateien:** Create `src/core/discovery/discover.ts`; Test: `test/unit/core/discovery/discover.test.ts`
**Interfaces:**
```ts
export interface DiscoveredFile { areaId: AreaId; root: string; bundle: string; locale: LocaleCode; relPath: string }
export function detectRoots(paths: readonly string[], detect: { glob: string; marker: string }, exclude: readonly string[]): string[];
export function classifyFiles(paths: readonly string[], areas: readonly AreaDefinition[]): DiscoveredFile[];
```
Die Glob-Auswertung im Kern ist ein kleiner Matcher für `**`, `*` und `?`. Im Extension Host liefert `findFiles` bereits gefilterte Pfade.
**Testfälle:**
- Pfade `Frontend/src/assets/i18n/common/de.json`, `…/common/en.json`, `node_modules/x/i18n/common/de.json` mit Exclude `**/node_modules/**` ergeben die Wurzel `['Frontend/src/assets/i18n']`.
- Zwei Wurzeln (`data/1.0.0/json` und `Frontend/src/assets/i18n`) werden beide erkannt und sortiert.
- `classifyFiles` ordnet `Frontend/src/assets/i18n/admin/fr.json` zu `{areaId:'edu-sharing.angular', bundle:'admin', locale:'fr'}`.
- `…/i18n/README.md` wird ignoriert.

**Commit:** `feat(core): add root detection and file classification`

### Task 1.6: Format-Adapter-Schnittstelle und JSON-Parser (lesend)
**Dateien:** Create `src/core/formats/adapter.ts`, `src/core/formats/json/jsonNested.ts`; Test: `test/unit/core/formats/jsonNested.parse.test.ts`
**Interfaces:**
```ts
export interface DecodedText { text: string; encoding: 'utf-8' | 'latin-1'; bom: boolean; eol: '\n' | '\r\n' }
export interface ParsedField { value: string; valueRange: [number, number]; keyRange: [number, number] }
export interface ParsedEntry { key: EntryKey; fields: Record<FieldId, ParsedField> }
export type FileProblemCode = 'parse-error' | 'non-string-value' | 'duplicate-key' | 'not-utf8';
export interface FileProblem { code: FileProblemCode; range: [number, number]; detail?: string; key?: EntryKey }
export interface ParsedFile { entries: ParsedEntry[]; problems: FileProblem[]; topLevelKeys: string[] }
export interface FormatAdapter { id: FormatId; fieldMode: 'single' | 'dynamic'; decode(bytes: Uint8Array): DecodedText; parse(doc: DecodedText): ParsedFile }
export const jsonNestedAdapter: FormatAdapter;   // write API follows in phase 2
```
Umsetzung:
- `decode`: `new TextDecoder('utf-8', { fatal: true })`; BOM wird erkannt. Bei ungültigem UTF-8 wird mit `latin-1` dekodiert und im Parser das Problem `not-utf8` gemeldet.
- `parse`: `jsonc-parser.parseTree` mit `{ disallowComments: true, allowTrailingComma: false }`. Die Traversierung führt Segment-Pfade.
- Doppelte Property-Namen je Objekt werden erkannt; Nicht-String-Blätter werden als `non-string-value` gemeldet.

**Testfälle:**

| Eingabe | Erwartung |
|---|---|
| `{"A":{"mail.smtp.server":"SMTP"}}` | 1 Eintrag, Segmente `['A','mail.smtp.server']`, Wert `'SMTP'` |
| `{"a":"x","b":{"c":"y"}}` | Reihenfolge `a`, `b.c`; `topLevelKeys` `['a','b']` |
| `{}` | 0 Einträge, 0 Probleme |
| `{"a":1}` | Problem `non-string-value` |
| `{"a":"x","a":"y"}` | Problem `duplicate-key`; der Eintrag hat den Wert `'y'` |
| `{"a": }` | Problem `parse-error`, Bereich beginnt bei Offset 6 |
| `{"a":"x"}` | `valueRange` umfasst `"x"` inklusive Anführungszeichen (Offsets 5–8) |
| Bytes `EF BB BF 7B 7D` | `bom: true`, 0 Probleme |

**Commit:** `feat(core): add format adapter interface and nested JSON parser`

### Task 1.7: Einheiten aufbauen (Bundle)
**Dateien:** Create `src/core/model/bundle.ts`; Test: `test/unit/core/model/bundle.test.ts`
**Interfaces:**
```ts
export interface LoadedFile { locale: LocaleCode; relPath: string; doc: DecodedText; parsed: ParsedFile }
export interface Bundle {
  areaId: AreaId; id: BundleId; name: string;
  files: ReadonlyMap<LocaleCode, LoadedFile>; locales: LocaleCode[]; reference: LocaleCode | undefined;
  keys: EntryKey[];                                               // reference order first, then extras (stable)
  value(entryId: string, locale: LocaleCode, field?: FieldId): string | undefined;   // undefined = absent
  location(entryId: string, locale: LocaleCode, field?: FieldId): { relPath: string; range: [number, number] } | undefined;
}
export function buildBundle(area: AreaDefinition, name: string, files: readonly LoadedFile[],
  opts: { referenceLanguage: string; baseFileLanguage: string }): Bundle;   // id = `${area.id}/${name}`
```
**Testfälle:**
- Referenz `de` mit den Keys `[a,b]` und `fr` mit `[b,c]` ergibt die Key-Reihenfolge `[a,b,c]`.
- `value('["c"]','de')` → `undefined`.
- `locales` sind sortiert, die Referenz steht zuerst.
- In `ignoredKeys` genannte Keys erscheinen nicht in `keys`.

**Commit:** `feat(core): build bundles from parsed locale files`

### Task 1.8: Platzhalter-Scanner
**Dateien:** Create `src/core/checks/placeholders.ts`; Test: `test/unit/core/checks/placeholders.test.ts`
**Interfaces:**
```ts
export interface PlaceholderScan { params: string[]; conditions: string[]; endifs: number; genderSeparators: number; malformed: { index: number; text: string }[] }
export function scanPlaceholders(s: string): PlaceholderScan;
export function compareParams(ref: PlaceholderScan, tgt: PlaceholderScan): { missing: string[]; extra: string[] };
```
Regeln:
- Tokens `{{\s*([^{}]+?)\s*}}`, normalisiert per `trim`.
- `GENDER_SEPARATOR` zählt als Gender-Marker, nicht als Parameter.
- `if X` ergibt die Bedingung `X`; `endif` erhöht `endifs`; alles andere ist ein Parameter (auch `image:/…`).
- Bleiben nach dem Entfernen gültiger Tokens `{` oder `}` übrig, ist das ein Syntaxfehler (`malformed`).

**Testfälle:**

| Eingabe | Erwartung |
|---|---|
| `'Current {{{count}} is active'` | `params ['count']`, 1× `malformed` (Index 8) |
| `'{{ name }}'` gegenüber `'{{name}}'` | `compareParams` → keine Abweichung |
| `'Autor{{GENDER_SEPARATOR}}in'` | `params []`, `genderSeparators 1` |
| `'{{if message}}x {{message}}{{endif}}'` | `conditions ['message']`, `endifs 1`, `params ['message']` |
| `'({{date}})'` gegenüber `'({{data}})'` | `missing ['date']`, `extra ['data']` |
| `'{name}}'` · `'{{}}'` · `'{{a}'` | jeweils `malformed.length ≥ 1` |

**Commit:** `feat(core): add placeholder scanner`

### Task 1.9: HTML-Signatur
**Dateien:** Create `src/core/checks/html.ts`; Test: `test/unit/core/checks/html.test.ts`
**Interface:** `export function tagSignature(s: string): string[]` (sortierte Liste aus Tag-Namen, schließende mit `/`, Attribute ignoriert)
**Testfälle:**
- `'<b>x</b><br>'` → `['/b','b','br']`
- `'a < b'` → `[]` (kein Tag)
- `'<a href="x">y</a>'` gegenüber `'<a href="z">y</a>'` → gleiche Signatur

**Commit:** `feat(core): add html tag signature`

### Task 1.10: Regel-Framework und Runner
**Dateien:** Create `src/core/checks/types.ts`, `src/core/checks/runChecks.ts`, `src/core/checks/messages.ts`; Test: `test/unit/core/checks/runChecks.test.ts`
**Interfaces:**
```ts
export type Severity = 'error' | 'warning' | 'info';
export type RuleId = 'parse-error' | 'non-string-value' | 'duplicate-key' | 'not-utf8' | 'missing-file' | 'missing-key'
  | 'empty-value' | 'orphan-key' | 'misplaced-key' | 'placeholder-malformed' | 'placeholder-mismatch' | 'html-mismatch'
  | 'variant-needed' | 'variant-inconsistent' | 'variant-orphan' | 'key-overridden' | 'subtree-lost' | 'same-as-reference';
export interface Issue {
  rule: RuleId; severity: Severity; areaId: AreaId; bundleId: BundleId;
  locale?: LocaleCode; entryId?: string; field?: FieldId;
  args: Record<string, string | number | string[]>;
  location?: { relPath: string; range?: [number, number] };
}
export interface CheckContext { area: AreaDefinition; bundles: readonly Bundle[]; variants: VariantConfig; severityOverrides: Partial<Record<RuleId, Severity | 'off'>> }
export interface Rule { id: RuleId; defaultSeverity: Severity; run(ctx: CheckContext): Omit<Issue, 'severity'>[] }
export function runChecks(ctx: CheckContext, rules: readonly Rule[]): Issue[];   // applies overrides, drops 'off', stable sort
export function formatIssue(issue: Issue): { template: string; args: Record<string, string> };   // English template for l10n
```
**Testfälle:**
- Eine Regel mit Standard `warning` und Override `error` ergibt `severity: 'error'`.
- Override `off` entfernt die Befunde.
- Die Sortierung erfolgt nach Einheit, Sprache und Position.

**Commit:** `feat(core): add check rule framework and runner`

### Task 1.11: Regeln zu Vollständigkeit
**Dateien:** Create `src/core/checks/rules/missingFile.ts`, `missingKey.ts`, `emptyValue.ts`, `orphanKey.ts`, `misplacedKey.ts`, `fileProblems.ts`; Test: `test/unit/core/checks/rules/completeness.test.ts`
**Was:**
- **Vollständige Sprachen** sind alle Sprachen außer den in `variants` konfigurierten.
- **`missing-file`**: Eine vollständige Sprache, die im Bereich vorkommt, hat in der Einheit keine Datei.
- **`missing-key`**: Der Key existiert in einer anderen vollständigen Sprache, fehlt aber in L. Fehlt er in der Referenz, wird stattdessen `orphan-key` bei den Sprachen gemeldet, die ihn haben.
  Berechnet wird das **nur für Sprachen, die in der Einheit eine Datei haben**; eine fehlende Datei ergibt genau einen `missing-file`-Befund.
- **`misplaced-key`**: Ein verwaister Key teilt das letzte Segment mit einem in L fehlenden Key; `args.suggestion` enthält den Ziel-Key. Er **ersetzt** den `orphan-key`-Befund für diesen Eintrag.
- Lässt sich die **Referenzdatei** einer Einheit nicht parsen, entfallen für die Einheit `missing-key`, `orphan-key`, `misplaced-key` und `empty-value`; es bleibt der `parse-error`.
- **`fileProblems`**: Die Probleme aus dem Parser (`parse-error` usw.) werden durchgereicht.

**Testfälle:** synthetische Einheiten (in-memory, gebaut mit `buildBundle`):
- `fr` fehlt `b` → 1× `missing-key` (`locale fr`, `entryId ["b"]`).
- `it` hat `OLD` zusätzlich → `orphan-key`.
- `fr` hat `x.TITLE` statt `y.TITLE` → `misplaced-key` mit `suggestion 'y.TITLE'` und **kein** `orphan-key` für `x.TITLE`.
- Die Einheit `editorial` ohne `fr` in einem Bereich, in dem `fr` vorkommt → 1× `missing-file` und **kein** `missing-key` für `fr`.
- `""` → `empty-value`.
- `de-informal` ohne Key → **kein** `missing-key`.
- Referenzdatei mit Parse-Fehler, `en` hat einen Key, den sonst niemand hat → nur `parse-error`, kein `orphan-key`/`missing-key`.

**Commit:** `feat(core): add completeness rules`

### Task 1.12: Regeln zu Platzhaltern und HTML
**Dateien:** Create `src/core/checks/rules/placeholderMalformed.ts`, `placeholderMismatch.ts`, `htmlMismatch.ts`; Test: `…/rules/placeholders.test.ts`
**Testfälle:**
- `it: "({{data}})"` gegenüber `de: "({{date}})"` → `placeholder-mismatch` mit `args {missing:['date'], extra:['data']}` und `location.range` = Wert-Bereich in `it.json`.
- `{{{count}}` → `placeholder-malformed`.
- `{{ date }}` gegenüber `{{date}}` → kein Befund.
- `Autor{{GENDER_SEPARATOR}}in` gegenüber `Author` → kein Befund.
- `<b>` fehlt in fr → `html-mismatch`.
- Leere oder fehlende Werte → keine Platzhalter-Befunde (das deckt `missing-*` ab).

**Commit:** `feat(core): add placeholder and html rules`

### Task 1.13: Varianten-Regeln
**Dateien:** Create `src/core/checks/variants.ts`, `src/core/checks/rules/variantNeeded.ts`, `variantInconsistent.ts`, `variantOrphan.ts`; Test: `…/rules/variants.test.ts`
**Interfaces:**
```ts
export interface VariantRule { base: LocaleCode; requiredWhen: string; forbidden?: string; aiInstruction?: string }
export type VariantConfig = Readonly<Record<LocaleCode, VariantRule>>;
export const DEFAULT_VARIANTS: VariantConfig;   // de-informal, de-no-binnen-i (regex sources as in design 6.2 / settings)
export function compileVariants(cfg: VariantConfig): { rules: Map<LocaleCode, { base: LocaleCode; required: RegExp; forbidden?: RegExp }>; errors: { locale: LocaleCode; message: string }[] };
```
`DEFAULT_VARIANTS`:
- `de-informal`: `requiredWhen` und `forbidden` = `\b(Sie|Ihnen|Ihr|Ihre|Ihrem|Ihren|Ihrer|Ihres)\b`
- `de-no-binnen-i`: `requiredWhen` = `\{\{\s*GENDER_SEPARATOR\s*\}\}|[*:_]innen\b|[a-zäöüß]Innen\b`, `forbidden` = `\{\{\s*GENDER_SEPARATOR\s*\}\}`

**Testfälle:**
- `de: "Möchten Sie fortfahren?"`, in `de-informal` fehlt der Key → `variant-needed`.
- `de-informal: "Erstelle … für Ihr Medienzentrum"` → `variant-inconsistent` (Hinweis).
- `de-no-binnen-i` hat einen Key, den `de` nicht hat → `variant-orphan`.
- Ungültiger Regex in der Konfiguration → `errors.length === 1`, kein Absturz.

**Commit:** `feat(core): add language variant rules`

### Task 1.14: Laufzeit-Merge-Regeln (Angular)
**Dateien:** Create `src/core/checks/rules/keyOverridden.ts`, `subtreeLost.ts`; Test: `…/rules/merge.test.ts`
**Was:** Für jede Sprache wird das flache Top-Level-Merge in `bundleOrder` simuliert (nur bei `mergeSemantics: 'shallow-toplevel'`).
- **`key-overridden`**: Ein Blatt der früheren Kategorie ist im Merge-Ergebnis vorhanden, aber mit anderem Text. Gemeldet wird es an der früheren Datei, `args.winner` enthält die Kategorie, die gewinnt.
- **`subtree-lost`**: Ein Blatt der früheren Kategorie ist im Merge-Ergebnis nicht mehr erreichbar.

**Testfälle:**
- `common/de {ASK:'A'}` und `admin/de {ASK:'B'}` bei Reihenfolge `[common, admin]` → `key-overridden` an `common`, `winner 'admin'`.
- `common/de {W:{a:'1',b:'2'}}` und `workspace/de {W:{a:'1'}}` → `subtree-lost` für `W.b` an `common`.
- Gleicher Text → kein Befund.
- `mergeSemantics: 'none'` → keine Befunde.

**Commit:** `feat(core): simulate angular shallow merge for override rules`

### Task 1.15: Hinweis-Regeln
**Dateien:** Create `src/core/checks/rules/sameAsReference.ts`, `src/core/checks/rules/index.ts` (Registry `ALL_RULES`); Test: `…/rules/hints.test.ts`
**Was:** `same-as-reference` (Standard `info`) greift, wenn der Wert gleich der Referenz ist, die Sprache nicht die Referenz ist, die Referenz mindestens 4 Buchstaben enthält und der Wert nicht in `ignoreSameAsReference` steht (Einstellung, Standard `["OK","E-Mail","CC-0","ID"]`).
**Testfälle:**
- `fr MINUTE: 'Minute'` gegenüber `de 'Minute'` → Befund.
- `'OK'` → kein Befund.
- `'Min.'` (3 Buchstaben) → kein Befund.
- `ALL_RULES.length` entspricht der Anzahl der Regel-Dateien.

**Commit:** `feat(core): add hint rules and rule registry`

### Task 1.16: CLI `check-repo` (Abnahme gegen den echten Repo-Clone)
**Dateien:** Create `scripts/check-repo.ts`, `scripts/lib/fsScan.ts` (Node-Dateisystemzugriff, nur für Skripte; der Kern bleibt frei von `node:*`); Test: `test/unit/scripts/checkRepo.test.ts` (gegen den Fixture-Workspace)
**Aufruf:**
```bash
npm run check:repo -- "C:/Users/jan/staging/Windsurf/edu-sharing-community-repository-maven-fixes-11.0/edu-sharing-community-repository-maven-fixes-11.0"
```
**Ausgabe:** je Bereich und Regel die Anzahl, sortiert, plus die ersten 3 Beispiele je Regel. Mit `--json` gibt es eine maschinenlesbare Ausgabe.
**Test:** Gegen `test/fixtures/workspace-basic` stimmt die Ausgabe mit `--json` mit der Tabelle in `test/fixtures/README.md` überein.
**Verifikation (manuell):** Gegen den Repo-Clone stimmen die Zahlen mit dem Design-Dokument (Abschnitt 2.3) überein: 4 × `missing-file`, 10 × `placeholder-mismatch`, 22 × `placeholder-malformed`, 975 × `missing-key` (Summe en/fr/it), 12 × `empty-value`, 15 × `orphan-key`. Abweichungen werden in `docs/verification/phase-1.md` begründet.
**Commit:** `feat: add check-repo cli for acceptance runs`

### Task 1.17: WorkspaceIndex (Extension Host)
**Dateien:** Create `src/extension/config.ts`, `src/extension/services/workspaceIndex.ts`; Test: `test/integration/workspaceIndex.test.ts`
**Interfaces:**
```ts
export interface IndexSnapshot { areas: { area: AreaDefinition; bundles: Bundle[] }[]; issues: Issue[]; configErrors: string[]; durationMs: number }
export class WorkspaceIndex implements vscode.Disposable {
  constructor(private readonly log: vscode.LogOutputChannel);
  readonly onDidChange: vscode.Event<IndexSnapshot>;
  current(): IndexSnapshot | undefined;
  refresh(): Promise<IndexSnapshot>;       // full index
  dispose(): void;
}
```
Umsetzung:
- Areas = Presets plus `eduI18n.areas`; Wurzeln aus `eduI18n.roots` oder automatisch (`findFiles(detect.glob, excludeGlob)`).
- Dateien je Wurzel über `findFiles(new RelativePattern(root, '**/*'))`, danach `classifyFiles`.
- Lesen mit `workspace.fs.readFile`, danach Adapter-`decode`/`parse`, `buildBundle`, `runChecks`.
- `FileSystemWatcher` je Wurzel (Create/Change/Delete) mit 300 ms Debounce.
- Konfigurationsänderungen (`onDidChangeConfiguration` für `eduI18n`) lösen `refresh()` aus.
- Dauer und Anzahl gehen ins Log.

**Test (integration, Fixture-Workspace):**
- Die Einheiten `admin`, `broken`, `common` und `editorial` sind vorhanden.
- Die Befunde entsprechen `test/fixtures/README.md`.
- Nach dem Schreiben einer neuen Datei `…/common/es.json` mit `{}` meldet `onDidChange` innerhalb von 2 s `missing-key` für `es`. Die Datei wird danach wieder gelöscht.

**Commit:** `feat: index i18n areas in the workspace`

### Task 1.18: Problems-Panel (Diagnostics)
**Dateien:** Create `src/extension/diagnostics/diagnosticsPublisher.ts`; Test: `test/integration/diagnostics.test.ts`
**Interfaces:**
```ts
export class DiagnosticsPublisher implements vscode.Disposable {
  constructor(index: WorkspaceIndex, collection = vscode.languages.createDiagnosticCollection('eduI18n'));
}
export function toDiagnostics(issues: readonly Issue[], texts: ReadonlyMap<string, string>, mode: 'aggregate' | 'individual' | 'off'): Map<string, vscode.Diagnostic[]>;
```
Regeln:
- Nur `error` und `warning` werden gemeldet (`info` nie).
- `missing-key` im Modus `aggregate`: **eine** Diagnose je Zieldatei in Zeile 1 („36 Schlüssel fehlen (Rückfall auf de)").
- Fehlt die Zieldatei selbst (`missing-file`), wird die Diagnose an die Referenzdatei gehängt.
- Bereiche werden über `createLineIndex` bestimmt; `code` ist die Regel-ID; `source` ist `edu-sharing i18n`.
- `relatedInformation` verweist auf die Referenzstelle.

**Test:** Im Fixture-Workspace hat `common/fr.json` genau **vier** Diagnosen: `placeholder-mismatch` in der Zeile von `ERROR_TITLE`, eine gebündelte `missing-key`-Diagnose, `empty-value` (`SAVE`) und `html-mismatch` (`BOLD_HINT`). Insgesamt sind es 17 Diagnosen (siehe `test/fixtures/README.md`).
**Commit:** `feat: publish check results to the problems panel`

### Task 1.19: Seitenleiste mit Zählern
**Dateien:** Modify `src/extension/views/areasTree.ts`; Create `src/extension/views/decorations.ts`; Test: `test/integration/areasTree.test.ts`
**Was:**
- Die Knoten sind Bereich → Einheit.
- Beschreibung, z. B. `1.437 · ✖ 5 · ⚠ 518` (Zahlen mit `Intl.NumberFormat` der UI-Sprache).
- Tooltip (Markdown): Tabelle mit Sprachen und Zählern.
- `TreeView.badge` = Anzahl der Fehler.
- `FileDecorationProvider` (Schema `edu-i18n:`) für Farbe und Badge.
- Kontextmenü „Prüfen" und „Dateien im Explorer zeigen".
- Willkommensansicht, wenn nichts gefunden wurde.

**Test:** `getChildren()` liefert die Bereiche in der Reihenfolge der Presets; die Einheit `common` im Fixture-Workspace hat die Beschreibung mit den erwarteten Zählern.
**Commit:** `feat: show areas and bundles with issue counts`

### Task 1.20: Statusleiste und Befehl „Prüfen"
**Dateien:** Create `src/extension/views/statusBar.ts`, `src/extension/commands/check.ts`, `src/extension/commands/configureRoots.ts`; Modify `src/extension/extension.ts`; Test: `test/integration/commands.test.ts`
**Was:**
- **Statusleiste:** `$(globe) i18n  ✖ 32  ⚠ 1.1k`; Klick fokussiert die Seitenleiste; Tooltip mit Aufschlüsselung.
- **`eduI18n.check`:** ruft `refresh()` auf und zeigt „Prüfung abgeschlossen: 32 Fehler, 1.214 Warnungen" mit dem Button „Probleme anzeigen" (`workbench.actions.view.problems`).
- **`eduI18n.configureRoots`:** Ordnerauswahl je Bereich, schreibt `eduI18n.roots` in die Workspace-Einstellungen.

**Test:** Nach der Ausführung von `eduI18n.check` im Fixture-Workspace passt der Text der Statusleiste zu den Fixture-Zahlen.
**Commit:** `feat: add status bar summary and check command`

### Task 1.21: Abnahme Phase 1 dokumentieren
**Dateien:** Create `docs/verification/phase-1.md`
**Was:**
- `npm run check:repo -- <clone>` ausführen und die Ausgabe gegen das Design (2.3) vergleichen.
- VS Code auf dem Repo-Clone öffnen; Screenshots von Problems-Panel, Seitenleiste und Statusleiste in Light+ und Dark+.
- Dauer der Indizierung aus dem Log (Ziel < 1,5 s).
- Tastatur-Durchlauf durch Seitenleiste und Problems-Panel.

**Abnahme Phase 1:**
- Alle Zahlen stimmen oder sind begründet.
- Keine Schreibzugriffe auf Dateien (Git-Status unverändert).
- Kern-Abdeckung ≥ 90 %; CI grün.

**Commit:** `docs: record phase 1 verification`

---

## Phasen 2–8 (Gliederung – Detailtasks folgen vor Phasenstart)

**Phase 2 – Bearbeiten (Angular).**
- Schritt 0: `/better-coding-workflow` und `/better-coding-frontend`.
- 2.1 JSON-Adapter Schreib-API (`set`, `insert` nach Geschwister, `delete`, `rename`) mit Golden-Tests (No-op byte-identisch, 1 Diff-Zeile, Punkt-Keys, Komma-Behandlung beim Löschen des letzten Keys, Einrückung/EOL/Newline am Ende).
- 2.2 Semantische Schreib-Operationen und Validierung (niemals leere Werte).
- 2.3 FileStore (Dirty-Guard, Queue je Datei, Revisionsprüfung, Sitzungs-Undo).
- 2.4 BackupService (`storageUri`, Intervall, N behalten, Wiederherstellen).
- 2.5 EditorPanel (CSP mit Nonce, `localResourceRoots`, `retainContextWhenHidden`, Serializer) und Message-Router mit Laufzeitvalidierung.
- 2.6 `shared/protocol.ts` und ViewModel-Builder.
- 2.7 Webview-Grundgerüst (Preact, Theme-CSS, Live-Region, l10n).
- 2.8 Werkzeugleiste und Sprach-Chips (Sichtbarkeit, Referenzmarke, Zähler, Scroll-Anker).
- 2.9 Filterleiste (Key/Wert, Regex, Groß-/Kleinschreibung, Status, je Sprache) als reine Filterfunktion mit Tests.
- 2.10 Tabellenansicht (ARIA-Grid, roving `tabindex`, fixierte Kopfzeile und Key-Spalte, schrittweises Rendern).
- 2.11 Listenansicht und Auto-Umschaltung nach Breite.
- 2.12 Zell-Editor (ein- und mehrzeilig, automatisches Wachsen, Tastenlogik, Inline-Prüfung).
- 2.13 Details-Leiste.
- 2.14 Befehle Key hinzufügen, umbenennen und löschen (Scope-Dialoge, Warnung „existiert in `common`") sowie Sprache hinzufügen (`{}`-Dateien).
- 2.15 Umgang mit externen Änderungen.
- 2.16 a11y-Tests (axe, Tastatur-Skript, NVDA-Protokoll).
- 2.17 Performance-Test mit 2.000 Keys.

**Phase 3 – Füllen (Übersetzungsspeicher und KI).**
- Schritt 0: `/better-coding-workflow` und `/better-coding-frontend`.
- 3.1 SecretService sowie Befehle Schlüssel setzen, löschen und testen (`/models`, Modellverfügbarkeit, Mini-Request).
- 3.2 Modellprofile (GPT-5/6/o, AcademicCloud, Qwen3, Mistral).
- 3.3 b-api-Client (`X-API-KEY`, Timeout, Abort, Retry 429/502/503/504, Limiter, Fehler ohne Schlüssel) mit Mock-Tests.
- 3.4 Prompts und JSON-Schemas (Einzel, Batch, Variante, Review, Mail) mit Snapshot-Tests.
- 3.5 Validierung der Vorschläge.
- 3.6 Übersetzungsspeicher (exakte Referenztreffer, Häufigkeit).
- 3.7 AiService (Chunks, Fortschritt, Abbruch, Split bei `length`).
- 3.8 Zell-Vorschlag (`Strg+I`) und Speicher-Chip.
- 3.9 Dialog „Füllen" und Prüfliste mit Übernehmen (Backup, Batch-Write, Review-Status).
- 3.10 Varianten-Generierung.
- 3.11 KI-Review-Panel und Diagnosen der Quelle „KI-Review".
- 3.12 Datenschutzhinweis und `ai.enabled`.

**Phase 4 – Import und Export.**
- Schritt 0: `/better-coding-workflow` und `/better-coding-frontend`.
- 4.1 Exchange-Typen.
- 4.2 CSV-Codec (RFC 4180, Trennzeichen-Erkennung, BOM, mehrzeilige Felder).
- 4.3 JSON-Codecs (verschachtelt, flach, Hülle) und Formaterkennung.
- 4.4 Import aus `.properties` und Mail-XML über die Adapter.
- 4.5 Zuordnungs-Engine (Hülle → Pfad → Key-Überschneidung).
- 4.6 Befehl Import (aktiver Editor, Datei, Zwischenablage; Menü im Editor-Titel).
- 4.7 Import-Vorschau (Webview) mit Übernehmen.
- 4.8 Befehl Export (Umfang, Sprachen, Filter, Format → Untitled-Dokument oder Datei).
- 4.9 Integrationstest des Rundlaufs.

**Phase 5 – Metadatasets.**
- Schritt 0: `/better-coding-workflow`.
- 5.1 Properties-Codec (Encoding-Erkennung, `\uXXXX`).
- 5.2 Zeilenerhaltender Parser (Fortsetzungen, Escapes, Kommentare, Wächterzeile).
- 5.3 Schreib-Operationen (Trennzeichen und Abstände erhalten, Kopf und Wächterzeile für neue Dateien).
- 5.4 Golden-Tests (UTF-8, Latin-1, CRLF, ohne Newline am Ende) und `check-repo --roundtrip`.
- 5.5 MDS-Preset, Regel `duplicate-key`, Anzeige „default (en)".

**Phase 6 – Mail-Templates.**
- Schritt 0: `/better-coding-workflow` und `/better-coding-frontend`.
- 6.1 XML-Tokenizer mit Positionen.
- 6.2 Schreib-Operationen (Betreff escapen, CDATA-sicher, Template in allen Sprachen anlegen oder löschen, Feld hinzufügen).
- 6.3 Mail-Regeln (Template oder Feld fehlt, Bedingungen, Platzhalter, HTML, nicht übersetzbare Templates).
- 6.4 Template-Ansicht (Code, sandboxed Vorschau mit `stylesheet`, Referenz neben Bearbeitung).
- 6.5 KI für Templates.
- 6.6 Round-Trip- und Integrationstests.

**Phase 7 – Kontext und Review.**
- Schritt 0: `/better-coding-workflow` und `/better-coding-frontend`.
- 7.1 Metadaten-Modell, -Datei und -Service.
- 7.2 Kontext-Hinweis und -URL (Simple Browser oder extern).
- 7.3 Review-Status und „Review anfordern".
- 7.4 `reference-changed`.
- 7.5 Akzeptierte Warnungen (Fingerabdruck).
- 7.6 Ansicht „nach Wert gruppieren" und `inconsistent-translation`.
- 7.7 Übersicht (Einheiten × Sprachen).
- 7.8 Metadaten beim Umbenennen und Löschen mitziehen.

**Phase 8 – Feinschliff und Release.**
- Schritt 0: `/better-coding-workflow`.
- 8.1 Dokumentation (README DE/EN, Nutzerhandbuch, Tastatur- und Einstellungsreferenz).
- 8.2 l10n DE komplett.
- 8.3 a11y-Audit (`/better-coding-frontend`, Audit-Modus) und Behebungen.
- 8.4 Performance mit dem echten Repo.
- 8.5 Release-Workflow (Tag → VSIX → GitHub Release).
- 8.6 Rauchtests in VS Code, Antigravity und Windsurf/Cursor.
