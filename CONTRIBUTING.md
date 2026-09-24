# Mitentwickeln

## Voraussetzungen

- Node.js 22 (siehe `.nvmrc`), npm
- VS Code 1.90 oder neuer

## Einrichten

```bash
npm ci
```

Mit **F5** („Run Extension") startet ein Extension Development Host mit dem Beispiel-Workspace
`test/fixtures/workspace-basic`.

## Skripte

| Skript | Zweck |
|---|---|
| `npm run build` | bündelt die Extension nach `dist/` (esbuild) |
| `npm run watch` | wie `build`, bei jeder Änderung |
| `npm run typecheck` | TypeScript-Prüfung ohne Ausgabe |
| `npm run lint` | ESLint inklusive Architekturregeln |
| `npm run test:unit` | Unit-Tests (vitest) |
| `npm run test:integration` | Integrationstests in VS Code 1.90.0 und stable (`-- --label min` bzw. `-- --label stable` für nur eine Version) |
| `npm run package` | erzeugt die VSIX |

## Architektur

| Ordner | Inhalt | Darf importieren |
|---|---|---|
| `src/core` | Formate, Modell, Prüfregeln, Füllen, Import/Export – reines TypeScript ohne VS-Code-, Node- oder DOM-APIs | nur `src/core` |
| `src/extension` | Anbindung an VS Code (Befehle, Ansichten, Dateizugriff) | `src/core`, `src/shared`, `vscode`, Node |
| `src/shared` | Nachrichtentypen zwischen Extension und Webview (ab Phase 2) | nur `src/shared` |
| `src/webview` | Oberfläche der Webview (ab Phase 2) | `src/shared`, `src/core` |
| `scripts` | Kommandozeilen-Werkzeuge wie `check-repo` | `src/core`, Node |

Die Regeln für `src/core` und `src/webview` erzwingt ESLint (`no-restricted-imports`, keine DOM-Globals im Kern).

## Tests

- Unit-Tests liegen unter `test/unit` und spiegeln die Struktur von `src`.
- Integrationstests liegen unter `test/integration` und laufen gegen `test/fixtures/workspace-basic`.
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
