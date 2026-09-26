# Taskliste: edu-sharing i18n – VS-Code-Extension

> Gehört zu [`2026-09-24-edu-sharing-i18n-vscode-design.md`](2026-09-24-edu-sharing-i18n-vscode-design.md).
> **Phasen 0 bis 2 sind vollständig ausgearbeitet** (Phase 2 am 24.09.2026, vor ihrem Start), ebenso die am
> 26.09.2026 vorgezogenen Phasen 5 und 6 (Kern) und die offenen Punkte aus 0.3.0. Die übrigen Phasen stehen hier als Gliederung. Ihre Tasks werden vor dem Start der jeweiligen Phase im selben Detailgrad ausgearbeitet und kurz
> abgenommen. So stecken Entscheidungen aus der Abnahme (E1–E9) nicht in bereits geschriebenem Plan-Code fest.

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
> - **Verschoben (YAGNI, Review Block A):**
>   - `AreaDefinition.ignoredKeys` samt Abnahmefall aus 1.7 kommt in **Phase 5**; einziger Anwendungsfall ist die Wächterzeile der MDS-`.properties`.
>   - `FormatAdapter.fieldMode` kommt in **Phase 6** mit den dynamischen Mail-Feldern.
>   - `isVariant()` aus 1.3 entfällt; die Regeln fragen `ctx.variants.has(locale)` ab.
>   - `classifyFiles(paths, areas)` nimmt Bereiche samt aufgelösten Wurzeln (`{ area, roots }[]`), weil der Host die Wurzeln ermittelt.
>
> **Umsetzungsnotizen Block B (Tasks 1.8–1.15):**
> - **1.10:** Die Varianten-Konfiguration (`variants.ts`: `DEFAULT_VARIANTS`, `compileVariants`) ist aus 1.13 vorgezogen, weil schon die Vollständigkeitsregeln die dünn besetzten Sprachen kennen müssen. Englische Meldungsvorlagen liegen als Katalog im Kern (`messages.ts`, `{name}`-Argumente, gemeinsam für CLI und Extension). Die Argumente einer Meldung enthalten den Anzeige-Key (`args.key`).
> - **Regeldateien:** `missingKeys.ts` (missing, orphan und misplaced teilen sich eine Analyse), `variantRules.ts`, `mergeRules.ts`, gemeinsame Hilfen in `support.ts`, Registry `rules/index.ts`.
> - **Positionen:** Key-bezogene Befunde (orphan, misplaced, duplicate, Merge-Regeln) zeigen auf den Key, Text-bezogene (leer, Platzhalter, HTML, Variante) auf den Wert. `missing-key` zeigt auf die Datei, `missing-file` auf den Anfang der Referenzdatei.
> - **`variant-needed`** nennt den konkreten Treffer (z. B. „Sie") und gilt auch für Einheiten ohne Variantendatei, sobald der Bereich die Variante nutzt.
> - **Zusätzlich:** `src/core/pipeline/analyze.ts` (`analyzeRoot`: Dateien → Einheiten → Prüfungen, gemeinsam für CLI und Extension), die Adapter-Registry `formats/registry.ts` und ein Vertragstest gegen den Fixture-Workspace (alle 21 Befunde aus `test/fixtures/README.md`).
> - **Abweichende Schnittstellen (Review Block B, #8):**
>   - `Issue.field` fehlt. Es kommt mit den Mail-Feldern in **Phase 6**; bis dahin hat jeder Eintrag nur das Feld `value`.
>   - `severityOverrides` ist ein Parameter von `runChecks` statt ein Teil von `CheckContext`. Die Regeln kennen nur ihre Standard-Schwere; der Runner wendet die Einstellung an.
>   - `compileVariants` liefert Fehler als Text (`"Variant de-informal: …"`) statt `{locale, message}`. Die Locale steht im Text; die Einstellungen zeigen die Fehler nur an.
>   - Eine Variante mit ungültigem Ausdruck bleibt registriert (dünn besetzt), nur die Prüfung mit diesem Ausdruck entfällt.
> - **Review Block B, behoben:** Merge-Meldungen nennen die Sprache und die Merge-Reihenfolge statt „die ganze App" (Produktions-Builds führen im Backend anders zusammen, siehe Design §2.2). `misplaced-key` ordnet eins zu eins zu (längste gemeinsame Endung zuerst); die drei Vollständigkeitsregeln teilen sich eine Analyse je Einheit. `same-as-reference` zählt nur sichtbare Buchstaben. Nur `{{GENDER_SEPARATOR}}` in exakter Schreibweise gilt als Gendermarker. Ein Vertragstest prüft, dass jede Regel alle Argumente ihrer Meldung liefert.
>
> **Umsetzungsnotizen Block C/D (Tasks 1.17–1.20):**
> - **1.17 `IndexSnapshot`:** `{ roots: IndexedRoot[]; errors: string[]; durationMs }`, dabei `IndexedRoot = { folder, settings, analysis: RootAnalysis }`. Das ersetzt `areas`/`issues`/`configErrors` aus dem Plan: Zwei Wurzeln sind zwei unabhängige Installationen, und Pfade gelten relativ zum Workspace-Ordner. `errors` enthält Einstellungsfehler, Variantenfehler und nicht lesbare Dateien. Konfigurationswarnungen der Analyse (zwei Dateien für eine Locale) bleiben in `analysis.warnings` und gehen ins Log.
> - **1.17 Ablauf:** `SerialRunner` verhindert parallele Läufe; Aufrufe während eines Laufs teilen sich einen Folgelauf. Watcher gibt es je Wurzel (`**/*`) und je erkanntem Bereich für die Markerdatei. Neu indiziert wird auch bei Änderungen der Workspace-Ordner und bei erteiltem Vertrauen. Die Dateisuche meldet den Laufwerksbuchstaben unter Windows klein (`/c:/…`); `relativeUriPath` vergleicht ihn deshalb ohne Groß-/Kleinschreibung.
> - **1.17 Messung:** Das Log nennt je Lauf die Phasen (detect, list, read, analyze). Am echten Repo dauert ein warmer Lauf 244–363 ms (analyze 76–168 ms). Der erste Lauf nach dem Start dauerte 3,1 s, davon 2,7 s Markersuche, während VS Code und Git noch starteten; ripgrep allein braucht dafür 136–335 ms (9.909 Dateien). Der Test „Datei hinzufügen/löschen" wartet bis zu 10 s statt 2 s (Puffer für CI); lokal dauert der Rundlauf 1,1–1,4 s.
> - **1.18:** `toProblems(analysis, mode)` liegt als reine Funktion im Kern (`src/core/report/problems.ts`) statt `toDiagnostics(issues, texts, mode)` im Host; der Host lokalisiert nur und erzeugt `vscode.Diagnostic`. Ein einzelner fehlender Key behält im Modus `aggregate` seine eigene Meldung (die Sammelmeldung gilt ab zwei Keys, so passt der Plural). Verknüpfte Informationen zeigen `de: <Referenztext>` bzw. `KEY: <Referenztext>` (sprachneutral, auf 80 Zeichen gekürzt). `src/extension/localize.ts` ist der einzige Aufruf von `l10n.t()` ohne Literal; der l10n-Test prüft stattdessen den Katalog (`MESSAGE_TEMPLATES`).
> - **1.19:** Die oberste Ebene sind die indizierten Wurzeln (Bereichsname, Pfad als Beschreibung), darunter die Einheiten. Probleme des Laufs stehen in einem eigenen Knoten. Die Zahlen stehen in Beschreibung, Tooltip-Tabelle und Screenreader-Label (Form „Fehler 3" statt „3 Fehler", damit kein Plural nötig ist). Badges von Dekorationen haben höchstens zwei Zeichen („9+"). „Im Explorer zeigen" markiert die Referenzdatei. Die Willkommensansicht unterscheidet „Suche läuft" und „nichts gefunden" (Kontext-Key `eduI18n.indexed`).
> - **1.20:** Die Statusleiste zeigt immer beide Zahlen, kompakt formatiert. „Prüfen" wartet nicht auf die Benachrichtigung, sonst hinge der Befehl, bis sie geschlossen wird. „Ordner festlegen" fragt zuerst nach Vertrauen (`eduI18n.roots` ist eingeschränkt), bietet „Automatisch erkennen" an und schreibt nur den Wert des Workspace-Ordners. Der Befehl ist nur manuell geprüft (Dialoge lassen sich im Testhost nicht bedienen).
> - **Review Block C/D, behoben:**
>   - Diagnosen werden je Datei gesetzt: VS Code überträgt je `set`-Aufruf höchstens 1.100 Diagnosen und verwirft die restlichen Dateien stillschweigend (Modus `individual` im echten Repo: 1.222).
>   - Verknüpfte Informationen sind fertige, sprachneutrale Texte; sie laufen nicht mehr über `l10n.t`, das für jede fehlende Übersetzung eine Warnung ins Log schreibt.
>   - Wurzelknoten haben ein Screenreader-Label mit Zählern.
>   - Markdown-Escaping, Dekorationen und Badge sind getestet.
>   - Bereichs-IDs wie `constructor` brechen den Lauf nicht mehr ab.
>   - In verschachtelten Workspace-Ordnern gehört eine Wurzel nur zum innersten Ordner.
>   - „Ordner festlegen" ignoriert unter Windows und macOS die Groß-/Kleinschreibung.
>   - „Prüfen" nennt Probleme beim Indizieren.
>   - Deutsche Begriffe folgen VS Code („Arbeitsbereich", Ansicht „Probleme").
> - **Verschoben (Review Block C/D):** Die Meldungen der Einstellungsprüfung im Kern (`parseSettings`, `parseAreaDefinition`, Dateimuster, Varianten) sind noch englischer Text. Sie werden in **8.2** zu Vorlagen mit Argumenten (wie `ISSUE_MESSAGES`) und übersetzt; ebenso die Parser-Codes in `parse-error` („ValueExpected"). Die Meldungen des Hosts selbst sind lokalisiert.

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

## Phase 2 – Bearbeiten (Angular)

**Schritt 0:** `/better-coding-workflow` und `/better-coding-frontend` aufrufen. Nach jedem Block (A: 2.1–2.5,
B: 2.6–2.11, C: 2.12–2.17) folgt ein Review mit `/better-coding-review`.

**Ziel:** Eine Einheit lässt sich in einem Editor-Tab bearbeiten (Tabelle oder Liste). Jede Änderung schreibt die
betroffene Datei verlustfrei; Keys und Sprachen lassen sich anlegen, umbenennen und löschen. Nichts wird geschrieben,
was nicht ausdrücklich geändert wurde.

**Entwurfsentscheidungen (ergänzen Design §6.4, §6.10, §6.12, §7):**
- **B1 Wahrheit im Host.** Die Webview zeigt ein ViewModel und schickt Änderungswünsche. Der Host plant sie
  (`planEdit`), schreibt über den `FileStore` und aktualisiert die betroffene Wurzel sofort (ohne auf den Watcher zu
  warten). Die Webview zeigt den eingegebenen Wert sofort an und gleicht beim nächsten Modell ab.
- **B2 Nie leere Werte schreiben.** Wird eine Übersetzung geleert, wird ihr Key in dieser Sprache **gelöscht**,
  damit der Rückfall greift (ein leerer Text würde ihn verhindern, siehe `empty-value`). Ein Text nur aus Leerraum gilt
  als geleert (Audit L-06). Referenztexte lassen sich nicht leeren; bestehende absichtlich leere Referenztexte bleiben
  unberührt.
- **B3 Operationen statt Textersetzung.** `FileOp`s werden der Reihe nach auf den Text angewandt; nach jeder Operation
  wird neu geparst. Das Ergebnis ist der neue Text (`applyOps` statt `edit(): TextEdit[]` aus dem Design): Minimale
  Edits über mehrere Operationen zusammenzusetzen lohnt sich bei Dateien dieser Größe nicht, und E3 schreibt ohnehin
  Bytes statt `WorkspaceEdit`s.
- **B4 Formatierung aus der Datei.** Zeilenende, Einrückung und Newline am Dateiende werden erkannt. Eingefügt wird
  mit eigener Textoperation direkt hinter dem Geschwister-Key und mit dessen Einrückung. `jsonc-parser.modify`
  formatiert sonst die Nachbarzeile neu, z. B. werden Tabs zu Leerzeichen oder `"A":"1" ,` zu `"A": "1",`
  (Probelauf 24.09.2026). Fehlende Elternobjekte schreibt der Adapter ebenfalls selbst im Stil der Datei;
  `jsonc-parser` dient nur noch zum Parsen.
- **B5 Rebase statt Abbruch.** Jede Änderung trägt die Revision (Hash) der Datei, auf der sie beruht. Hat sich die
  Datei inzwischen geändert, werden die Operationen auf den neuen Stand angewandt. Ein Konflikt entsteht nur, wenn ein
  betroffener Key inzwischen fehlt oder einen anderen Text hat als der Ausgangswert der Änderung. Als Grundlage gelten
  alle Dateien der geänderten Einheiten, nicht nur die geschriebenen: Ändert ein `git pull` die Referenz, wird neu
  geplant (Audit L-11).
- **B6 Webview-Technik.** Preact und `@preact/signals`, eigener esbuild-Build (`platform: 'browser'`, IIFE) nach
  `dist/webview/`; Codicons werden dorthin kopiert. Typprüfung über `tsconfig.webview.json` (DOM-Typen, kein Node).
  Komponententests mit vitest, `happy-dom`, `@testing-library/preact` und `axe-core`
  (Datei-Kommentar `// @vitest-environment happy-dom`). Protokollnachrichten prüfen handgeschriebene Typwächter,
  ohne zusätzliche Bibliothek.
- **B7 Zustand der Ansicht** (Layout, sichtbare Sprachen, Filter, Zeilenmodus) gilt je Einheit und liegt in
  `workspaceState`; die Webview meldet Änderungen per `uiState`.

> **Umsetzungsnotizen Block A (Tasks 2.1–2.3, 24.09.2026):**
> - **2.1:** `detectStyle('{}')` ergibt `finalNewline: false`: Eine neue Sprachdatei übernimmt auch eine fehlende Newline der Referenzdatei. Den Standard (`DEFAULT_STYLE`) gibt es nur für das, was der Text nicht zeigt (Zeilenende, Einrückung). `applyEdits` weist zwei Einfügungen an derselben Stelle ab, weil ihre Reihenfolge sonst von der Reihenfolge der Edits abhinge.
> - **2.2:**
>   - `encode` schreibt auch Latin-1 schon jetzt (nicht erst in Phase 5), damit eine `not-utf8`-Datei byte-genau zurückgeschrieben wird. Zeichen jenseits von ISO-8859-1 schreibt der JSON-Adapter dort als `\uXXXX` (Design §6.4).
>   - U+2028 und U+2029 schreibt der Adapter immer als Escape, sonst bietet VS Code beim Öffnen an, sie zu entfernen.
>   - `encodeText` wirft bei unvollständigen Zeichen (einzelnen Surrogaten), statt sie durch U+FFFD zu ersetzen.
>   - Eine Datei nur aus Leerraum ist wie beim Lesen ein Syntaxfehler (`unparsable`). Nur eine leere Datei gilt als `{}`.
>   - Doppelte Keys: `set` ändert die gültige (letzte) Definition. `delete` und `rename` entfernen alle Definitionen, damit keine verdeckte wieder gilt.
>   - Gemessen an einer Datei mit 3.000 Keys (225 KiB): `set` etwa 3 ms, `delete` etwa 2 ms, Umbenennen in ein anderes Objekt etwa 4 ms.
> - **2.3, abweichende Schnittstellen:**
>   - `before?: string | null` (`null`: Die Sprache hatte keinen Text).
>   - `FileChange` hat ein Feld `kind`. `create` bringt den fertigen Inhalt im Layout der Referenzdatei mit.
>   - Der Fehlerfall heißt `problem` statt `error`. `PlanResult` hat keine `warnings`: Warnungen liefert `checkNewKey` vor der Änderung (Dialoge); die Planung kennt weder die anderen Einheiten noch den Bereich.
>   - `checkKey` heißt `checkNewKey`. Die Prüfung ohne Warnungen ist `newKeyProblem`, der Kollisionstest `collidingKey`.
>   - Codes und englische Vorlagen stehen in `edit/editMessages.ts`, der Katalog aller Vorlagen für die Übersetzung in `report/catalog.ts`.
>   - Die Pfade neuer Dateien bildet `formatFilePattern` (`area/filePattern.ts`) aus dem Dateimuster.
> - **2.3, Regeln:**
>   - Einfügeposition: hinter dem nächsten Key der Einheitenreihenfolge, den die Datei im tiefsten vorhandenen Elternobjekt des neuen Keys hat, gekürzt auf die Ebene des neuen Eintrags. Folgt ein Text in der Referenz auf `OBJ.X`, kommt er also hinter das Objekt `OBJ`. `addKey` sucht ab `after` selbst.
>   - `setText` auf einen Key, den keine Datei der Einheit mehr hat, ergibt `missing-key` (B5).
>   - Umbenennen in den eigenen Pfad (`A` → `A.B`) ist ein `path-conflict`.
>   - Ein neuer Key ohne Referenztext ergibt `reference-required`, eine Einheit ohne Referenzdatei `no-reference`.
>   - Sprachcodes mit `/`, `\`, `:` oder als `.`/`..` sind ungültig, gleich was das Muster erlaubt.
> - **Review Block A (2.1–2.3), behoben:** 3 schwere und 11 mittlere Befunde sowie die Kleinigkeiten, siehe Regeln oben und die `fix`-Commits vom 24.09.2026. Zusätzlich:
>   - Die Golden-Dateien laufen durch die ganze Operationstabelle von 2.2.
>   - `keyCheck.test.ts` gibt es jetzt.
>   - Der Löschfall `WORKSPACE.FILE.TITLE` ist getestet.
> - **Folgen für 2.4 (aus dem Review), umgesetzt in 2.4:**
>   - Rebase (B5) heißt: `planEdit` mit derselben Änderung (samt `before`) auf den frischen Texten erneut aufrufen. Operationen erneut anzuwenden reicht nicht, weil `set` den Ausgangswert nicht kennt. Der FileStore bekommt deshalb eine Funktion zum Planen statt fertiger `FileChange`s.
>   - Konflikte, die nur der Schreiber sieht (leere Objekte `"X": {}`, Werte wie `"N": 5` am Pfad), werden zum lokalisierten `EditProblem` `not-a-text` mit Datei und Pfad des Werts (auch auf dem Pfad des Keys ist es nie ein Text, den hätte die Planung abgelehnt). `EditError` nennt dafür den Key und den Pfad im Weg (Review-Befund 14).
>   - `create` wird nicht geschrieben, wenn die Datei inzwischen existiert, und jedes Schreibziel muss innerhalb der Wurzel liegen.
> - **Beobachtungen:** Ein veralteter `before`-Wert ergibt keinen Konflikt mehr, wenn der Text schon so lautet wie gewünscht. Extrem tiefe Verschachtelung ergibt auch beim Schreiben `unparsable`. Offen bleibt: 240 `set`-Operationen in einem Aufruf dauern auf 225 KiB etwa 1,2 s, weil nach jeder Operation neu geparst wird (B3). Für das Batch-Schreiben in 3.9 und 4.7 prüfen, ob ein Schnellpfad für `set` nötig ist.
>
> **Umsetzungsnotizen Task 2.4 (25.09.2026):**
> - **Schnittstelle:** `write(root: RootRef, plan: Planner)` statt `write(folder, area, changes, baseRevisions)`. `Planner = (analysis: RootAnalysis) => PlanResult` plant auf dem Index-Stand einer Wurzel, etwa `planEdit(bundle, edit)` oder `planAddLanguage(bundles, area, locale)`.
> - **Ablauf:**
>   - `applyChanges` (Kern) rechnet die neuen Texte im Speicher aus.
>   - Der Store prüft, ob die Dateien auf der Platte noch den geplanten Text haben (dekodiert verglichen). Wenn nicht, indiziert er neu und plant noch einmal, höchstens dreimal.
>   - Danach schreibt er ganz oder gar nicht: Ein Fehler stellt die schon geschriebenen Dateien wieder her.
> - **`WriteResult`:**
>   - `problem` mit `EditProblem` (enthält die Konflikte nach B5);
>   - `dirty` und `changed` mit den Dateien;
>   - `untrusted` (eingeschränkter Modus);
>   - `error` mit Meldung.
>   Die Meldung mit „Datei zeigen“ kommt mit dem ersten Aufrufer (2.12), weil der Store nur Ergebnisse liefert.
> - **Revisionen:** `revisionOf` braucht nur das Undo, um „Datei hat noch den geschriebenen Stand“ zu prüfen, ohne diese Bytes aufzuheben. Undo hält die vorherigen Bytes, höchstens 100 Schreibvorgänge je Sitzung.
> - **Warteschlange:** eine für alle Dateien statt einer je Datei (`simplify:`). Schreibvorgänge sind selten und kurz, und eine Änderung über mehrere Dateien braucht so keine Sperrreihenfolge.
> - **Index:** Nach dem Schreiben wird noch der ganze Index neu aufgebaut; nur die betroffene Wurzel folgt mit 2.15.
> - **Tests:** Die Integrationstests laufen je Profil auf einer frischen Kopie des Fixture-Workspace unter `out/test-workspace/`, damit `test/fixtures` unberührt bleibt. „Ganz oder gar nicht“ ist mit einer schreibgeschützten Datei getestet; ohne das Wiederherstellen schlägt der Test fehl.
>
> **Umsetzungsnotizen Task 2.5 (25.09.2026):**
> - **Wann gesichert wird:**
>   - Der FileStore ruft den Dienst direkt vor dem Schreiben.
>   - Gesichert wird vor dem ersten Schreiben einer Sitzung, vor Änderungen **mehrerer Einheiten** und vor einem Wiederherstellen. Die Einheit jeder Datei bestimmt der Store über das Dateimuster, auch für neue Dateien. Änderungen innerhalb einer Einheit (Key anlegen, umbenennen, löschen) deckt das Undo der Sitzung ab.
>   - Nach `intervalMinutes` sichert das **nächste** Schreiben, statt dass ein Timer läuft. Die Sicherung hält dann genau den Stand vor der Änderung, und im Hintergrund läuft nichts.
>   - Die Sicherung läuft **vor** der Prüfung der Dateien auf der Platte, damit zwischen Prüfen und Schreiben nichts Langsames passiert.
>   - Eine fehlgeschlagene Sicherung wird gemeldet, hält eine Änderung aber nicht auf, weil diese „ganz oder gar nicht“ geschrieben wird und sich rückgängig machen lässt. Ein Wiederherstellen hält sie dagegen auf.
>   - „Jetzt sichern“ läuft über `FileStore.exclusive` zwischen zwei Schreibvorgängen und erwischt so keine halb geschriebene Änderung.
> - **Inhalt und Ablage:**
>   - Gesichert werden alle indizierten Übersetzungsdateien aller Wurzeln.
>   - Ablage: `storageUri/backups/<Zeitstempel>/<Ordnernummer>/<Pfad>` und zuletzt `manifest.json`. Ein Ordner ohne Manifest gilt als abgebrochen und erscheint nicht in der Liste.
>   - Manifeste werden beim Lesen geprüft (Form, Pfade ohne `..`).
> - **Wiederherstellen:**
>   - Nur die Dateien der Sicherung werden wiederhergestellt; neuere Dateien bleiben.
>   - `FileStore.restore` ist ein Schreibvorgang mit denselben Schutzprüfungen (Vertrauen, ungespeicherte Editoren, nur in indizierte Wurzeln) und lässt sich rückgängig machen.
>   - Die wiederhergestellte Sicherung wird beim Aufräumen nie gelöscht, auch wenn sie die älteste ist.
>   - Ordner ohne Manifest (abgebrochene Sicherungen) werden entfernt. Ordner mit einem Manifest, das diese Version nicht versteht, bleiben liegen.
>   - Dateien von Ordnern, die nicht mehr geöffnet sind, bleiben unberührt.
> - **Einstellungen:** `backup.intervalMinutes` und `backup.keep` gelten für das Fenster, nicht je Ordner. `parseBackupSettings` prüft sie wie `parseSettings` die übrigen; ungültige Werte ergeben den Standard, und der Index meldet sie.
> - **Befehle:** „Wiederherstellen“ ist nur in vertrauenswürdigen Arbeitsbereichen aktiv. `writeFeedback.ts` erklärt fehlgeschlagene Schreibvorgänge (mit „Datei anzeigen“ und „Arbeitsbereichsvertrauen verwalten“) für alle Aufrufer.
> - **Nicht automatisch getestet:** Auswahl und Rückfrage des Befehls „Wiederherstellen“, weil sich die Dialoge im Testhost nicht bedienen lassen. Die Schritte darunter sind getestet: Sichern, Lesen, `FileStore.restore` und Undo. Die Dialoge prüft die Abnahme 2.18 von Hand.
>
> **Review Block A, Teil 2 (Tasks 2.4–2.5, 25.09.2026):** drei Reviewer mit frischem Kontext. Ergebnis: 0 kritische, 2 schwere, 15 mittlere Befunde und 10 Kleinigkeiten.
> - **Behoben:**
>   - Das Zurückrollen stellt auch die Datei wieder her, deren Schreiben scheiterte (`writeFile` leert eine Datei vor dem Schreiben). Dateien, die sich nicht wiederherstellen ließen, nennt das Ergebnis (`notRestored`) mit dem Angebot „Aus Sicherung wiederherstellen…“.
>   - Sicherung vor der Plattenprüfung.
>   - Undo bleibt bei Lesefehlern erhalten und ist zusätzlich auf 32 MB begrenzt (`UndoHistory`).
>   - `restore` schreibt nur in indizierte Wurzeln.
>   - Die wiederhergestellte Sicherung wird nicht gelöscht, abgebrochene Sicherungen werden aufgeräumt, und die Kennungen aus derselben Millisekunde sortieren richtig.
>   - Gesichert wird vor Änderungen mehrerer Einheiten statt mehrerer Dateien.
>   - Die Backup-Einstellungen werden für das Fenster gelesen, die übrigen je Ordner; `diagnostics.missing` hat jetzt `scope: resource`. So gibt es keine Warnungen zum Geltungsbereich mehr.
>   - Die Befehle fangen Fehler ab und nennen übersprungene Dateien.
>   - Kern: Ein Wert auf dem Pfad eines Keys ist `not-a-text`; mehrere Änderungen einer Datei werden verkettet (`applyChanges`).
>   - Der Zufallsgenerator im Hash-Test, die Grenzen der Einstellungen im Manifest-Test und die Tests der Schutzprüfungen.
>   - `fileStore.ts` ist aufgeteilt (`UndoHistory`, `putAllOrNone`).
> - **Für 2.15 (aus dem Review):**
>   - Jeder Schreibvorgang indiziert heute zweimal neu: direkt danach und rund 300 ms später über den Watcher. Ein warmer Lauf am echten Repo dauert 244–363 ms; Ziel sind unter 150 ms je Zelle (Design §8).
>   - 2.15 soll nur die betroffene Wurzel neu indizieren und Watcher-Läufe für Dateien überspringen, die noch den eben indizierten Stand haben (Revision je Datei).
>   - Zu prüfen ist, ob `write()` schon nach dem Schreiben zurückkehren darf und der nächste Schreibvorgang auf einen laufenden Lauf wartet.
>   - Die erste Sicherung einer Sitzung verzögert das erste Schreiben (14 Dateien: 70–100 ms).
> - **Für 2.6 und 2.12:**
>   - Leere Zellen ohne Text schicken `before: null`, nicht `''`: `''` gilt als vorhandener leerer Text.
>   - Planer für eine Einheit, die es nicht mehr gibt, brauchen ein eigenes `EditProblem`, statt mit `!` zu scheitern.
>   - Unvollständige Zeichen (einzelne Surrogate) weist schon die Protokollprüfung ab.
> - **Für 2.18 (Abnahme):**
>   - Die Dialoge von „Wiederherstellen“ von Hand prüfen.
>   - Undo ist endgültig: Es gibt kein Wiederholen, und ein Undo wird nicht gesichert.
>   - Rückgängig gemachte neue Dateien hinterlassen bei Mustern mit einem Ordner je Sprache leere Ordner.
>   - Der Test „ganz oder gar nicht“ mit schreibgeschützter Datei schlägt als root (z. B. in einem Dev-Container) fälschlich fehl.
>
> **Umsetzungsnotizen Task 2.6 (25.09.2026):**
> - **Abweichungen von Design §6.12:**
>   - `edit` hat kein `bundleId`: Jedes Panel zeigt genau eine Einheit, der Host kennt sie. Eine Webview kann so nur in ihre eigene Einheit schreiben.
>   - `edit` hat kein `field`: In Phase 2 wird nur der Text bearbeitet. Das Feld kommt mit dem ersten Format, in dem mehrere Felder bearbeitet werden.
>   - `edit` trägt statt `baseRevision` den Text `before`, den die Zelle zeigte (`null`: kein Text). Der FileStore plant damit neu (B5), und ein Konflikt entsteht nur, wenn sich genau diese Zelle geändert hat. Das ViewModel enthält deshalb keine Revisionen; 2.12 schickt nur `before`.
>   - `edit` hat eine `requestId`, die `writeResult` zurückgibt, damit die Zelle bei einem Fehler ihren alten Text zurückbekommt. `writeResult` enthält statt `error: UserError` eine fertig übersetzte `message`.
>   - `command` hat statt `args: unknown` nur `entryId`, den Key, von dem der Befehl ausgeht. Namen und Rückfragen holt der Host selbst über InputBox und Dialoge (2.14).
>   - Neu ist `undo` für `Strg+Z` im Editor außerhalb von Eingabefeldern (Design §6.10).
>   - `init` hat noch keine `settings`, weil die Webview in Phase 2 keine Einstellungen braucht. `patch` kommt mit 2.15 (`src/shared/patch.ts`), `filter` im `UiState` mit 2.9.
> - **Prüfung:** `isWebviewToHost` weist ab: unbekannte Typen, fehlende oder falsch getypte Felder, leere oder zu lange Kennungen (höchstens 200 Zeichen), `entryId`s, die `keyFromId` nicht versteht, Texte über 100.000 Zeichen und einzelne Surrogate (aus dem Review). Verwerfen und Loggen übernimmt der Router in 2.7.
> - **ViewModel:**
>   - Die Sprachen sind zuerst die mit Datei, in der Reihenfolge der Einheit. Danach folgen alphabetisch die Sprachen ohne Datei, auf die Befunde zeigen (fehlende Datei, nötige Variante).
>   - Befunde ohne Key stehen an der Sprache, Befunde ohne Sprache an der Einheit.
>   - Die Meldungen übersetzt der Aufrufer über `localize`.
> - **Schichten:** `src/shared` ist wie `src/core` plattformneutral: kein VS Code, kein Node, kein DOM und keine Importe aus `extension` oder `webview` (ESLint). `src/core` darf `src/shared` nicht importieren. Die Abdeckung zählt `src/shared` mit.
>
> **Umsetzungsnotizen Task 2.7 (25.09.2026):**
> - **Panels:**
>   - `EditorPanels` hält je Einheit ein Panel, erkannt an Ordner-URI und Einheits-ID. Erneutes Öffnen holt es nach vorn.
>   - Ein Klick auf eine Einheit in der Seitenleiste öffnet es (auch mit Enter).
>   - `eduI18n.openBundle` fehlt in der Befehlspalette, weil der Befehl eine Einheit als Argument braucht. Eine Auswahl per QuickPick kann folgen, wenn sie gebraucht wird.
> - **Wiederherstellen:**
>   - Die Webview hebt den `panelState` aus `init` mit `setState` auf. Der Serializer (`onWebviewPanel:eduI18n.editor`) prüft ihn mit `isPanelState` und schließt Panels, deren Zustand er nicht lesen kann.
>   - Gibt es die Einheit nicht (mehr), zeigt das Panel das an (`missing`). War die Einheit gerade zu sehen, wird es auch Screenreadern vorgelesen.
>   - Beim Beenden bleiben die Panels offen, damit VS Code sie wiederherstellt.
> - **Protokoll:** `init` trägt zusätzlich `panelState`; neu ist `missing`. Bis 2.8 schickt der Host den Standard-`UiState`.
> - **Texte:**
>   - Mit `init` schickt der Host seinen ganzen Übersetzungskatalog (`vscode.l10n.bundle`).
>   - Die Webview übersetzt mit einem eigenen `l10n.t`. Der l10n-Test sammelt dessen Texte wie die des Hosts und verlangt deutsche Übersetzungen.
>   - Zahlen formatiert die Webview in der Sprache von VS Code (`<html lang>`).
> - **Sicherheit:**
>   - CSP wie geplant, `localResourceRoots` nur `dist/webview`.
>   - ESLint verbietet in `src/webview` `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML` und `document.write`.
>   - Der Router loggt verworfene Nachrichten nur mit ihrem Typ, nie mit Texten.
> - **Build:**
>   - esbuild baut `dist/webview/main.js` und `main.css` (IIFE, Chromium 122 wie in VS Code 1.90). In Produktion sind das 22,5 KB, mit gzip 8,9 KB.
>   - `tsconfig.webview.json` prüft Webview und Webview-Tests mit DOM und ohne Node-Typen.
>   - `src/webview/css.d.ts` erlaubt CSS-Importe, denn TypeScript 6 prüft auch Importe ohne Namen.
> - **Tests:**
>   - axe läuft in happy-dom. `color-contrast` braucht ein Layout und bleibt dort „unvollständig“; den Kontrast prüft 2.16 in VS Code.
>   - Der Integrationstest beobachtet die Nachrichten über `EditorPanel.onDidPost`. Mit falscher Nonce scheitert er (Gegenprobe), er prüft also den Weg über CSP, Skript und `ready`.
> - **Beobachtungen:**
>   - `npm audit` meldet vier Schwachstellen in `@vscode/test-cli` → `mocha` (`diff`, `serialize-javascript`), nur in den Testwerkzeugen. Die Laufzeitabhängigkeiten sind ohne Befund.
>   - Für 2.18: Der Status im README („Phase 1 folgt“) ist veraltet.
>
> **Umsetzungsnotizen Task 2.8 (25.09.2026):**
> - **Sprach-Chips:**
>   - Die Chips sind native Checkboxen in einer `fieldset` „Sprachen“ statt Knöpfen mit `aria-pressed`. Das bringt native Semantik, einen Zustand, der ohne Farbe sichtbar ist (Haken), und Bedienung mit der Leertaste ohne eigenen Code.
>   - Der Name nennt Code, Referenz oder Variante und die Zähler, etwa „fr fehlend: 2 Befunde: 6“. Zähler erscheinen nur über 0, als „Bezeichnung: Zahl“, damit keine Pluralformen nötig sind.
> - **Ansicht und Umbruch:** Die Ansicht ist eine Radiogruppe (Automatisch, Tabelle, Liste; Pfeiltasten wie gewohnt), der Umbruch eine Checkbox „Lange Texte umbrechen“. Sichtbar wirken beide erst mit Tabelle und Liste (2.10, 2.11).
> - **Ansichtszustand (B7):**
>   - Die Webview schickt jede Änderung als `uiState`. Der Host legt ihn je Einheit im `workspaceState` ab (Schlüssel aus Ordner-URI und Einheits-ID) und schickt ihn mit `init`.
>   - Einen Zustand, den `isUiState` nicht versteht (etwa aus einer älteren Version), ersetzt der Standard.
> - **Rückgängig:**
>   - Die Schaltfläche „Letzte Änderung rückgängig machen“, `Strg+Z` bzw. `Cmd+Z` außerhalb von Textfeldern und der Befehl `eduI18n.undoLastChange` (Design §10) rufen dieselbe Funktion.
>   - Das Undo gilt für die ganze Sitzung, nicht nur für die angezeigte Einheit. Der Host meldet jedes Ergebnis, auch „Es gibt keine Änderung, die sich rückgängig machen lässt.“
> - **Suche (`Strg+F`)** kommt mit dem Filter in 2.9, weil sie dessen Texteingabe ist.
> - **Scroll-Anker:**
>   - Er ist eine reine Funktion (`captureAnchor`, `anchoredScrollTop`). Anker ist die erste Zeile, deren Oberkante mit dem Key im Blick ist; füllt eine Zeile den ganzen Blick, ist es diese.
>   - Angewandt wird er in 2.10 und 2.11, wenn es Zeilen gibt.
> - **Darstellung:**
>   - Native Bedienelemente folgen per `color-scheme` der Theme-Klasse von VS Code.
>   - Den Fokusrahmen trägt das ganze Label, denn innen an einem 13-px-Feld wäre er kaum sichtbar.
>   - Sichtprüfung in einer lokalen Vorschau (echtes Bundle, nachgebildete API, Theme-Variablen für hell, dunkel und hohen Kontrast) bei 350 und 640 px, dazu Tastaturbedienung in Chromium. Seitdem brechen Codes und Zähler nicht mehr mitten im Wort um.
>   - Die Kontraste mit den echten Theme-Farben prüft 2.16.
> - **Tests:** Die Webview-Tests nutzen den echten deutschen Katalog (`test/unit/webview/support.tsx`).
> - **Für 2.14:** Design §10 sieht `eduI18n.openEditor` mit Auswahl der Einheit in der Befehlspalette vor. Bisher öffnet nur die Seitenleiste den Editor.
>
> **Umsetzungsnotizen Task 2.9 (25.09.2026):**
> - **`filterRows(model, filter, hiddenLocales)`** (`src/shared/filter.ts`):
>   - Gesucht wird in Keys und Texten, nur in Keys oder nur in Texten. Texte heißt: die der sichtbaren Sprachen oder die einer gewählten Sprache, auch wenn diese ausgeblendet ist.
>   - Als Text oder als regulärer Ausdruck (Flag `u`, ohne Groß-/Kleinschreibung zusätzlich `i`). Ein ungültiger Ausdruck filtert nicht; `invalidPattern` nennt den Grund der JavaScript-Engine (englisch).
>   - Status „fehlend“ heißt `missing-key` in einer sichtbaren vollen Sprache, wie bei den Zählern der Chips. Sprachen ohne Datei zeigen `missing-file` am Chip.
>   - „Befunde“ heißt ein Befund in einer sichtbaren Zelle, „leer“ ein leerer Text in einer sichtbaren Sprache.
> - **Ansichtszustand:**
>   - Der Filter gehört zum Ansichtszustand (B7) und wird mit ihm gespeichert. `isUiState` prüft ihn; die Suche hat höchstens 1.000 Zeichen, und das Eingabefeld begrenzt sie ebenso.
>   - Zustände aus 2.8 ohne Filter ersetzt der Standard.
> - **Filterleiste:**
>   - Sie ist ein `role="search"`. Das `<search>`-Element kennen die Testbibliothek und ältere Hilfsmittel nicht.
>   - Enthalten sind ein beschriftetes Suchfeld, „Suchen in“, „Regulärer Ausdruck“, „Groß-/Kleinschreibung beachten“ und „Zeigen“.
>   - Darunter steht eine Statuszeile (`role="status"`): „3 von 14 Keys“ oder der Grund, warum der Ausdruck ungültig ist. Das Feld ist dann `aria-invalid` und verweist mit `aria-describedby` auf diese Zeile.
> - **Tasten:**
>   - `Strg+F` bzw. `Cmd+F` setzt den Cursor in die Suche, auch aus Textfeldern.
>   - `Alt+M` schaltet zwischen „fehlend“ und „alle“. Am Mac geht das nicht, weil die Taste nach `key` erkannt wird und Option+M dort „µ“ tippt.
> - **Rahmen:** Suchfeld und Auswahllisten nehmen `dropdown.border`, wenn das Theme `input.border` nicht setzt (etwa Light+). Sonst stünde ein weißes Feld auf Weiß (in der Vorschau gefunden).
> - **Anzeige:** Die gefilterten Zeilen zeigt ab 2.10 die Tabelle, bis dahin nur ihre Zahl.
>
> **Umsetzungsnotizen Task 2.10 (25.09.2026):**
> - **Aufbau:**
>   - Die Zeilen sind `div`s mit eigenem CSS-Grid und gemeinsamer Spaltenvorlage (`--columns`), keine `<table>`: `content-visibility: auto` wirkt nicht auf Tabellenzeilen.
>   - Die Rollen stehen ausdrücklich da (`grid`, `rowgroup`, `row`, `columnheader`, `rowheader`, `gridcell`). `aria-rowcount` und `aria-colcount` zählen alle Zeilen, auch die noch nicht gerenderten. Den Namen gibt die Überschrift (`aria-labelledby`).
> - **Tastatur:**
>   - `moveInGrid` ist eine reine Funktion nach dem Datengrid der APG; die Kopfzeile gehört zur Navigation. Es gibt eine Tab-Station (roving `tabindex`).
>   - Die aktive Zelle merkt sich Key und Sprache statt Indizes. So bleibt sie auf ihrem Key, wenn Filter oder Index-Läufe Zeilen verschieben.
>   - Verschwindet ihr Key, rückt sie auf die erste Zelle. Der Fokus folgt, wenn er in der Tabelle war, aber nicht nach einem Klick daneben.
> - **Status:**
>   - Jeder Befund zeigt ein Symbol je Schwere (farbig, `aria-hidden`) und ein Wort je Regel („fehlt“, „leer“, „Platzhalter“ …). Ein Test verlangt für jede Regel, die einzelne Texte betrifft, ein eigenes Wort.
>   - Die ganze Meldung beschreibt die Zelle über `aria-describedby`. Die Beschreibungstexte liegen `hidden` in der Zeile, damit sie nicht zum Namen der Zelle gehören.
>   - Texte tragen `lang` und `dir="auto"`.
> - **Scrollen:** Die Tabelle scrollt in einem eigenen Bereich über die restliche Höhe (mindestens 12em). Kopfzeile und Key-Spalte sind `sticky`, und `scroll-padding` hält die fokussierte Zelle frei (WCAG 2.4.11, in Chromium geprüft).
> - **Rendern:**
>   - Zuerst kommen 200 Zeilen, dann 200 je Task; die Zahl wächst nur. Tastensprünge rendern bis zur Zielzeile.
>   - 420 Zeilen × 6 Sprachen laufen in der Vorschau flüssig. Die Messung mit 2.000 Keys folgt in 2.17.
>   - Das Bundle hat 35,9 KB (gzip 13,4 KB).
> - **Scroll-Anker angewandt:**
>   - Beim Ein- und Ausblenden einer Sprache und beim Umbruch nimmt ein Signal-`effect` den Anker, solange noch das alte Layout steht. `useSignalEffect` taugt dafür nicht: Es läuft erst im nächsten Frame, dann ist es zu spät (im Test gefunden).
>   - Angewandt wird der Anker nach dem Rendern und noch einmal im nächsten Frame, weil `content-visibility` Zeilen nahe der Sicht erst dann neu legt. Die Höhe der Kopfzeile wird dabei abgezogen (ebenfalls im Test gefunden).
>   - Die Wirkung in echter Darstellung prüft 2.16 in VS Code. Im ausgeblendeten Browser-Bereich rendert Chromium nicht.
> - **Bis 2.11** zeigt jede Ansicht die Tabelle.
> - **Beobachtung für 2.11 und 2.16:** Bei 560 px Höhe nehmen Werkzeugleiste, Chips und Filter drei Viertel ein, und die Tabelle behält nur ihre Mindesthöhe. Der Kopfbereich sollte kompakter werden, etwa mit Rückgängig in der Werkzeugzeile und einer kleineren Überschrift.
>
> **Umsetzungsnotizen Task 2.11 (25.09.2026):**
> - **Umschaltung:**
>   - `layoutFor(Wahl, Breite)` ist eine reine Funktion. Automatisch gilt: ab 900 px Tabelle, von 481 bis 899 px Liste, bis 480 px die kompakte Liste.
>   - Eine selbst gewählte Ansicht gilt bei jeder Breite. „Liste“ zeigt dann auch schmal alle sichtbaren Sprachen.
>   - Die Breite kommt aus `window.innerWidth` und dem Ereignis `resize`.
> - **Liste:**
>   - Ein `<ol>`, benannt von der Überschrift, enthält eine Karte je Key: `<h2>` mit dem Key und ein `<dl>` mit der Sprache (samt Referenz- oder Variantenmarke) und ihrem Text.
>   - Befunde stehen sichtbar da, als Symbol und ganze Meldung.
>   - Unter 480 px steht die Sprache über ihrem Text. Schrittweises Rendern und `content-visibility` wie in der Tabelle.
> - **Kompakt:**
>   - Die kompakte Liste zeigt die Referenz und eine Sprache. Ohne Wahl ist es die erste sichtbare volle Sprache, denn eine Variante überlässt die meisten Texte ihrer Basis.
>   - Die Auswahl „Zweite Sprache“ speichert die Wahl als `compactLocale` im Ansichtszustand.
> - **Scrollen:** In der Liste scrollt die ganze Seite; ein Scrollbereich passt zu schmalen Editoren besser als zwei. Der Scroll-Anker arbeitet dort mit `document.scrollingElement`.
> - **Gemeinsam genutzt:**
>   - Statussymbole, schrittweises Rendern, Scroll-Anker und die Sprachbeschriftung liegen jetzt in `components/` statt in `table/`.
>   - `data-entry` trägt die Kennung des Keys kodiert (`encodeURIComponent`). Mit den Anführungszeichen des JSON scheiterte axe unter happy-dom beim Bauen von Selektoren.
> - **In Chromium geprüft (Vorschau):** Bei 320 px scrollt nichts waagerecht, weder kompakt noch mit allen sechs Sprachen, und kein Element ragt über den Rand.
>
> **Review Block B (Tasks 2.6–2.11, 26.09.2026):** vier Prüfer mit frischem Kontext (Host und Vertrauensgrenze, Zustand und Bedienelemente, Tabelle und Liste, Barrierefreiheit nach WCAG 2.2 AA), zwei davon mit Messungen in Chromium. Zusammengeführt: 0 kritische, 9 schwere Befunde, dazu rund 25 kleinere und einige Kleinigkeiten.
> - **Behoben (schwer):**
>   - Die Tabelle war so breit wie ihr längster Text, sodass lange Texte weder abgeschnitten noch umbrochen wurden. Jetzt sind die Spalten 208 statt 1.291 px breit, gemessen.
>   - Jede Pfeiltaste renderte alle Zeilen neu: 59 ms bei 2.000 × 6, jetzt etwa 3 ms. Zeilen und Kopfzeile werden memoisiert, und die Sprachliste bleibt stabil.
>   - Ohne Chromiums Scroll-Anker sprang der Inhalt beim Hochscrollen, wenn Zeilen ihre echte Höhe bekamen.
>   - Ein Filterwechsel konnte die aktive Zeile hinter die gerenderten schieben. Danach holte sich die Tabelle den Fokus auch aus dem Suchfeld zurück.
>   - Verschwand das Grid (kein Treffer, Wechsel zur Liste), fiel der Fokus auf `<body>`.
>   - Strg+Z löste zusätzlich VS Codes eigenes Undo aus, das die Sucheingabe zurücknahm.
>   - Ein regulärer Ausdruck wurde gespeichert, bevor er lief. Einer, der nie endet, hätte jedes Öffnen blockiert.
>   - `<html lang>` nannte die Sprache von VS Code auch dann, wenn die Texte englisch sind.
>   - Befunde zu Keys ohne Zeile (doppelt definiertes Objekt, Zahl) erschienen nirgends.
> - **Behoben (klein):**
>   - Gespeicherte Zustände enthalten nur bekannte Felder.
>   - `before` darf ein abgeschnittenes Zeichen enthalten.
>   - Ein wiederhergestelltes Doppel eines offenen Editors wird geschlossen.
>   - `eduI18n.openBundle` gibt nichts zurück; bisher ging sein Ergebnis bei jedem Klick an die Workbench. Das Kontextmenü „Öffnen“ ist neu.
>   - Rückgängig nennt die Dateien und meldet ehrlich, wenn eine Änderung nicht mehr zurückzunehmen ist.
>   - Tastenkürzel greifen auch mit nicht lateinischer Tastaturbelegung, und vor `init` ändert sich kein Zustand.
>   - Die Breite liegt im Store. Die Zeilen rendern nur bei einem Wechsel des Layouts neu, und der Filter sieht genau die gezeigten Sprachen, auch kompakt.
>   - Eine verschwundene Sprache im Filter zählt als keine.
>   - Alt+↓/↑ springt zum nächsten offenen Punkt (Design §7.2). Die Leertaste scrollt nicht mehr, und die Kopfzeile nutzt die UI-Schrift.
>   - Barrierefreiheit:
>     - weitere Befunde unter den Chips und „keine Datei“ am Chip;
>     - die Trefferzahl wird nach einer Tipp-Pause angesagt;
>     - die Fehlermeldung steht in Textfarbe mit rotem Symbol;
>     - Schwere in Worten, Marken für „kein Text“ und „leerer Text“, gültige BCP-47-Tags;
>     - Sprunglinks zu Suche und Tabelle, die Legende „Angezeigte Sprachen“.
>   - Die axe-Prüfung der Tests scheitert auch an unentschiedenen Ergebnissen (außer dem Kontrast, der Layout braucht).
> - **Für 2.12:** Eine ungültige `edit`-Nachricht mit lesbarer `requestId` soll mit `writeResult { ok: false }` beantwortet werden, sonst wartet die Zelle vergeblich.
> - **Für 2.16 (Sichtprüfung, NVDA):**
>   - Die Rahmen von Suchfeld und Auswahllisten erreichen in den Standard-Themes keine 3:1; VS Codes eigene Felder sehen genauso aus. Entscheiden, ob das so bleibt.
>   - Bei geringer Höhe (etwa 200 % Zoom) scrollen Seite und Tabelle ineinander. Das gehört zum kompakteren Kopfbereich.
>   - Ansage, wenn eine Einheit nach dem Laden erscheint; Zebrastreifen für breite Tabellen; Aussehen der Rückgängig-Schaltfläche in Dark Modern.
>   - Eine Layout-Prüfung in echtem Chromium gibt es in der CI nicht. Die Vorschau im Scratchpad ersetzt sie bis dahin.
> - **Bewusst offen:**
>   - Ein katastrophaler regulärer Ausdruck hält die Webview beim Tippen weiterhin auf, wird aber nicht mehr gespeichert. Vollen Schutz gäbe erst ein Worker mit Zeitlimit.
>   - Texte nur aus Leerzeichen bekommen keine eigene Marke.
>   - Statt Codicons (B6) stehen Unicode-Symbole; Codicons kommen mit dem ersten echten Symbol.
>
> **Umsetzungsnotizen Task 2.12 (26.09.2026):**
> - **Host (`editHandler.ts`):**
>   - `edit` plant mit dem Text, den die Zelle zeigte (B5), und schreibt über den FileStore (B1). Bei einem Fehler trägt `writeResult` die fertig übersetzte Meldung (`describeWriteFailure`, dieselbe wie in der Benachrichtigung).
>   - Probleme der Planung (Konflikt, leere Referenz, fehlender Key …) meldet nur die Zelle. Was einen Schritt des Nutzers braucht (Datei speichern, Vertrauen), meldet zusätzlich eine Benachrichtigung mit Aktion.
>   - Leeren löscht den Text (B2); vorher fragt ein modaler Dialog. Wer ablehnt, bekommt `ok: false` ohne Meldung, und die Zelle zeigt still wieder den alten Text.
>   - Eine verschwundene Einheit ist ein eigenes Problem (`missing-bundle`). Eine unlesbare `edit`-Nachricht mit lesbarer `requestId` wird mit `ok: false` beantwortet.
> - **Webview:**
>   - Tasten nach §7.2:
>     - Öffnen: Enter, F2 oder Doppelklick in der Tabelle, Klick auf den Text in der Liste.
>     - Speichern: Enter bei einem einzeiligen Text, Strg+Enter bei einem mehrzeiligen. Das wird beim Öffnen festgelegt; Umschalt+Enter beginnt eine neue Zeile.
>     - Tab und Umschalt+Tab speichern und öffnen die nächste bzw. vorige Zelle in Lesereihenfolge. Esc bricht ab.
>     - Während eine Eingabemethode komponiert, speichert Enter nicht.
>   - Verlassen des Feldes speichert. Nimmt VS Code der Seite den Fokus, bleibt das Feld aktives Element und offen.
>   - Das Feld wächst mit und scrollt nie. Darunter stehen die Prüfung (`compareParams`/`compareTags`, als Status für Screenreader) und die Tasten.
>   - Ein gesendeter Text ersetzt die Zelle ohne die alten Befunde, bis das Modell ihn hat, gleich ob `bundle` oder `writeResult` zuerst kommt. „Gespeichert.“ wird angesagt (§7.4).
>   - Scheitert das Schreiben:
>     - Der alte Text kommt zurück, die Zelle zeigt „✖ nicht gespeichert“ mit der Meldung, und eine Ansage folgt.
>     - Enter öffnet den Editor wieder mit dem getippten Text; Esc verwirft ihn.
>   - In der Liste ist der Text jedes Feldes eine Schaltfläche, benannt nach Sprache und Text.
>   - Eine Änderung der Ansicht (Filter, Sprachen) speichert den offenen Editor zuerst. Beim Wechsel zwischen Tabelle und Liste bleibt der Editor mit seinem Text offen.
> - **Fokus:**
>   - Verschwindet die aktive Zeile, etwa im Filter „fehlend“, sobald ihr Text da ist, bleibt das Grid an seiner Stelle, und die nachrückende Zeile bekommt den Fokus. Die Liste macht es mit der nachrückenden Karte ebenso.
>   - Enter öffnet die Zelle, in der die Taste gedrückt wurde, auch wenn das Grid den Fokus noch nicht übernommen hat (in Chromium gefunden).
> - **In Chromium geprüft (Vorschau):**
>   - Das Feld wächst von einer Zeile (23 px) auf 108 px bei langem Text, ohne zu scrollen. Prüfung und Hinweis stehen darunter, und nach einem Fehler steht die Markierung in der Zelle.
>   - Im ausgeblendeten Browser-Bereich feuern keine Fokusereignisse. Die Rückkehr des Fokus decken deshalb die Komponententests ab.
> - **Für 2.16 (Sichtprüfung):**
>   - Im einzeiligen Modus verdrängen zwei Statusmarken (z. B. „nicht gespeichert“ und „Platzhalter“) den Text einer schmalen Spalte ganz.
>   - In VS Code prüfen: die Rückkehr des Fokus nach Enter und Esc, das Feld in High Contrast und die Rückfrage beim Leeren.
> - **Bewusst offen:**
>   - Tippen auf einer Zelle öffnet keinen Editor; das tun nur Enter, F2 und Doppelklick.
>   - Die Prüfung beim Tippen nutzt die Standardschwere der Regeln, nicht `checks.severity`.
>   - Ein leerer Text, der den Rückfall verdeckt (`empty-value`), lässt sich im Editor nicht löschen, denn ohne Änderung wird nichts gesendet. Die Lösung kommt mit den Details (2.13).
>   - Eine gespeicherte Zeile, die nicht mehr zum Filter passt, verschwindet, sobald das Modell kommt (etwa 300 ms). Die Alternative wäre, solche Zeilen bis zum nächsten Filterwechsel stehen zu lassen.
>
> **Umsetzungsnotizen Task 2.13 (26.09.2026):**
> - **Platz:**
>   - Die Leiste gehört zur Tabelle. Ab 1200 px Breite steht sie rechts (22em, eigener Scrollbereich), darunter unter der Tabelle mit höchstens 40 % der Höhe.
>   - Der Schalter „Details anzeigen“ in der Werkzeugleiste blendet sie aus. Er gehört zum Ansichtszustand je Einheit (`details` im `UiState`, B7); gespeicherte Zustände ohne das Feld gelten als veraltet.
>   - In der Liste sind die Karten selbst die Details: Sie zeigen dieselben Felder mit Befund, Hinweis und Löschaktion. Ausgeblendete Sprachen bleiben dort ausgeblendet.
> - **Inhalt:**
>   - Die Leiste folgt der aktiven Zelle der Tabelle und behält ihren Key in der Kopfzeile. Lässt der Filter keinen Key durch, sagt sie, dass keiner gewählt ist.
>   - Sie zeigt alle Sprachen des Keys, auch ausgeblendete. Jeder Text ist eine Schaltfläche, die den Editor an Ort und Stelle öffnet. Tab geht dort die Sprachen des Keys entlang und endet bei der letzten.
>   - Zu jedem Befund stehen die Meldung als Erklärung und ein Lösungshinweis je Regel (`findingHints.ts`); ein Test verlangt einen Hinweis für jede Regel, die eine Zelle zeigen kann.
>   - Ein leerer Text (`empty-value`) bekommt „Text löschen“. Der Host fragt nach und löscht den Key in dieser Sprache (B2). Damit ist die offene Stelle aus 2.12 gelöst.
> - **Umbau:** Das Feld der Listenkarten ist jetzt ein eigenes Bauteil (`field.tsx`, `field.css`) für Liste und Details. Der offene Editor weiß, wo er steht (`place`: Zeilen oder Details), damit er nur an einer Stelle erscheint.
> - **In Chromium geprüft (Vorschau):**
>   - Bei 1300 px steht die Leiste rechts (299 px, so hoch wie die Tabelle).
>   - Bei 1000 px steht sie unter der Tabelle (168 px mit eigenem Scrollbereich; die Tabelle behält 210 px).
>   - In beiden Fällen gibt es weder Seiten- noch Querscrollen.
> - **Für 2.16:** Bei 720 px Höhe bleiben der Tabelle mit Leiste darunter nur sechs Zeilen. Das gehört zum kompakteren Kopfbereich.
> - **Bewusst offen:** Eine Leiste für die Liste (etwa unten angedockt) kommt erst, wenn Phase 7 Inhalte bringt, die in keine Karte passen (Kontext, Review, Vorschläge).
>
> **Umsetzungsnotizen Task 2.14 (26.09.2026):**
> - **Keys tippen:** Punkte trennen die Teile eines Keys. Ein Punkt innerhalb eines Teils wird als `\.` geschrieben, ein Backslash als `\\` (`parseKeyInput`/`keyInput`). So bleibt `CCMAIL` › `mail.smtp.server` beim Umbenennen heil; die Eingabe zeigt den alten Namen in dieser Form vor. Für `.properties` (Phase 5), deren Keys flach sind, braucht es eine eigene Regel.
> - **Befehle:**
>   - Key hinzufügen fragt nach dem Key und seinem Referenztext; beides wird beim Tippen geprüft (`checkNewKey`). Gibt es den obersten Key auch in einer anderen Einheit der Wurzel, fragt ein modaler Dialog, weil er sie zur Laufzeit ersetzen würde.
>   - Umbenennen und Löschen fragen, ob nur diese Einheit oder alle Einheiten mit dem Key geändert werden, und nennen sie. Löschen in einer Einheit wird bestätigt. Mehrere Einheiten plant `planInBundles` als eine Änderung, ganz oder gar nicht; das Backup davor legt der FileStore an.
>   - Sprache hinzufügen legt in jeder Einheit der Wurzel eine leere Datei an; der Code wird beim Tippen gegen das Muster des Bereichs geprüft.
>   - „Übersetzungseditor öffnen…“ wählt eine Einheit aus allen Wurzeln.
>   - Schreibende Befehle sind nur in vertrauenswürdigen Arbeitsbereichen aktiv (`enablement`).
> - **Wo:**
>   - Seitenleiste: Key hinzufügen an Einheiten, Sprache hinzufügen an Wurzeln und Einheiten.
>   - Titelleiste des Editors: Key und Sprache hinzufügen.
>   - Kontextmenü des Editors (`webview/context`): Zeilen und Karten tragen ihren Key (`data-vscode-context`), dazu Sprache hinzufügen.
>   - Im Editor: Schaltflächen für Key und Sprache, F2 (umbenennen) und Entf (löschen) in der Key-Spalte.
>   - Palette: alles außer Umbenennen und Löschen, die einen Key brauchen.
> - **Vertrauensgrenze:** Das Argument eines Menüs, auch das aus der Webview, wählt nur über Kennungen unter dem aus, was der Index hat. Ein Key, den die Einheit nicht hat, zählt als keiner.
> - **Tests:** Die Rückfragen stehen hinter einer Schnittstelle (`Prompts`); die Integrationstests beantworten sie. Geprüft ist:
>   - `es` legt vier Dateien `{}` an, und Undo entfernt sie.
>   - Umbenennen wirkt in allen Einheiten oder nur in dieser.
>   - Abbrechen bei jeder Frage schreibt nichts.
>   - Ein neuer Key steht hinter seinem Vorgänger, und die Rückfrage beim geteilten obersten Key kommt.
>   - Löschen und die Wahl des Ziels funktionieren.
> - **Für 2.18 (Abnahme, von Hand):** die Dialoge der vier Befehle, das Kontextmenü im Editor und die Titelleiste.
>
> **Umsetzungsnotizen Task 2.15 (26.09.2026):**
> - **Index je Wurzel:**
>   - `refreshRoot(ref)` liest und prüft nur eine Wurzel, ohne die Suche nach Wurzeln, die den größten Teil eines Laufs ausmacht. Es läuft nach Schreiben, Undo und Wiederherstellen (für die Wurzeln der betroffenen Dateien) und für den Watcher einer Wurzel.
>   - Volle Läufe bleiben für Einstellungen, Ordner, Vertrauen, Marker-Dateien und „Prüfen“. Die erkannten Wurzeln hält der Snapshot bis zum nächsten vollen Lauf.
>   - Ein Lauf auf Dateien, die die Revisionen des letzten haben, tut nichts. So analysiert und meldet der Watcher-Lauf nach einem Schreiben nicht mehr ein zweites Mal (Gegenprobe: ohne das Überspringen schlagen beide neuen Tests fehl).
>   - Alle Läufe, voll oder je Wurzel, laufen nacheinander. Die Lesefehler stehen je Wurzel, damit ein Lauf nur seine eigenen ersetzt.
>   - `RootRef` gehört jetzt zum Index; Suchen, Auflisten und Lesen stehen in `rootFiles.ts`.
> - **Patch:**
>   - Hat die Webview ein Modell, schickt der Host nach jedem Lauf nur die neuen oder geänderten Zeilen (`src/shared/patch.ts`). Reihenfolge, Sprachen und Befunde der Einheit kommen nur mit, wenn sie sich änderten; betraf der Lauf eine andere Einheit, kommt nichts.
>   - Die Webview behält alle anderen Zeilen als dieselben Objekte, deshalb rendert eine geänderte Zelle eine Zeile neu, und Fokus und Scrollposition bleiben.
>   - Nach `ready` oder `missing` kommt wieder das ganze Modell.
> - **Konflikt** (Stand 2.15; die Bedienung hat das Review von Block C geändert, siehe dort):
>   - Ändert sich der Text der gerade bearbeiteten Zelle außerhalb des Editors, bleibt der Entwurf. Das Feld zeigt den neuen Text (in seiner Sprache) mit „Übernehmen“ und „Meinen behalten“, und eine Ansage folgt. Kehrt der Text zum Ausgangstext zurück, verschwindet der Konflikt.
>   - Im Konflikt führt Tab zu den beiden Schaltflächen, statt zu speichern.
>   - Enter speichert gegen den alten Stand. Der Host lehnt das ab (B5), und der Entwurf bleibt als „nicht gespeichert“ erhalten, statt ungefragt zu überschreiben.
> - **Für das Review von Block C:** `workspaceIndex.ts` hat 361 Zeilen (über der Marke von 300), bleibt aber bei einer Aufgabe; `fileStore.ts` hatte schon vorher 360.
>
> **Umsetzungsnotizen Task 2.16 (26.09.2026):** Siehe [`../verification/phase-2-a11y.md`](../verification/phase-2-a11y.md).
> - Tastatur-Durchlauf als Test (`keyboardWalk.test.tsx`), axe in jeder Komponententest-Datei, Kontraste von sechs Themes berechnet, Kontrastthemes in Chromium geprüft.
> - Behoben:
>   - Die Einheit wird nach dem Laden angesagt.
>   - Der Fokus von Feldern liegt außen (in dunklen Themes sonst unter 3:1).
>   - Mehrere Statusmarken brechen unter den Text um, statt ihn zu verdrängen.
>   - Der Kopfbereich ist kompakter (bei 720 px Höhe 237 statt 188 px für die Tabelle).
> - Offen für die Abnahme: NVDA und die Sichtprüfung in VS Code (Checkliste im Protokoll).
>
> **Umsetzungsnotizen Task 2.17 (26.09.2026):**
> - **Gemessen mit echten Dateien:** eine Kopie der Übersetzungsdateien des Clones in `out/perf-workspace` (87 Dateien, `common` mit 1.440 Keys × 6 Sprachen); der Clone wurde nur gelesen. Die Messung läuft nur auf Anfrage: `EDU_I18N_PERF=1 npx vscode-test --label perf`, sonst wird sie übersprungen.
>
>   | Messung (VS Code 1.139, Host) | Wert | Ziel (Design §8) |
>   |---|--:|---|
>   | voller Index, warm | 212–222 ms | < 1,5 s |
>   | Wurzel neu, Dateien unverändert | 97–107 ms | – |
>   | Modell von `common` bauen / Patch berechnen | 6–8 ms / 4–6 ms | – |
>   | Editor öffnen, bis das Modell gesendet ist | 208–266 ms | < 1 s |
>   | Zelle speichern, bis die Antwort kommt | 28–42 ms | < 150 ms |
>   | … bis die Befunde da sind (Patch) | 196–198 ms | – |
>   | erstes Speichern einer Sitzung (mit Sicherung aller 87 Dateien) | 362–492 ms | – |
>
> - **In Chromium (echtes Webview-Bundle, 2.002 Keys × 6 Sprachen):**
>   - Der erste Aufbau dauert 30–50 ms, weil zuerst 200 Zeilen und dann 200 je Task kommen.
>   - Sind alle Zeilen da, braucht eine Pfeiltaste 3,6–7,1 ms und ein Tastendruck im Editor 2,7–5,7 ms.
> - **Behoben:**
>   - Ein Patch renderte alle gerenderten Zeilen neu statt einer: Jedes neue Modell brachte eine neue Liste der Sprachen, auch wenn sich nur Zählerstände änderten. Die Liste bleibt jetzt dieselbe, solange die Spalten gleich sind.
>   - Ein Schreibvorgang antwortete erst nach der Neuindizierung (185 ms). Jetzt antwortet er nach dem Schreiben; die Befunde folgen, und der nächste Auftrag des FileStores wartet auf den frischen Index (`indexed()` für Tests).
> - **Tests gegen Rückschritte** (`performance.test.tsx`): Der Test zählt, was gerendert wird, statt Zeiten zu messen, die in der CI schwanken. Beim ersten Aufbau sind es 200 Zeilen, eine Pfeiltaste rendert zwei Zeilen, ein Patch eine, und Tippen rendert keine.
> - **Log:** Jeder Schreibvorgang nennt seine Dauer, jeder Lauf des Index die seine. Auf Debug-Stufe nennt das Panel die Dauer von Modell und Patch.
> - **Bewusst offen:**
>   - Die erste Sicherung einer Sitzung kostet 330–450 ms beim ersten Speichern. Sie früher anzustoßen (etwa beim Öffnen des Editors) würde Sitzungen ohne Änderung sichern und ältere Sicherungen verdrängen.
>   - Die Befunde brauchen nach dem Speichern rund 200 ms, fast alles davon für Auflisten, Lesen und Prüfen der Wurzel. Nur geänderte Dateien neu zu lesen wäre der nächste Schritt.
>
> **Review Block C (Tasks 2.12–2.17, 26.09.2026):** vier Prüfer mit frischem Kontext (Host, Zustand der Webview, Editor mit Tabelle und Liste, Barrierefreiheit nach WCAG 2.2 AA). Ihre Berichte zusammen: 0 kritische, 8 schwere und 32 kleinere Befunde sowie 23 Kleinigkeiten, einige davon doppelt.
> - **Behoben (schwer):**
>   - Der Watcher der Marker-Dateien reagierte auf Inhaltsänderungen. Weil `common/de.json` der Marker von Angular ist, suchte jede deutsche Änderung in `common` alle Wurzeln neu. Jetzt nur noch, wenn eine Marker-Datei kommt oder geht.
>   - Verließ die Zeile des offenen Editors den Filter (etwa „fehlend“, sobald ihr Text geschrieben war), verschwand der Editor mitsamt dem getippten Text. Die Zeile bleibt jetzt, solange ihr Editor offen ist, und die Details bleiben beim Key ihres Editors.
>   - Blendete ein Layout die Sprache des offenen Editors aus (kompakte Liste), blieb ein unsichtbarer Editor offen. Jetzt bleibt ein getippter Text als „nicht gespeichert“ in seiner Zelle, und eine Ansage folgt. Ohne getippten Text schließt der Editor still.
>   - Scheiterte ein Text, während seine Zelle schon wieder bearbeitet wurde, stand die Meldung neben einem Editor, der davon nichts wusste. Jetzt geht sie in diesen Editor, und er speichert gegen den Text der Datei. Das Scheitern eines Textes, den ein neuerer derselben Zelle ersetzt hat, zählt nicht mehr.
>   - Im Konflikt speicherte Enter gegen den alten Stand, und der Host lehnte ab. Jetzt gilt:
>     - Enter und Tab führen zur Wahl („Neuen Text übernehmen“, „Meinen Text behalten“), Esc verwirft den Entwurf.
>     - Wer den Editor verlässt, behält einen getippten Entwurf als „nicht gespeichert“; das nächste Öffnen bietet dieselbe Wahl, bis der Nutzer sie trifft.
>     - Lehnt der Host einen Text als zwischenzeitlich geändert ab (`writeResult.conflict`), gilt dasselbe.
>     - Solange eigene Texte der Zelle unterwegs sind, ist ein älteres Modell kein Konflikt.
>   - Nach „Text löschen“ fiel der Fokus auf `<body>`. Er bleibt jetzt auf dem Text des Feldes, auch wenn der Nutzer die Rückfrage ablehnt.
>   - Die Übergabe des Fokus zwischen Tabelle und Liste scheiterte hinter den ersten 200 gerenderten Zeilen und nach einer verschwundenen aktiven Zeile. Jetzt gilt:
>     - Die neue Ansicht rendert bis zum übergebenen Key und fokussiert dieselbe Sprache.
>     - Die Tabelle übergibt den Key an der aktiven Position, also den nachgerückten.
>     - Einmal gebrauchte Zeilen bleiben gerendert, sodass der Text eines gerade geschlossenen Editors den Fokus zurückbekommt.
> - **Behoben (klein):**
>   - Host (Commit `5708873`):
>     - Vertrauen wird vor jeder Frage geprüft, und nur das Löschen eines Textes fragt nach.
>     - Jede `edit`-Nachricht bekommt eine Antwort, auch wenn ihre Verarbeitung scheitert.
>     - Was die Webview an ihre Elemente schreibt, gilt nie als Knoten der Seitenleiste.
>     - Ein Key-Teil mit Leerzeichen am Rand bekommt eine Warnung.
>     - `scripts/perf-workspace.mjs` bereitet die Messung von 2.17 vor.
>   - Texte mit `\r\n`: Das Feld zeigt `\n`, gespeichert wird wieder `\r\n`, und ein unveränderter Text wird nicht gesendet.
>   - Ansagen:
>     - Sie nennen Key und Sprache („SAVE in fr: nicht gespeichert. …“).
>     - Nach dem Löschen kommt „Text gelöscht.“.
>     - Die geöffnete Einheit wird mit denselben Zahlen angesagt, die die Seite zeigt.
>   - Tastatur und Screenreader:
>     - Eine sichtbare Zeile über der Tabelle nennt die Tasten (Enter/F2, in der Key-Spalte F2 und Entf) und beschreibt das Grid. Die aktive Zelle trägt `aria-keyshortcuts`.
>     - Auf dem Mac löscht auch Cmd+Rücktaste einen Key.
>     - Die Prüfzeilen im Editor nennen die Schwere für Screenreader.
>     - Der Fokusrahmen liegt bei Schaltflächen außen, siehe Protokoll, Abschnitt 3.
>     - Das Feld ist mindestens 24 px hoch.
>   - „Key hinzufügen“ in der Liste setzt den neuen Key nicht mehr hinter den zuletzt aktiven der Tabelle.
>   - Tests:
>     - Die Anfrage-Kennungen kommen aus den gesendeten Nachrichten.
>     - Der Tastatur-Durchlauf prüft jetzt, dass am letzten und am ersten Halt keine Taste Tab abfängt; bisher prüfte er nur seine eigene Hilfsfunktion.
>     - Jeder neue Regressionstest schlägt ohne seine Korrektur fehl (Gegenprobe einzeln).
>   - Neue Module: `state/shownRows.ts` (Zeilen mit den Bearbeitungen), `state/navigation.ts` (nächste Zelle), `components/focus.ts` (verlorener Fokus).
> - **Gegenlesen der Korrekturen** (ein fünfter Prüfer mit frischem Kontext): 3 schwere und 5 kleinere Befunde sowie 3 Kleinigkeiten, alle behoben. Jeder Test dazu schlägt ohne seine Korrektur fehl.
>   - Ein wieder angebotener Konflikt verschwand mit dem nächsten Modell, auch dem eines anderen Keys. Enter hätte dann den fremden Text überschrieben, ohne dass der Nutzer gewählt hatte.
>   - Ein Editor ohne getippten Text blieb im Konflikt als „nicht gespeichert“ zurück, und „Meinen Text behalten“ hätte den alten Text über den neuen geschrieben. Er schließt jetzt still, auch beim Ausblenden.
>   - Eine Liste, die ohne Nachfolger verschwand (kein Treffer mehr), übergab den Fokus trotzdem. Die nächste Liste nahm ihn später aus der Filterauswahl (WCAG 3.2.2). Jetzt wird nur an das andere Layout übergeben, und die Liste nimmt den Fokus nur, wenn er verloren ist.
>   - Kleiner:
>     - Verschwindet die Wahl mit dem Fokus auf einer ihrer Schaltflächen, nimmt das Feld ihn zurück.
>     - Ein gescheiterter Text nimmt die danach gegen ihn gesendeten Texte derselben Zelle mit. Bisher lehnte der Host sie als geändert ab, und das erschien als fremde Änderung.
>     - Der Host plant ein `edit` erst, wenn der Index den letzten Schreibvorgang kennt. Sonst meldete ein schnelles zweites Speichern derselben Zelle einen falschen Konflikt (Integrationstest).
>     - Auch die Details übergeben den Fokus, und die Übergabe behält die Sprache.
>     - Ein ausgeblendeter Text nennt einen Grund, der nach dem Einblenden noch stimmt.
>     - Die Tastenzeile nennt Cmd+Rücktaste für den Mac.
>     - Der Test mit 450 Keys wartet einen Task länger; der alte Fehler zeigte sich erst dann.
> - **Bewusst offen:**
>   - `fileStore.ts` hat 378 und `workspaceIndex.ts` 318 Zeilen, beide mit einer Aufgabe.
>   - Beim Umbenennen von `A.B` in `A` prüft `keyCheck` den Konflikt mit den Kind-Keys weiterhin nicht. Das ist ein älterer Befund und betrifft den Adapter.
>   - Ein nach dem Neustart wiederhergestellter Editor nimmt sein Ziel aus dem Zustand der Webview. Der Zustand wird geprüft und das Ziel im Index gesucht, kann also nur auf Einheiten des Arbeitsbereichs zeigen (Risiko akzeptiert).
>   - Aktionen einer Zeile beim Fokus und eine Tastenhilfe auf „?“ gibt es nicht. Die Tastenzeile über der Tabelle und das Kontextmenü decken beides ab.
>
> **Umsetzungsnotizen Task 2.18 (26.09.2026):** Siehe [`../verification/phase-2.md`](../verification/phase-2.md).
> - VS Code 1.139.1 wurde wie in Phase 1 mit eigenem Profil über das DevTools-Protokoll gesteuert. Die Skripte liegen nur lokal in `out/acceptance/phase-2/`.
> - Auf einer Kopie der echten Dateien (eigenes Git-Repository, der Clone nur gelesen) ändert eine Zelle genau eine Zeile. Undo und die Sicherung der Sitzung stellen den Stand wieder her, danach ist `git status` leer.
> - Bilder in Light+ und Dark+ und der Tastaturdurchlauf stammen aus dem Fixture. VS Code lief ohne deutsches Sprachpaket, also englisch.
> - Ein Test mit 450 Keys lag mit 2 s zu nah an vitests 5 s: Er rendert jetzt eine Sprache statt vier und hat 20 s Zeit.
> - Offen, von Hand: NVDA; die Dialoge der Key-Befehle und die Rückfrage beim Leeren; Kontextmenü und Titelleiste; Kontrastthemes in VS Code.

### Task 2.1: Textbausteine für das Schreiben
**Dateien:** Create `src/core/text/edits.ts`, `src/core/text/style.ts`; Test: `test/unit/core/text/edits.test.ts`, `style.test.ts`
**Interfaces:**
```ts
export interface TextEdit { offset: number; length: number; content: string }
export function applyEdits(text: string, edits: readonly TextEdit[]): string;   // wirft bei Überlappung
export interface TextStyle { eol: '\n' | '\r\n'; indent: string; finalNewline: boolean }
export function detectStyle(text: string): TextStyle;   // Standard: '\n', zwei Leerzeichen, true
```
**Testfälle:** Edits in beliebiger Reihenfolge ergeben dasselbe Ergebnis; überlappende Edits werfen einen `RangeError`.
`detectStyle` erkennt LF, CRLF, Tab, vier Leerzeichen und eine fehlende Newline am Ende; für `{}` gilt der Standard.
**Commit:** `feat(core): add text edits and style detection for writing`

### Task 2.2: JSON-Adapter schreibend
**Dateien:** Modify `src/core/formats/adapter.ts`, `src/core/formats/json/jsonNested.ts`; Create `src/core/formats/json/jsonWrite.ts`, `src/core/text/encode.ts`; Test: `test/unit/core/formats/jsonNested.write.test.ts` mit Golden-Dateien unter `test/fixtures/golden/json/`
**Interfaces:**
```ts
export type FileOp =
  | { kind: 'set'; key: EntryKey; value: string }                       // Feld 'value'; Felder kommen in Phase 6
  | { kind: 'insert'; key: EntryKey; value: string; after?: EntryKey }  // after: Geschwister im selben Objekt
  | { kind: 'delete'; key: EntryKey }                                   // leere Elternobjekte werden mit gelöscht
  | { kind: 'rename'; from: EntryKey; to: EntryKey };
export class EditError extends Error { readonly code: 'missing-key' | 'key-exists' | 'path-conflict' | 'unparsable' }
interface FormatAdapter {
  applyOps(doc: DecodedText, ops: readonly FileOp[]): DecodedText;   // Text neu, Encoding und BOM unverändert
  encode(doc: DecodedText): Uint8Array;                               // UTF-8, BOM wie gelesen; Latin-1 folgt in Phase 5
  createEmpty(style?: TextStyle): string;                             // '{}\n'
}
```
Umsetzung:
- `set` ersetzt den Wertbereich durch `JSON.stringify(value)`.
- `insert` bei vorhandenem Elternobjekt: nach dem Wert des Geschwisters (mit Komma) bzw. als letztes Element, mit der
  Einrückung der Geschwisterzeile; fehlt das Elternobjekt, schreibt der Adapter es im erkannten Stil.
- `delete` entfernt die Zeile samt passendem Komma. Wird ein Objekt dadurch leer, wird es ebenfalls entfernt (bis
  zur obersten Ebene, die als `{}` bleibt).
- `rename` im selben Objekt ersetzt nur den Key-Text; sonst `delete` plus `insert` am Ende des neuen Elternobjekts.
- Datei mit Syntaxfehler: `EditError('unparsable')`.

**Golden-Testfälle** (Dateien mit LF, CRLF, Tabs, BOM, ohne Newline am Ende, mit ungewöhnlichen Abständen):
| Operation | Erwartung |
|---|---|
| keine | Bytes identisch |
| `set` | genau **eine** Zeile anders; Punkt-Keys (`mail.smtp.server`) und `/`-Keys funktionieren |
| `insert` nach Geschwister in der Mitte | genau eine Zeile neu, Nachbarn unverändert (auch `"A":"1" ,`) |
| `insert` nach dem letzten Geschwister | eine Zeile neu; die vorherige Zeile bekommt nur ein Komma |
| `insert` mit neuem Elternpfad | Elternobjekte im Stil der Datei |
| `delete` in der Mitte / am Ende / letztes Kind | eine Zeile weniger / Komma der Vorzeile entfernt / Elternobjekt entfernt |
| `rename` im selben Objekt | genau eine Zeile anders |
| Werte mit `"`, `\`, Zeilenumbruch, Umlauten, Emoji, U+2028 | Wert nach erneutem Parsen identisch |
| `set` auf fehlenden Key, `insert` auf vorhandenen Key, `insert` unter einem Text-Blatt | `EditError` mit passendem Code |
**Commit:** `feat(core): write nested JSON files without changing their formatting`

### Task 2.3: Bearbeitung einer Einheit planen und prüfen
**Dateien:** Create `src/core/edit/planEdit.ts`, `src/core/edit/keyCheck.ts`; Test: `test/unit/core/edit/planEdit.test.ts`, `keyCheck.test.ts`
**Interfaces:**
```ts
export type BundleEdit =
  | { kind: 'setText'; entryId: string; locale: LocaleCode; value: string; before?: string }   // before: Ausgangswert (B5)
  | { kind: 'addKey'; key: EntryKey; values: Record<LocaleCode, string>; after?: string }
  | { kind: 'renameKey'; entryId: string; to: EntryKey }
  | { kind: 'deleteKey'; entryId: string };
export type FileChange =
  | { relPath: string; ops: FileOp[] }
  | { relPath: string; create: 'empty' };                                   // neue Sprachdatei
export type PlanResult = { ok: true; changes: FileChange[]; warnings: EditWarning[] } | { ok: false; error: EditProblem };
export function planEdit(bundle: Bundle, edit: BundleEdit): PlanResult;
export function checkKey(key: EntryKey, bundle: Bundle, others: readonly Bundle[], area: AreaDefinition): KeyCheck;
export function planAddLanguage(bundles: readonly Bundle[], area: AreaDefinition, locale: LocaleCode): PlanResult;
```
Regeln:
- `setText` mit `''` in einer Übersetzung → `delete` in dieser Sprache (B2); in der Referenz → Fehler
  `reference-empty`. Fehlt die Sprachdatei → Fehler `missing-file` mit Hinweis „Sprache hinzufügen".
- `setText` auf einen Key, den die Sprache noch nicht hat → `insert` nach dem nächsten vorangehenden Key der
  Referenzreihenfolge, den die Datei hat.
- `checkKey`: leere Segmente, Key existiert bereits, Konflikt mit einem Text-Blatt auf dem Pfad oder mit einem Objekt
  unter dem Key → Fehler. Existiert der oberste Key in einer anderen Einheit derselben Wurzel und hat der Bereich
  `mergeSemantics: 'shallow-toplevel'` → Warnung `exists-in-other-bundle` mit Namen (edu-sharing: „existiert in
  `common`").
- `planAddLanguage`: Locale passt zu `localePattern`, existiert noch nicht; je Einheit eine leere Datei (`{}`), ohne
  Keys, damit fehlende Keys auf die Standardsprache zurückfallen.
**Testfälle:** je Regel mindestens ein Fall; zusätzlich: Umbenennen trifft alle Sprachdateien der Einheit, die den Key
haben; Löschen von `WORKSPACE.FILE.TITLE` im Fixture entfernt in `de` auch das dann leere Objekt `FILE`, aber nicht
`WORKSPACE`, weil `WORKSPACE.TITLE` bleibt.
**Commit:** `feat(core): plan edits of a bundle and check new keys`

### Task 2.4: FileStore
**Dateien:** Create `src/extension/services/fileStore.ts`, `src/core/util/hash.ts`; Test: `test/unit/core/util/hash.test.ts`, `test/integration/fileStore.test.ts`
**Interfaces:**
```ts
export function revisionOf(bytes: Uint8Array): string;           // FNV-1a 64 Bit, hex; nur Änderungserkennung
export type WriteResult = { ok: true; revision: string } | { ok: false; reason: 'dirty' | 'conflict' | 'error'; message: string };
export class FileStore implements vscode.Disposable {
  constructor(index: WorkspaceIndex, log: vscode.LogOutputChannel);
  write(folder: vscode.WorkspaceFolder, area: AreaDefinition, changes: readonly FileChange[], baseRevisions: ReadonlyMap<string, string>): Promise<WriteResult>;
  undo(): Promise<WriteResult | undefined>;
}
```
- **Dirty-Guard:** Ist eine Zieldatei in einem Editor ungespeichert geändert, wird nichts geschrieben; die Meldung
  bietet „Datei zeigen".
- **Warteschlange je Datei**; eine Änderung über mehrere Dateien schreibt alle oder keine (vorher alles planen und
  prüfen, dann schreiben; bei einem Fehler mittendrin werden die schon geschriebenen Dateien zurückgesetzt).
- **Revision und Rebase** nach B5.
- **Sitzungs-Undo:** je Schreibvorgang die Bytes vorher und nachher. Rückgängig nur, wenn die Datei noch den Stand
  „nachher" hat.
- Nach dem Schreiben: `index.refresh()` (nur die betroffene Wurzel, siehe 2.15) statt auf den Watcher zu warten.
**Testfälle (Integration, Fixture-Kopie im Temp-Ordner):** geänderte Zelle → eine Zeile Diff; geöffnete, geänderte
Datei → `dirty`, nichts geschrieben; externe Änderung eines anderen Keys → Rebase gelingt; externe Änderung desselben
Keys → `conflict`; Undo stellt die Bytes wieder her.
**Commit:** `feat: write translation files safely`

### Task 2.5: Backups
**Dateien:** Create `src/extension/services/backupService.ts`, `src/extension/commands/backup.ts`; Modify `package.json` (Befehle `eduI18n.backupNow`, `eduI18n.restoreBackup`; Einstellungen `eduI18n.backup.intervalMinutes` = 10, `eduI18n.backup.keep` = 10); Test: `test/integration/backup.test.ts`
- Backup vor dem ersten Schreibvorgang einer Sitzung, vor Operationen über mehrere Einheiten, alle N Minuten bei
  Änderungen und manuell. Ablage: `context.storageUri/backups/<Zeitstempel>/<relPath>` plus `manifest.json`, **nie im
  Repo**. Die letzten N bleiben.
- Wiederherstellen: QuickPick (Zeit, Anzahl Dateien) → modale Rückfrage → vorher ein Backup des aktuellen Stands →
  Schreiben über den `FileStore` (Dirty-Guard gilt).
**Testfälle:** erster Schreibvorgang legt genau ein Backup an; `keep` begrenzt; Wiederherstellen ergibt die alten Bytes.
**Commit:** `feat: back up translation files outside the repository`

### Task 2.6: Protokoll und ViewModel
**Dateien:** Create `src/shared/protocol.ts`, `src/shared/viewModel.ts`; Test: `test/unit/shared/protocol.test.ts`, `viewModel.test.ts`
- Nachrichten nach Design §6.12, in Phase 2 ohne KI und Import: `ready`, `edit`, `command`, `uiState`, `undo` bzw.
  `init`, `bundle`, `patch`, `writeResult`.
- `isWebviewToHost(value: unknown)` prüft Typ, Felder und Längen (Text höchstens 100.000 Zeichen); unbekannte
  Nachrichten werden verworfen und geloggt.
- `buildBundleViewModel(bundle, issues, localize)`: Sprachen (Referenz, Variante, Datei vorhanden, Zähler), Zeilen je
  Key mit Zellen (Wert oder „fehlt"), Befunde je Zelle mit lokalisierter Meldung, Revision je Datei.
**Testfälle:** gültige und ungültige Nachrichten; ViewModel von `common` im Fixture (12 Zeilen der Referenz plus 2
Extra-Keys aus `it`, Befunde an den richtigen Zellen).
**Commit:** `feat: define the webview protocol and bundle view model`

### Task 2.7: Editor-Panel und Webview-Grundgerüst
**Dateien:** Modify `esbuild.mjs`, `package.json`, `eslint.config.mjs`; Create `tsconfig.webview.json`, `src/extension/panels/editorPanel.ts`, `webviewHtml.ts`, `messageRouter.ts`, `src/extension/commands/openBundle.ts`, `src/webview/main.tsx`, `app.tsx`, `state/store.ts`, `a11y/liveRegion.tsx`, `styles/base.css`; Test: `test/unit/extension/webviewHtml.test.ts`, `test/unit/webview/app.test.tsx`, `test/integration/editorPanel.test.ts`
- Ein Panel je Einheit (erneutes Öffnen holt es nach vorn); Klick auf eine Einheit in der Seitenleiste öffnet es.
- CSP: `default-src 'none'`, Skripte nur mit Nonce, Styles aus `cspSource`, Fonts aus `cspSource`; kein
  `unsafe-inline` für Skripte. `localResourceRoots` nur `dist/webview`. `retainContextWhenHidden`. Serializer stellt
  offene Panels nach einem Neustart wieder her.
- Texte der Oberfläche kommen mit `init` vom Host (`vscode.l10n`), Farben nur aus `--vscode-*`.
**Testfälle:** HTML enthält die Nonce und keine Inline-Skripte; die App zeigt nach `init` und `bundle` die Einheit;
axe: 0 Verstöße; Integration: `eduI18n.openBundle` für `common` öffnet ein Panel und beantwortet `ready`.
**Commit:** `feat: open a translation editor per bundle`

### Task 2.8: Werkzeugleiste, Sprach-Chips und Ansichtszustand
**Dateien:** Create `src/webview/components/toolbar.tsx`, `languageChips.tsx`, `src/webview/state/scrollAnchor.ts`; Test: `test/unit/webview/toolbar.test.tsx`, `scrollAnchor.test.ts`
- Umschalter Tabelle/Liste/automatisch, ein-/mehrzeilig (global), Sprach-Chips (Sichtbarkeit, Referenzmarke,
  Zähler fehlend/Befunde), Suche (`Strg+F`), Undo-Knopf.
- **Scroll-Anker:** Beim Ein- oder Ausblenden einer Sprache bleibt der oberste sichtbare Key an seiner Position.
**Testfälle:** Chip blendet die Spalte aus und ist per Tastatur bedienbar (`aria-pressed`); Anker-Berechnung als reine
Funktion; axe 0 Verstöße.
**Commit:** `feat(webview): add toolbar, language chips and persistent view state`

### Task 2.9: Filter
**Dateien:** Create `src/shared/filter.ts`, `src/webview/components/filterBar.tsx`; Test: `test/unit/shared/filter.test.ts`, `test/unit/webview/filterBar.test.tsx`
- `filterRows(rows, filter)`: Key-Suche, Text-Suche (alle oder eine Sprache), Regex oder Text, Groß-/Kleinschreibung,
  Status (alle · fehlt · Befunde · leer). Ein ungültiger Regex filtert nicht und liefert eine Fehlermeldung.
**Testfälle:** jede Kombination mindestens einmal; ungültiger Regex; „fehlt" nur für sichtbare volle Sprachen.
**Commit:** `feat: filter entries by key, text and status`

### Task 2.10: Tabellenansicht
**Dateien:** Create `src/webview/components/table/*.tsx`, `src/webview/a11y/gridKeys.ts`; Test: `test/unit/webview/table.test.tsx`, `gridKeys.test.ts`
- ARIA-Grid (`role="grid"`, Spalten- und Zeilenköpfe, `aria-rowcount`/`aria-rowindex`), roving `tabindex`,
  Navigation nach Design §7.2, fixierte Kopfzeile und Key-Spalte, Fokus nie verdeckt (`scroll-padding`).
- Schrittweises Rendern (erst 200 Zeilen, dann in Blöcken) und `content-visibility: auto`.
- Status nie nur als Farbe: Symbol plus Text („fehlt", „leer", „Platzhalter"), `aria-describedby` auf die Meldung.
**Testfälle:** Tastennavigation (reine Funktion und Komponente), Attribute, axe 0 Verstöße.
**Commit:** `feat(webview): add the table view as an accessible grid`

### Task 2.11: Listenansicht und Umschaltung nach Breite
**Dateien:** Create `src/webview/components/list/*.tsx`, `src/webview/state/layout.ts`; Test: `test/unit/webview/list.test.tsx`, `layout.test.ts`
- Je Key eine Karte (Überschrift = Key, beschriftete Felder je Sprache). Automatisch: ab 900 px Tabelle, darunter
  Liste, bis 480 px kompakt (Referenz plus eine gewählte Sprache). Manuelle Wahl hat Vorrang.
**Testfälle:** Breite → Layout als reine Funktion; Umbruch bei 320 px ohne horizontales Scrollen; axe 0 Verstöße.
**Commit:** `feat(webview): add the list view and switch layouts by width`

### Task 2.12: Zell-Editor
**Dateien:** Create `src/webview/components/cellEditor.tsx`, `src/extension/panels/editHandler.ts`; Test: `test/unit/webview/cellEditor.test.tsx`, `test/integration/editing.test.ts`
- Tasten nach Design §7.2; `textarea` wächst mit (nie inneres Scrollen); Inline-Prüfung beim Tippen mit
  `compareParams`/`compareTags` aus dem Kern.
- Speichern schickt `edit` mit Ausgangswert und Revision; die Zelle zeigt den neuen Wert sofort, bei Fehler kommt der
  alte zurück und eine Meldung erscheint (Live-Region). Geleerte Übersetzung: Rückfrage „Text löschen (Rückfall auf
  <Referenz>)?".
**Testfälle:** Tastenlogik; Integration: `edit` über den Router ändert in `fr.json` genau eine Zeile, der Befund
`placeholder-mismatch` verschwindet nach Korrektur, Undo stellt den alten Stand her.
**Commit:** `feat: edit texts in the table and list`

### Task 2.13: Details-Leiste
**Dateien:** Create `src/webview/components/details.tsx`; Test: `test/unit/webview/details.test.tsx`
- Rechts (breit) oder unten (schmal): alle Sprachen des fokussierten Keys (bearbeitbar), Befunde mit Erklärung und
  Lösungshinweis. Kontext und Review folgen in Phase 7.
**Testfälle:** folgt dem Fokus; Befunde vollständig; axe 0 Verstöße.
**Commit:** `feat(webview): show details of the focused key`

### Task 2.14: Befehle für Keys und Sprachen
**Dateien:** Create `src/extension/commands/addKey.ts`, `renameKey.ts`, `deleteKey.ts`, `addLanguage.ts`; Modify `package.json` (Befehle, Menüs in Seitenleiste und Editor); Test: `test/integration/keyCommands.test.ts`
- Key hinzufügen: InputBox mit Prüfung über `checkKey`; Warnung „existiert in `common`" mit Rückfrage.
- Umbenennen: InputBox, dann Umfang *„Nur in dieser Einheit" · „In allen Einheiten mit diesem Key (n)" ·
  „Abbrechen"*, die betroffenen Einheiten werden genannt.
- Löschen: modale Rückfrage mit denselben Umfängen.
- Sprache hinzufügen: InputBox (Locale nach `localePattern`), legt `{}`-Dateien in allen Einheiten der Wurzel an.
- Operationen über mehrere Einheiten legen vorher ein Backup an.
**Testfälle:** Sprache `es` legt vier `{}`-Dateien an (danach aufräumen); Umbenennen in allen Einheiten; Abbrechen
schreibt nichts.
**Commit:** `feat: add, rename and delete keys and add languages`

### Task 2.15: Externe Änderungen und Aktualisierung je Wurzel
**Dateien:** Modify `src/extension/services/workspaceIndex.ts`, `src/extension/panels/editorPanel.ts`; Create `src/shared/patch.ts`; Test: `test/unit/shared/patch.test.ts`, `test/integration/externalChanges.test.ts`
- `WorkspaceIndex.refreshRoot(folder, area, root)`: nur diese Wurzel neu lesen und prüfen (Watcher und `FileStore`
  nutzen es); der volle Lauf bleibt für Konfigurationsänderungen und „Prüfen".
- Erkannte Wurzeln bleiben gespeichert, bis der Marker-Watcher feuert oder sich Einstellungen, Ordner oder Vertrauen
  ändern. Die workspaceweite Markersuche (136–335 ms je Bereich, mit MDS und Mail dreimal) läuft dann nicht bei
  jedem Speichern (Hinweis aus dem Review Block C/D).
- Offene Panels bekommen einen Patch (geänderte Zellen und Befunde); Fokus und Scrollposition bleiben.
- Ändert sich die gerade bearbeitete Zelle extern, bleibt der Entwurf erhalten und die Zelle zeigt einen Konflikt mit
  „Übernehmen" oder „Meinen behalten".
**Testfälle:** Patch-Berechnung als reine Funktion; externe Änderung von `fr.json` erreicht das offene Panel.
**Commit:** `feat: keep open editors in sync with external changes`

### Task 2.16: Barrierefreiheit prüfen
**Dateien:** Create `test/unit/webview/keyboardWalk.test.tsx`, `docs/verification/phase-2-a11y.md`
- axe in allen Komponententests (0 Verstöße, CI-Gate); Tastatur-Durchlauf als Skript (Werkzeugleiste → Filter →
  Tabelle → Editor → Details → zurück); NVDA-Protokoll; Sichtprüfung in Light+, Dark+, High Contrast und High
  Contrast Light.
**Commit:** `test: check the editor for accessibility`

### Task 2.17: Leistung
**Dateien:** Create `test/unit/webview/performance.test.tsx`, Messpunkte im Log
- Erzeugte Einheit mit 2.000 Keys × 6 Sprachen: erster Aufbau unter 1 s (Messung in VS Code über Log-Zeitstempel);
  Speichern einer Zelle unter 150 ms (Host-Messung); `common` des echten Repos (1.437 Keys) als Gegenprobe.
**Commit:** `perf: measure the editor with large bundles`

### Task 2.18: Abnahme Phase 2 dokumentieren
**Dateien:** Create `docs/verification/phase-2.md`
- Golden-Tests grün; eine Zelle im echten Repo (Kopie) geändert → `git diff` zeigt genau eine Zeile; Undo und Backup
  wiederhergestellt; Screenshots der Ansichten in Light+ und Dark+; Tastatur- und NVDA-Protokoll; Messwerte aus 2.17.
**Commit:** `docs: record phase 2 verification`

---

## Phasen 5 und 6 (Kern) – Metadatasets und Mail-Templates (vorgezogen am 26.09.2026)

**Anlass:** Der Nutzer öffnet den Datenordner der alten App (`data/1.0.0/` mit `json/`, `metadatasets/i18n/` und
`mailtemplates/`) und möchte in allen drei Bereichen wie dort die Sprachen nebeneinander sehen, Lücken erkennen und
schließen. Bisher erscheint nur Angular-JSON. Die Reihenfolge aus E5 ändert sich deshalb: Metadatasets und der Kern
der Mail-Templates kommen vor Füllen (Phase 3) und Import/Export (Phase 4). Die Tasks ersetzen die Gliederung von
Phase 5 und die Punkte 6.1–6.3 und 6.6 von Phase 6; Template-Ansicht mit Vorschau (6.4) und KI für Templates (6.5)
bleiben später.

**Schritt 0:** `/better-coding-workflow` (für die UI-Anteile zusätzlich `/better-coding-frontend`). Nach Block E
(5.1–5.5) und Block F (6.1–6.3) folgt je ein Review mit `/better-coding-review`, Block G (6.6–6.8) schließt ab.

**Ziel:** In einem Arbeitsbereich mit edu-sharing-Checkout oder Datenordner zeigt die Seitenleiste die Bereiche
„Angular JSON", „Metadatasets" und „Mail templates". Jede Einheit öffnet im selben Übersetzungseditor: eine Spalte je
Sprache, fehlende Texte markiert und über Filter und Zähler auffindbar, direkt in der Zelle zu füllen. Geschrieben
wird nur, was sich ändert; alle anderen Bytes der Datei bleiben.

**Entwurfsentscheidungen:**
- **M1 Flache Keys.** Ein Key einer `.properties`-Datei ist ein einziges Segment, Punkte gehören zum Namen. Der
  Adapter meldet das (`flatKeys`); Key-Eingaben in solchen Bereichen werden nicht an Punkten geteilt.
- **M2 Lesen wie `java.util.Properties.load`.** Logische Zeilen (Fortsetzung bei ungerader Zahl von `\` am
  Zeilenende, führender Leerraum der Folgezeile entfällt), Kommentarzeilen `#`/`!`, Trennzeichen `=`, `:` oder
  Leerraum, Escapes `\t \n \r \f \uXXXX`, sonst `\x` → `x`. Bei doppelten Keys gilt die letzte Definition an der
  Position der ersten, jede Wiederholung meldet `duplicate-key`. Ein ungültiges `\u` bricht Java beim Laden ab:
  `parse-error`. Encoding je Datei wie `PropertyResourceBundle`: gültiges UTF-8, sonst ISO-8859-1; `not-utf8`
  entfällt.
- **M3 Zeilengenau schreiben.** `set` ersetzt nur den Wertteil der logischen Zeile, der neue Wert steht auf einer
  physischen Zeile. `insert` schreibt `Key<Trenner>Wert` mit dem Trenner der Nachbarzeile hinter die logische Zeile
  des Ankers. `delete` entfernt jede Definition samt Zeilenende. `rename` ersetzt den Key der letzten Definition und
  entfernt frühere. Escapes: `\\ \t \n \r \f`, führendes Leerzeichen als `\ `, im Key zusätzlich `= : # !` und
  Leerzeichen. ISO-8859-1-Dateien bekommen Zeichen jenseits von U+00FF als `\uXXXX`; UTF-8 bleibt, wie es ist.
- **M4 Verborgene Keys.** Das Bereichsattribut `ignoredKeys` (MDS: `this_is_a_bug_the_first_line_will_not_be_translated`)
  blendet Einträge aus Einheit, Prüfungen und Editor aus; die Dateien behalten sie. Ein neuer Key landet nie davor. Eine
  neue Sprachdatei beginnt mit den verborgenen Einträgen ihrer Referenzdatei.
- **M5 Basisdatei.** `default` erscheint als `default (en)` (Sprache aus `eduI18n.baseFileLanguage`); die Referenz
  `de` findet `de_DE`.
- **T1 Eine Zeile je Feld.** Ein Mail-Eintrag hat den Key `[Template, Feld]` mit Feld `subject` oder `message`; der
  Editor zeigt `invited.subject` und `invited.message` als Zeilen mit einer Spalte je Sprache. Templates mit
  `context`-Attribut heißen `name@context`. (Design §6.4 sah dynamische Felder und eine eigene Template-Ansicht vor;
  beides folgt mit der Vorschau.)
- **T2 Wert = Textinhalt.** Der Wert ist der Textinhalt des Elements, wie `MailTemplate` ihn liest (Entities
  aufgelöst, CDATA-Inhalt, Zeilenenden als `\n`). Leerraum mit Zeilenumbruch an den Enden ist Layout und gehört nicht
  zum Wert: um den Text und innerhalb eines CDATA-Abschnitts oder einer Folge von Abschnitten, die nur
  Zeichenreferenzen trennen (so teilt der Schreiber einen Text an `]]>` und in ISO-8859-1). Der Schreiber lässt ihn
  deshalb auch an den Enden eines neuen Werts weg. Felder mit Kindelementen oder Kommentaren melden
  `non-string-value` und bleiben unberührt; andere Elemente eines Templates (`<style>`) sind keine Einträge.
- **T3 Chirurgisch schreiben.** `set` ändert bei `[Leerraum]CDATA[Leerraum]` nur den CDATA-Inhalt, sonst bekommt
  `subject` escapten Text (`& < >`) und `message` einen CDATA-Abschnitt (`]]>` wird geteilt). `insert` legt ein
  fehlendes Feld in seinem Template an (hinter dem Geschwisterfeld, mit dessen Einrückung) oder ein fehlendes Template
  hinter dem Template des Ankers. `delete` entfernt das Feld und ein Template ohne übrige Kindelemente. `rename` wie bei
  JSON. ISO-8859-1-Dateien bekommen Zeichen jenseits von U+00FF als Zeichenreferenz außerhalb von CDATA.
- **T4 Keys prüfen.** Neue Mail-Keys müssen `TEMPLATE.subject` oder `TEMPLATE.message` lauten (Adapter-Hook
  `validKey`), sonst Problem `invalid-template-key`. Texte mit Zeichen, die XML nicht aufnehmen kann, lehnt die
  Planung ab (`invalidText`, Problem `invalid-text`).

**Nach den Reviews (26.09.2026):** Die Befunde der Reviews von Block E und F sind behoben, unter anderem Backslashes
am Zeilenende in `.properties`, eine Byte-Order-Mark (Regel `bom-first-key`), verborgene Keys als neue Namen, die
wörtlich übernommene Wächterzeile, Zeichen, die XML verbietet, doppelte Templates und die Kodierung aus der
XML-Deklaration. `check-repo --roundtrip` setzt zusätzlich jeden Text auf sich selbst und liest ihn zurück.

### Task 5.1: Properties lesen
**Dateien:** Create `src/core/formats/properties/propertiesRead.ts`; Test: `test/unit/core/formats/properties.parse.test.ts`
**Testfälle:** Trenner (`a=b`, `a: b`, `a b`, `a = b`, `a\:b=c`), Fortsetzungen (`a=b\` + `  c` → `bc`; `a=b\\` ist
keine), Kommentare und Leerzeilen, eine `#`-Zeile als Fortsetzung gehört zum Wert, Escapes (`\t`, `\u00e4`, `\=`,
`\\`), `a=\u12` → `parse-error`, leere Werte (`a=`, `a`), doppelter Key (letzter Wert, erste Position,
`duplicate-key` am zweiten Key), `keyRange`/`valueRange` (Wert bis Ende der logischen Zeile ohne Zeilenende),
ISO-8859-1-Datei.
**Commit:** `feat(core): read .properties files like java.util.Properties`

### Task 5.2: Properties schreiben
**Dateien:** Create `src/core/formats/properties/propertiesWrite.ts`, `properties.ts` (Adapter, Formatliste); Test:
`test/unit/core/formats/properties.write.test.ts`, `properties.golden.test.ts` mit Dateien unter
`test/fixtures/golden/properties/`
**Golden-Testfälle** (UTF-8, ISO-8859-1, CRLF, ohne Newline am Ende, Fortsetzungen):
| Operation | Erwartung |
|---|---|
| keine | Bytes identisch, auch ISO-8859-1 |
| `set` | genau eine Zeile anders; ein fortgesetzter Wert wird zu einer Zeile |
| `insert` in der Mitte / am Ende / `first` / in leere Datei / ohne Newline am Ende | eine Zeile neu, Trenner der Nachbarzeile |
| `delete` in der Mitte / am Ende / fortgesetzte Zeile | nur deren Zeilen weg |
| `rename` | genau eine Zeile anders, frühere Definitionen weg |
| Werte mit `\`, Zeilenumbruch, führendem Leerzeichen, `#`, `ä`/`€` in ISO-8859-1 und UTF-8 | Wert nach erneutem Lesen identisch; `€` in ISO-8859-1 als `\u20ac` |
| `set` auf fehlenden Key, `insert` auf vorhandenen | `EditError` mit passendem Code |
**Commit:** `feat(core): write .properties files line by line, keeping encoding and escapes`

### Task 5.3: Flache Keys
**Dateien:** Modify `src/core/formats/adapter.ts` (`flatKeys`), `src/core/model/keyInput.ts`,
`src/extension/commands/addKey.ts`, `renameKey.ts`, l10n; Test: `keyInput.test.ts`
**Testfälle:** flach: `a.b` bleibt ein Segment, `\` bleibt, wie es ist; verschachtelt unverändert.
**Commit:** `feat: take the keys of flat formats as typed`

### Task 5.4: Bereich Metadatasets
**Dateien:** Modify `src/core/area/presets.ts`, `areaDefinition.ts` (`properties`, `ignoredKeys`), `parseArea.ts`,
`src/core/model/bundle.ts`, `src/core/edit/planEdit.ts`, `src/shared/viewModel.ts`, Webview-Beschriftung der Sprache,
`package.json` (Formate, `ignoredKeys`, Aktivierung, Stichwort), l10n; Test: `presets.test.ts`, `analyze.test.ts`,
`planEdit.test.ts`, `viewModel.test.ts`, `manifest.test.ts`
**Testfälle:** Muster ordnet `mds.properties` → `mds`/`default`, `mds_override_de_DE.properties` →
`mds_override`/`de_DE`, `valuespaces_i18n.properties` → `valuespaces_i18n`/`default` zu; Wächterzeile weder als
Zeile noch als Befund sichtbar; neuer erster Key landet hinter ihr; neue Sprache beginnt mit ihr; Referenz `de_DE`;
Beschriftung `default (en)`.
**Commit:** `feat(core): add the metadataset area of edu-sharing`

### Task 5.5: Rundlauf gegen das Repo
**Dateien:** Modify `scripts/check-repo.ts`, `scripts/lib/checkRepo.ts`; Test: `test/unit/scripts/…`
**Umsetzung:** `--roundtrip` liest jede Datei jedes Bereichs, schreibt sie ohne Änderung und vergleicht die Bytes.
**Abnahme gegen den Clone (nur lesend):** 0 Abweichungen; Zahlen aus Design §2.3 (fehlende Keys gegenüber `de_DE`,
14 doppelte Keys, 13 Dateien in ISO-8859-1) stimmen oder die Abweichung ist begründet.
**Ergebnis (26.09.2026):** 112 Dateien (87 JSON, 25 `.properties`) byte-identisch; 2.605 fehlende Keys, 14 doppelte
Keys, 7 Einheiten wie in §2.3. **Befund der Abnahme:** 60 Fehler `placeholder-malformed` in `mds*.properties` waren
Fehlalarme: Metadatasets schreiben Platzhalter mit einer Klammer (`{user}`), nur `{{GENDER_SEPARATOR}}` mit zwei. Behoben
mit dem Bereichsattribut `placeholderSyntax` (`single-brace` im MDS-Preset); Prüfregeln und Prüfung beim Tippen lesen
Platzhalter danach. Danach 0 Platzhalter-Befunde in den Metadatasets. Seit Keys der Basisdatei allen Sprachen fehlen,
die sie nicht haben, sind es 2.632 fehlende Keys (27 davon nur in der Basisdatei); Protokoll in
[`docs/verification/phasen-5-6.md`](../verification/phasen-5-6.md).
**Commit:** `feat(scripts): check that every translation file survives a round trip`,
`fix(core): read the single-brace placeholders of metadatasets`

### Task 6.1: Mail-Templates lesen
**Dateien:** Create `src/core/formats/mail/xmlTokens.ts`, `mailRead.ts`, `mail.ts`; Test: `mail.parse.test.ts`
**Testfälle:** Prolog `<?xml …?>`, Kommentare zwischen Templates, Attribute mit `'` und `"`, Entities im Betreff,
CDATA mit umgebendem Leerraum, leeres `<subject/>`, Template nur mit `<style>` (kein Eintrag), `context` → `name@context`,
doppeltes Template (`duplicate-key`, letztes gilt), Feld mit Kindelement → `non-string-value`, kaputtes XML (offenes
Tag, falsches End-Tag, loses `&`) und Wurzel ≠ `templates` → `parse-error`.
**Commit:** `feat(core): read mail template files with positions`

### Task 6.2: Mail-Templates schreiben
**Dateien:** Create `src/core/formats/mail/mailWrite.ts`; Modify `mail.ts`; Test: `mail.write.test.ts`,
`mail.golden.test.ts` mit Dateien unter `test/fixtures/golden/mail/`
**Golden-Testfälle** (Tabs/CRLF, Leerzeichen/LF ohne Newline am Ende):
| Operation | Erwartung |
|---|---|
| keine | Bytes identisch |
| `set` Betreff / Nachricht in CDATA | nur der Text bzw. der CDATA-Inhalt ändert sich |
| Werte mit `& < >`, `]]>`, Zeilenumbrüchen | Wert nach erneutem Lesen identisch |
| `insert` Feld in vorhandenes Template (nach Geschwister, `first`) | eine Zeile neu |
| `insert` neues Template (nach Anker, `first`, am Ende, in leeres `<templates>`) | Template im Stil der Datei |
| `delete` Feld / letztes Feld / Template mit `<style>` | Zeile weg / Template weg / Template bleibt |
| `rename` im Template / in anderes Template | Tag-Namen / Feld zieht um |
| `set` auf fehlendes Feld, `insert` auf vorhandenes | `EditError` mit passendem Code |
**Commit:** `feat(core): write mail templates without touching the rest of the file`

### Task 6.3: Bereich Mail-Templates
**Dateien:** Modify `src/core/area/presets.ts`, `areaDefinition.ts` (`mail-xml`), `src/core/formats/adapter.ts`
(`validKey`), `src/core/model/bundle.ts` (`format`), `src/core/edit/keyCheck.ts`, `editMessages.ts`, `package.json`, l10n; Test: `presets.test.ts`,
`analyze.test.ts`, `planEdit.test.ts`, `keyCheck.test.ts`
**Testfälle:** `templates.xml` → `default`, `templates_de_DE.xml` → `de_DE`, `templates_de_DE_override.xml` gehört
nicht dazu; fehlendes Template in `fr_FR` → `missing-key` für seine Felder; fehlendes Feld füllen legt es im
Template an, fehlendes Template legt es hinter dem vorigen an; `neu.titel` als neuer Key → `invalid-template-key`.
**Commit:** `feat(core): add the mail template area of edu-sharing`

### Task 6.6: Integrationstest aller Formate
**Dateien:** Create `test/fixtures/workspace-formats/` (synthetisch: Datenordner mit Metadatasets und Mail-Templates),
`test/integration/formats.test.ts`; Modify `.vscode-test.mjs` (Profil `formats`), `test/fixtures/README.md`
**Testfälle:** Bereiche und Einheiten in der Seitenleiste; Editor einer MDS-Einheit und der Mail-Templates öffnet;
fehlenden Text setzen schreibt genau eine Zeile, ISO-8859-1 bleibt; fehlendes Mail-Feld füllen; neue Sprache legt
MDS-Dateien mit Wächterzeile an.
**Commit:** `test: check metadatasets and mail templates in VS Code`

### Task 6.7: Doku und Version
**Dateien:** `README.md`, `docs/einstellungen.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, Design §11 (E5), `package.json`
(0.3.0: die Version zählt ab jetzt die Ausbaustufen, weil die Phasen nicht mehr in Zahlenreihenfolge kommen)
**Commit:** `docs: describe metadatasets and mail templates`, `build: version 0.3.0`

### Task 6.8: Abnahme mit dem Datenordner
Isolierte VS-Code-Instanz über CDP mit einer Kopie des Datenordners der alten App (nie committet): drei Bereiche in der
Seitenleiste, Editor einer MDS-Einheit und der Mail-Templates mit Lücken, eine Lücke geschlossen, `git diff` der Kopie
zeigt genau die Änderung. Bilder im Scratchpad, Zahlen in `docs/verification/`.
**Commit:** `docs: record the verification of metadatasets and mail templates`

---

## Offene Punkte aus 0.3.0 (26.09.2026)

**Anlass:** Der Nutzer bittet, die offenen Punkte aus der Abnahme der Phasen 5 und 6
([`docs/verification/phasen-5-6.md`](../verification/phasen-5-6.md), Abschnitt 6) zu beheben. Die Entscheidungen stützen
sich auf den Clone und den Datenordner (nur lesend ausgewertet, nichts daraus zitiert oder committet).

**Schritt 0:** `/better-coding-workflow`, für O6 zusätzlich `/better-coding-frontend`. Nach O6 prüft ein Reviewer mit
frischem Kontext den ganzen Block mit `/better-coding-review`.

**Entscheidungen:**
- **P1 Keys der Basisdatei ohne Übersetzbares.** Ein Key, den nur die Basisdatei hat, fehlt den anderen Sprachen nur,
  wenn sein Text etwas zu übersetzen hat: Buchstaben außerhalb von URLs, Platzhaltern und Tags. Die 9 Lizenz-URLs von
  `mds` im Clone (9 von 10 im Datenordner) sind dann keine Lücken mehr, `passwordRequest` bleibt eine. Eine Sprache,
  die einen solchen Key hat, bekommt dafür auch keinen `orphan-key`.
- **P2 Override-Einheiten sind dünn besetzt.** edu-sharing liest `{gruppe}_override_{locale}` vor `{gruppe}_{locale}`
  und `{gruppe}_override` vor `{gruppe}` (`MetadataReader.getTranslation`); Angular lädt die Kategorie `override`
  zuletzt. Eine Override-Datei enthält also nur, was sie ändert. Neues Bereichsattribut `overrideBundlePattern`
  (regulärer Ausdruck für den ganzen Einheitennamen, geprüft wie `bundlePattern`); MDS-Preset `.+_override`,
  Angular-Preset `override`. Solche Einheiten bekommen keine Befunde zu fehlenden Keys oder Dateien
  (`missing-key`, `orphan-key`, `misplaced-key`, `missing-file`); die übrigen Regeln gelten. Mail-Overrides
  (`templates[_{locale}]_override.xml`) ersetzen ganze Templates und gibt es weder im Clone noch im Datenordner: Sie
  bleiben außerhalb des Mail-Bereichs (keine Änderung).
- **P3 Verlorene Zeichen.** Neue Regel `lost-character` (Warnung): ein `?` zwischen zwei Buchstaben außerhalb von Tags
  und URLs oder ein U+FFFD im Text. Das bleibt, wenn eine Datei beim Speichern ein Zeichen nicht aufnehmen konnte
  (im Clone und im Datenordner je 62 Stellen in `fr_FR`, etwa `l?apprentissage` und `n?ud` für `nœud`, kein
  Fehlalarm). Die Dateien selbst ändert die Extension nicht; der Filter „Fehler“ und die Befundliste führen zu den
  Stellen.
- **P4 Zeilenenden nur mit CR.** `detectStyle` erkennt `\r` als Zeilenende; JSON- und Mail-Schreiber finden
  Zeilenanfänge über einen gemeinsamen Helfer, der `\r` kennt. Neue Zeilen in solchen Dateien enden dann mit `\r`.
- **P5 `validKey`.** Die Meldung `invalid-template-key` spricht von Mail-Templates. Solange nur der Mail-Adapter den
  Hook hat, genügt ein Hinweis am Hook; ein zweites Format bräuchte eine eigene Meldung (keine neue Mechanik, YAGNI).
- **P6 Mail-Vorschau (Kern von Task 6.4).** „Mail-Vorschau“ öffnet neben dem Editor einen Tab mit der Mail eines
  Templates in jeder Sprache der Einheit, die Referenz zuerst, so zusammengesetzt wie `MailTemplate.getContent`
  (`<style>` des Templates `stylesheet` aus der Basisdatei, `header`, der Text in `<div class='content'>`, `footer` in
  `<div class='footer'>`, jedes Teil mit Rückfall auf die Basisdatei und auf das Template ohne Kontext), dazu der
  Betreff und ein Hinweis, wo eine Sprache Texte der Basisdatei zeigt. Aufruf über einen Knopf in den Details, das
  Kontextmenü einer Zeile oder Karte (wie Umbenennen und Löschen) und die Befehlspalette (dort mit Auswahl des
  Templates). Ein Knopf je Sprachfeld hätte in der Liste 150 Tabstopps mehr bedeutet; alle Sprachen nebeneinander
  entsprechen dem Wunsch, Sprachfassungen gegenüberzustellen. Der Tab hat keine Skripte (`enableScripts: false`) und
  eine eigene CSP ohne Netzwerk; jede Mail steht in einem `iframe sandbox="" srcdoc`. Er folgt jedem Indexlauf. Die
  CSP des Editors bleibt unverändert; die Nachricht `preview` liest nur und geht deshalb nicht über die
  Key-Befehle, die im eingeschränkten Modus nichts tun. Später: hervorgehobener HTML-Code, Umschalten auf das Theme,
  Vorschau beim Tippen.

### Task O1: Zeilenenden nur mit CR
**Dateien:** Modify `src/core/text/style.ts`, `src/core/text/lineIndex.ts` (`lineStartAt`), `src/core/formats/json/jsonWrite.ts`,
`src/core/formats/mail/mailWrite.ts`; Test: `style.test.ts`, `json.write.test.ts`, `properties.write.test.ts`, `mail.write.test.ts`
**Testfälle:** `detectStyle('a\rb\r')` → `eol: '\r'`, `finalNewline: true`; `insert`/`delete` in einer JSON-, `.properties`- und
Mail-Datei nur mit CR ergeben dasselbe wie in der LF-Datei, nur mit `\r`.
**Commit:** `fix(core): keep carriage-return line endings when writing`

### Task O2: Hinweis am Hook `validKey`
**Dateien:** Modify `src/core/formats/adapter.ts`
**Commit:** `docs(core): say which message a rejected key gets`

### Task O3: Keys der Basisdatei ohne Übersetzbares
**Dateien:** Create `src/core/checks/translatable.ts`; Modify `src/core/checks/rules/missingKeys.ts`; Test: `missingKeys.test.ts`,
`translatable.test.ts`
**Testfälle:** Basis-Key mit `http://example.org/licenses/by/4.0/` fehlt in `de_DE`, `fr_FR` → kein `missing-key`; `fr_FR`
hat ihn → kein `orphan-key`; Basis-Key mit `Password reset` → `missing-key` wie bisher; `{count}`, `1.0` und `<br>`
haben nichts zu übersetzen, `PDF` und `Ja` schon.
**Commit:** `fix(core): leave out base-file keys without text to translate when counting gaps`

### Task O4: Override-Einheiten dünn besetzt
**Dateien:** Modify `src/core/area/areaDefinition.ts`, `parseArea.ts`, `presets.ts`, `src/core/checks/rules/support.ts`,
`missingKeys.ts`, `missingFile.ts`, `package.json` (Schema), `package.nls*.json`; Test: `parseArea.test.ts`, `presets.test.ts`,
`missingKeys.test.ts`, `missingFile.test.ts`, `manifest.test.ts`
**Testfälle:** `mds_override_de_DE` mit einem Key, `mds_override` ohne ihn → kein `missing-key`, kein `missing-file` für
`fr_FR`; `mds` wie bisher; Placeholder-Befunde in der Override-Einheit bleiben; `overrideBundlePattern: '(a+)+'` →
Fehler; ungültiger Ausdruck → Fehler.
**Commit:** `feat(core): treat override bundles as sparse`

### Task O5: Regel `lost-character`
**Dateien:** Create `src/core/checks/rules/lostCharacter.ts`; Modify `rules/index.ts`, `types.ts`, `messages.ts`,
`src/webview/components/findingHints.ts`, `cellStatus.ts`, `package.json` (Schwere), l10n, Doku; Test: `lostCharacter.test.ts`,
`messages.test.ts`, `findingHints.test.ts`
**Testfälle:** `l?apprentissage` und `Gr\uFFFDße` → Befund am Wert; `Quoi ?`, `Warum?` und `?` → keiner;
`<a href="/s?q=x">Suche</a>` und `siehe https://x.org/a?b=c` → keiner (Tag, URL); in jeder Sprache, auch der Referenz.
**Commit:** `feat(core): report characters lost when a file was saved in a narrower encoding`

### Task O6: Mail-Vorschau
**Dateien:** Create `src/core/formats/mail/mailCompose.ts`, `src/extension/panels/mailPreview.ts`,
`src/extension/panels/mailPreviewHtml.ts`, `src/extension/commands/previewMail.ts`; Modify `src/shared/protocol.ts`
(`preview`), `src/shared/viewModel.ts` (`mailPreview`), `src/webview/components/details.tsx`, `keyContext.ts`,
`store.ts`, `editorPanel.ts`, `extension.ts`, `package.json` (Befehl, Kontextmenü), l10n, Doku; Test:
`mail.compose.test.ts`, `mailPreviewHtml.test.ts`, `protocol.test.ts`, `viewModel.test.ts`, `details.test.tsx`,
`table.test.tsx`, `list.test.tsx`, `formats.test.ts` (Integration)
**Testfälle:** Zusammensetzung in der Reihenfolge von `getContent`; fehlender Text in `fr_FR` → Text der Basisdatei;
`name@ctx` nimmt `header@ctx`, sonst `header`; ohne `stylesheet` kein `<style>`; `srcdoc` escapt `& " < >`; jedes `iframe`
hat `sandbox=""` und einen Titel; CSP ohne `script-src` und ohne Netzwerk; `preview` mit ungültigem Key wird
verworfen; Knopf und Kontextmenü nur in Mail-Einheiten; Integration: Vorschau öffnet neben dem Editor, der den Fokus
behält, zeigt alle Sprachen und folgt einem gespeicherten Text.
**Abnahme:** CDP mit der Kopie des Datenordners: Vorschau von `invited` in `de_DE` und `fr_FR`, Stylesheet greift, keine
Netzwerkanfrage.
**Commit:** `feat: preview mail templates beside the editor`

### Task O7: Doku, Review, Abnahme
README, `docs/einstellungen.md`, CHANGELOG (0.3.0), Design (6.4), Abnahmeprotokoll (Abschnitt „Offene Punkte“);
Review-Befunde in eigenen Commits; `npm run test:integration`; Push auf `feat/extension-v1`, CI einmal prüfen.

---

## Phasen 3–8 (Gliederung – Detailtasks folgen vor Phasenstart)

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

**Phase 5 – Metadatasets.** Vorgezogen und ausgearbeitet: siehe „Phasen 5 und 6 (Kern)" oben.
- Schritt 0: `/better-coding-workflow`.
- 5.1 Properties-Codec (Encoding-Erkennung, `\uXXXX`).
- 5.2 Zeilenerhaltender Parser (Fortsetzungen, Escapes, Kommentare, Wächterzeile).
- 5.3 Schreib-Operationen (Trennzeichen und Abstände erhalten, Kopf und Wächterzeile für neue Dateien).
- 5.4 Golden-Tests (UTF-8, Latin-1, CRLF, ohne Newline am Ende) und `check-repo --roundtrip`.
- 5.5 MDS-Preset, Regel `duplicate-key`, Anzeige „default (en)".

**Phase 6 – Mail-Templates.** 6.1–6.3 und 6.6 vorgezogen und ausgearbeitet (siehe oben); 6.4 und 6.5 folgen.
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
  > **Teilweise vorgezogen (26.09.2026):** Das README beschreibt Installation, erste Schritte, Befehle, Tastatur und
  > den geplanten b-api-Schlüssel; `docs/einstellungen.md` ist die Einstellungsreferenz. Offen: das README auf
  > Englisch und ein Nutzerhandbuch.
- 8.2 l10n DE komplett, auch die Meldungen der Einstellungsprüfung im Kern (als Vorlagen mit Argumenten) und die Parser-Codes von `parse-error` in Worten (verschoben aus dem Review Block C/D).
- 8.3 a11y-Audit (`/better-coding-frontend`, Audit-Modus) und Behebungen.
- 8.4 Performance mit dem echten Repo.
- 8.5 Release-Workflow (Tag → VSIX → GitHub Release).
  > **Vorgezogen (26.09.2026):** Ein Tag `v*` durchläuft die CI; danach veröffentlicht der Job `release` die geprüfte
  > VSIX, auch als `edu-sharing-i18n.vsix` für den Link auf die neueste Version. Version je Phase (0.2.0 nach
  > Phase 2), `CHANGELOG.md`, Ablauf in CONTRIBUTING. Seit 0.2.1 gehören Installationsskripte für Windows sowie
  > Linux und macOS zu jeder Release; die CI prüft das Linux-Skript.
- 8.6 Rauchtests in VS Code, Antigravity und Windsurf/Cursor.
