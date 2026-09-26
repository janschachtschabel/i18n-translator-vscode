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
| `npm run test:integration` | Integrationstests in VS Code 1.90.0 und stable (`-- --label min` bzw. `-- --label stable` für nur eine Version) |
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

## Bekannte Hinweise

`npm audit` meldet Schwachstellen in `mocha` (über `@vscode/test-cli`: `diff`, `serialize-javascript`).
Sie betreffen nur den lokalen Testlauf und landen nicht in der VSIX.
Die CI prüft deshalb nur die Laufzeitabhängigkeiten (`npm audit --omit=dev`), und Dependabot schlägt
Aktualisierungen der Pakete und der gepinnten Actions vor.
