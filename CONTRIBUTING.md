# Mitentwickeln

## Voraussetzungen

- Node.js 22.12 oder neuer (siehe `.nvmrc` und `engines.node`), npm
- VS Code 1.90 oder neuer

## Einrichten

```bash
npm ci
```

Mit **F5** („Run Extension") startet ein Extension Development Host mit einer frischen Kopie des Beispiel-Workspace
`test/fixtures/workspace-basic` unter `out/dev-workspace` (`npm run dev`). Die Extension schreibt Dateien; die
eingecheckten Fixtures bleiben so unberührt.

## Skripte

| Skript | Zweck |
|---|---|
| `npm run build` | bündelt die Extension nach `dist/` (esbuild) |
| `npm run watch` | wie `build`, bei jeder Änderung |
| `npm run dev` | `build` und eine frische Kopie der Fixtures nach `out/dev-workspace` (für F5) |
| `npm run typecheck` | TypeScript-Prüfung ohne Ausgabe |
| `npm run lint` | ESLint inklusive Architekturregeln |
| `npm run format` · `npm run format:check` | Prettier schreiben · prüfen |
| `npm run test:unit` | Unit-Tests (vitest); einzelne Dateien mit `npm run test:unit -- <pfad>` |
| `npm run test:coverage` | Unit-Tests mit Abdeckung und der Schwelle von 90 % (so läuft es in der CI) |
| `npm run test:integration` | Integrationstests in VS Code 1.90.0 und stable, dazu ein Arbeitsbereich mit mehreren Ordnern (`-- --label min`, `stable` oder `multi` für nur ein Profil) |
| `npm run test:perf` | Messung mit echten Dateien (Task 2.17); vorher einmal `node scripts/perf-workspace.mjs <edu-sharing-Checkout>` |
| `npm run package` | erzeugt die VSIX |
| `npm run check:repo -- <checkout>` | prüft einen edu-sharing-Checkout auf der Kommandozeile (nur lesend) |
| `npm run notices` | schreibt `ThirdPartyNotices.txt` neu; nach jeder neuen oder aktualisierten Laufzeitabhängigkeit, ein Test prüft es |

## Architektur

| Ordner | Inhalt | Darf importieren |
|---|---|---|
| `src/core` | Formate, Modell, Prüfregeln, Planung von Änderungen – reines TypeScript ohne VS-Code-, Node- oder DOM-APIs | nur `src/core` |
| `src/extension` | Anbindung an VS Code (Index, Schreiben mit Undo und Sicherungen, Editor-Panel, Befehle, Ansichten) | `src/core`, `src/shared`, `vscode`, Node |
| `src/shared` | Protokoll zwischen Extension und Webview, ViewModel, Filter, Patch | `src/shared`, `src/core` |
| `src/webview` | Oberfläche des Übersetzungseditors (Preact) | `src/shared`, `src/core` |
| `scripts` | Kommandozeilen-Werkzeuge wie `check-repo` | `src/core`, Node |

Die Regeln für `src/core`, `src/shared` und `src/webview` erzwingt ESLint (`no-restricted-imports`, keine DOM-Globals
im Kern). Außerdem: Meldungen des Hosts gehen nur über `src/extension/notify.ts`, weil VS Code `[Text](command:…)` in
Meldungen zu Links macht und Namen aus dem Arbeitsbereich darin stehen.

## Tests

- Unit-Tests liegen unter `test/unit` und spiegeln die Struktur von `src`.
- Integrationstests liegen unter `test/integration` und laufen auf einer Kopie von `test/fixtures/workspace-basic`
  je Profil unter `out/test-workspace`.
- Die Fixtures sind **synthetisch** (edu-sharing steht unter GPL-3.0) und **byte-genau**: `.gitattributes`
  schließt sie von der Zeilenende-Konvertierung aus. Die erwarteten Befunde stehen in `test/fixtures/README.md`.
- Jeder Laufzeittext geht durch `vscode.l10n.t(…)` mit einem String-Literal als erstem Argument (keine Variable,
  nicht die Objektform). Ein Unit-Test sammelt diese Texte über den TypeScript-Syntaxbaum und prüft, dass es für
  jeden eine deutsche Übersetzung in `l10n/bundle.l10n.de.json` gibt.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/) auf Englisch (`feat:`, `fix:`, `test:`, `docs:`,
`build:`, `chore:`), ein logischer Schritt je Commit.

## Release

Die Version folgt den Phasen: `0.<Phase>.<Korrektur>`. Eine Release entsteht aus einem Tag auf `main`:

1. Die Version anheben und `CHANGELOG.md` ergänzen, beides per Pull Request nach `main`.
   `npm version <x.y.z> --no-git-tag-version` passt `package.json` und `package-lock.json` an.
2. Ist die CI auf `main` grün, den Stand taggen und den Tag pushen:

   ```bash
   git tag -a v<x.y.z> -m "edu-sharing i18n <x.y.z>"
   git push origin v<x.y.z>
   ```

3. Die CI prüft den Tag wie jeden Stand. Sind beide Systeme grün, veröffentlicht der Job `release` die geprüfte VSIX
   als GitHub-Release.
   - Sie erscheint zweimal: mit der Version im Namen und als `edu-sharing-i18n.vsix`. Unter diesem Namen führt
     `…/releases/latest/download/edu-sharing-i18n.vsix` immer zur neuesten, wie es das README beschreibt.
   - Passt der Tag nicht zur Version in `package.json`, bricht der Job ab, ohne etwas zu veröffentlichen.
   - Die Installationsskripte `scripts/install.ps1` und `scripts/install.sh` gehen mit in die Release. Die CI prüft
     `install.sh` bei jedem Lauf unter Linux mit der frisch gebauten VSIX. `install.ps1` hat keinen CI-Test; es nach
     Änderungen unter Windows mit `EDU_I18N_EDITORS` auf einen Editor mit eigenem Profil ausprobieren.

## Bekannte Hinweise

`npm audit` meldet Schwachstellen in `mocha` (über `@vscode/test-cli`: `diff`, `serialize-javascript`).
Sie betreffen nur den lokalen Testlauf und landen nicht in der VSIX.
Die CI prüft deshalb nur die Laufzeitabhängigkeiten (`npm audit --omit=dev`), und Dependabot schlägt
Aktualisierungen der Pakete und der gepinnten Actions vor.

Einige Updates schlägt Dependabot bewusst nicht vor (`.github/dependabot.yml`):
- `@types/vscode`: Es folgt von Hand `engines.vscode`, also der ältesten unterstützten VS-Code-Version.
- Major-Updates von `@types/node`: Die Typen gehören zum Node der Werkzeuge (`engines.node`, `.nvmrc`: 22), das
  vitest verlangt. Die Extension selbst läuft auf dem Node von VS Code (in 1.90: Node 20).
- Major-Updates von TypeScript: Sie warten, bis `typescript-eslint` sie unterstützt.
- `actions/upload-artifact` und `actions/download-artifact` kommen nur gemeinsam, weil der Release-Job lädt, was der
  Build hochgeladen hat.
