# edu-sharing i18n – VS-Code-Extension

Übersetzungsdateien von [edu-sharing](https://github.com/edu-sharing/edu-sharing-community-repository) direkt in
VS Code **prüfen, füllen, importieren und exportieren**: Angular-JSON (`Frontend/src/assets/i18n`),
Metadataset-`.properties` und Mail-Templates.

> **Status:** in Entwicklung. Phase 0 (Projektgerüst) ist abgeschlossen, Phase 1 (Prüfen) folgt.
> Noch nicht für den produktiven Einsatz gedacht.

## Installation

1. Die VSIX-Datei aus dem CI-Artefakt bzw. einem GitHub Release herunterladen.
2. In VS Code den Befehl „Extensions: Install from VSIX…" ausführen.
   Das funktioniert auch in Windsurf, Cursor und Antigravity.

Voraussetzung: VS Code 1.90 oder neuer.

## Geplanter Funktionsumfang

- **Prüfen:** fehlende Keys und Dateien, falsche oder kaputte Platzhalter, leere Werte, Sprachvarianten
  (`de-informal`, `de-no-binnen-i`), überschriebene Keys; Ergebnisse im Problems-Panel.
- **Füllen:** aus einem Übersetzungsspeicher oder per KI über die b-api, immer mit Prüfliste vor dem Schreiben.
- **Import und Export:** CSV, JSON, `.properties` und Mail-XML, Import direkt aus der geöffneten Datei.
- Barrierearm (Ziel WCAG 2.2 AA), folgt dem Farbschema von VS Code (hell, dunkel, hoher Kontrast).

Details stehen im [Design-Dokument](docs/plans/2026-09-24-edu-sharing-i18n-vscode-design.md) und in der
[Taskliste](docs/plans/2026-09-24-edu-sharing-i18n-vscode-tasks.md).

## Mitentwickeln

Siehe [CONTRIBUTING.md](CONTRIBUTING.md).

## English

A VS Code extension to check, fill, import and export the translation files of edu-sharing (Angular JSON,
metadataset `.properties`, mail templates). Work in progress; the design documents are in German.

## Lizenz

[Apache-2.0](LICENSE)
