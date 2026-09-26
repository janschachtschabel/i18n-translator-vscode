# Änderungen

Die nennenswerten Änderungen der Extension je Version. Die Version folgt den Phasen der
[Taskliste](docs/plans/2026-09-24-edu-sharing-i18n-vscode-tasks.md): `0.<Phase>.<Korrektur>`. Die Installation
beschreibt das [README](README.md#installation).

## 0.2.2 – 26.09.2026

- **Fenster ohne Ordner:**
  - Die Seitenleiste bittet darum, einen Ordner zu öffnen: einen edu-sharing-Checkout oder dessen Übersetzungsordner.
    Bisher meldete sie „keine Übersetzungsdateien gefunden“.
  - „Übersetzungsordner festlegen…“ sagt dort, was zu tun ist, und bietet „Ordner öffnen…“ an. Bisher geschah nichts.
- **Übersetzungsordner direkt öffnen:** Ein Ordner wie `Frontend/src/assets/i18n` oder eine Kopie davon funktioniert
  als Arbeitsbereichsordner. Das ging schon vorher; jetzt prüft es ein Integrationstest.

## 0.2.1 – 26.09.2026

Die Extension selbst ist unverändert; neu ist, wie sie auf den Rechner kommt.

- **Installationsskripte** für Windows (auch aus cmd.exe) sowie für Linux und macOS laden die VSIX der neuesten
  Release und installieren sie in jeden gefundenen Editor: VS Code, Insiders, VSCodium, Cursor, Windsurf. Jede Release
  enthält die Skripte; das [README](README.md#installation) nennt die Einzeiler.
- **Dependabot** schlägt nur noch Updates vor, die zur unterstützten VS-Code-Version und zu den Werkzeugen passen.

## 0.2.0 – 26.09.2026

Die erste veröffentlichte Version prüft und bearbeitet die Angular-JSON-Übersetzungen von edu-sharing. Sie ist eine
Vorabversion (Phase 2 von 8): bitte auf einem Git-Arbeitsstand testen, dessen Änderungen sich zurücknehmen lassen.

- **Prüfen:**
  - Die Extension erkennt die Übersetzungsordner und prüft sie nach jeder Änderung neu.
  - 18 Prüfregeln: fehlende Keys und Sprachdateien, Platzhalter, HTML-Tags, leere Texte, Sprachvarianten,
    überschriebene und vermutlich verschobene Keys, Texte wie die Referenz.
  - Die Befunde stehen in „Probleme“, in der Seitenleiste und in der Statusleiste.
- **Bearbeiten:**
  - Übersetzungseditor als Tabelle oder Liste, mit Filter, Suche, Details und Prüfung beim Tippen.
  - Keys hinzufügen, umbenennen und löschen; Sprachen hinzufügen.
- **Daten sicher halten:**
  - Schreiben ändert nur die betroffene Zeile.
  - Texte, die sich außerhalb des Editors geändert haben, erkennt der Editor als Konflikt.
  - Rückgängig, automatische Sicherungen mit Wiederherstellen.
  - Nicht gespeicherte Texte bleiben erhalten.
  - Im eingeschränkten Modus nur lesend.
- **Bedienung:** vollständig per Tastatur, mit Ansagen für Screenreader; Oberfläche auf Deutsch und Englisch.
- **Sicherheit:** umgesetzt sind die Befunde des [Audits vom 26.09.2026](docs/audits/2026-09-26-audit.md), unter
  anderem:
  - Grenzen für Wurzeln, Dateien und Dateigrößen;
  - kein Lesen oder Schreiben über symbolische Verknüpfungen;
  - Schutz vor riskanten regulären Ausdrücken in Einstellungen.
