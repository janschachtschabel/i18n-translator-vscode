# edu-sharing i18n – VS-Code-Extension

Übersetzungsdateien von [edu-sharing](https://github.com/edu-sharing/edu-sharing-community-repository) in VS Code
**prüfen und bearbeiten**: Angular-JSON unter `Frontend/src/assets/i18n`.

> **Status:** in Entwicklung, Phase 2 von 8 ist abgeschlossen (Prüfen und Bearbeiten). Noch nicht für den produktiven
> Einsatz gedacht: bitte auf einer Kopie oder in einem Git-Arbeitsstand testen, dessen Änderungen sich zurücknehmen
> lassen.

## Was die Extension kann

**Prüfen.** Beim Öffnen eines Arbeitsbereichs mit `common/de.json` sucht die Extension die Übersetzungsordner und
prüft sie:
- fehlende Keys und Sprachdateien;
- Platzhalter und HTML-Tags, die von der Referenzsprache abweichen, und kaputte Platzhalter;
- leere Texte;
- Sprachvarianten (`de-informal`, `de-no-binnen-i`);
- Keys, die eine andere Einheit überschreibt;
- verwaiste oder vermutlich verschobene Keys;
- Texte, die mit der Referenz übereinstimmen.

Die Befunde stehen in der Ansicht „Probleme", in der Seitenleiste „edu-sharing i18n" (je Bereich und Einheit mit
Zählern) und in der Statusleiste.

**Bearbeiten.** Der Übersetzungseditor zeigt eine Einheit (etwa `common`) als Tabelle oder, in schmalen Fenstern,
als Liste:
- einen Text bearbeiten und speichern, mit Prüfung beim Tippen;
- filtern und suchen, Sprachen aus- und einblenden;
- die Details eines Keys mit Erklärungen und Hinweisen zu jedem Befund;
- Keys hinzufügen, umbenennen und löschen; Sprachen hinzufügen.

**Daten sicher halten.**
- Geschrieben wird nur, was sich ändert: Eine Zelle ändert genau eine Zeile. Einrückung, Zeilenenden und Reihenfolge
  der Datei bleiben.
- Eine Datei mit ungespeicherten Änderungen in einem Editor wird nie überschrieben.
- Hat sich ein Text außerhalb des Editors geändert, fragt der Editor, welcher gilt.
- Ein geleerter Text wird nach Rückfrage in dieser Sprache gelöscht, damit der Rückfall auf die Referenz greift.
- **Rückgängig:** Strg+Z im Editor oder der Befehl „Letzte Änderung an Übersetzungsdateien rückgängig machen".
  Betrifft die letzte Änderung eine andere Einheit, fragt der Editor vorher nach.
- **Sicherungen:** vor der ersten Änderung einer Sitzung, vor Änderungen mehrerer Einheiten und alle 10 Minuten
  während der Arbeit. Sie liegen im Speicher der Extension für diesen Arbeitsbereich, nie im Repository; die letzten
  10 bleiben. Zurückholen mit „Übersetzungsdateien aus einer Sicherung wiederherstellen…".
- Im eingeschränkten Modus (nicht vertrauenswürdiger Arbeitsbereich) lässt sich nur prüfen und ansehen, nichts
  schreiben.

## Installation

1. Die VSIX-Datei aus dem Artefakt „vsix" eines CI-Laufs herunterladen oder selbst bauen (`npm run package`).
2. In VS Code „Extensions: Install from VSIX…" ausführen, oder: `code --install-extension edu-sharing-i18n-0.0.1.vsix`.

Voraussetzung: VS Code 1.90 oder neuer. Die Oberfläche folgt der Sprache von VS Code (Deutsch oder Englisch).

## Befehle

Alle in der Befehlspalette unter „edu-sharing i18n":

| Befehl | Zweck |
|---|---|
| Übersetzungseditor öffnen… | eine Einheit wählen und im Editor öffnen |
| Übersetzungen prüfen | alle Übersetzungsordner neu einlesen und prüfen |
| Übersetzungsordner festlegen… | die Ordner selbst wählen, wenn die Erkennung sie nicht findet |
| Key hinzufügen… · Key umbenennen… · Key löschen… | Keys in allen Sprachen einer Einheit; mit Rückfragen |
| Sprache hinzufügen… | eine Sprachdatei je Einheit anlegen (leer, der Rückfall greift) |
| Letzte Änderung an Übersetzungsdateien rückgängig machen | das letzte Schreiben dieser Sitzung zurücknehmen |
| Übersetzungsdateien jetzt sichern | eine Sicherung von Hand |
| Übersetzungsdateien aus einer Sicherung wiederherstellen… | eine Sicherung wählen und zurückholen; der aktuelle Stand wird vorher gesichert |

## Tastatur im Editor

| Taste | Wirkung |
|---|---|
| Pfeile, Pos1/Ende, Bild↑/↓, Strg+Pos1/Ende | in der Tabelle bewegen |
| Enter oder F2 | Text bearbeiten |
| Enter · Strg+Enter | speichern (Strg+Enter bei mehrzeiligen Texten; dort beginnt Enter eine neue Zeile) |
| Tab · Umschalt+Tab | speichern und die nächste bzw. vorige Zelle bearbeiten |
| Esc | Bearbeitung abbrechen |
| F2 · Entf (Mac: Cmd+Rücktaste) in der Key-Spalte | Key umbenennen · löschen |
| Alt+↓ · Alt+↑ | zum nächsten bzw. vorigen Befund |
| Strg+F · Alt+M | zur Suche · nur Keys mit fehlenden Texten |
| Strg+Z (außerhalb von Textfeldern) | letzte Änderung zurücknehmen |

## Einstellungen

| Einstellung | Standard | Bedeutung |
|---|---|---|
| `eduI18n.referenceLanguage` | `de` | Sprache, mit der verglichen wird |
| `eduI18n.baseFileLanguage` | `en` | Sprache der Dateien ohne Sprachsuffix |
| `eduI18n.areas` | `[]` | eigene Übersetzungsbereiche oder Ersatz eines eingebauten |
| `eduI18n.roots` | `{}` | feste Wurzelordner je Bereich; ohne Eintrag erkennt die Extension sie |
| `eduI18n.exclude` | `node_modules`, `.git`, `dist`, `out` u. a. | Ordner, die nie durchsucht werden |
| `eduI18n.variants` | `de-informal`, `de-no-binnen-i` | dünn besetzte Sprachvarianten und ihre Regeln |
| `eduI18n.checks.severity` | `{}` | Schweregrad je Prüfregel (`error`, `warning`, `info`, `off`) |
| `eduI18n.checks.ignoreSameAsReference` | `OK`, `E-Mail`, `CC-0`, `ID` | Texte, die wie die Referenz lauten dürfen |
| `eduI18n.diagnostics.missing` | `aggregate` | fehlende Keys in „Probleme": je Datei, je Key oder gar nicht |
| `eduI18n.backup.intervalMinutes` | `10` | Abstand der Sicherungen während der Arbeit (`0`: nur die festen Anlässe) |
| `eduI18n.backup.keep` | `10` | Anzahl der aufbewahrten Sicherungen |

`areas`, `variants` und `roots` aus den Einstellungen des Arbeitsbereichs gelten erst, wenn der Arbeitsbereich
vertrauenswürdig ist.

Grenzen: Die Extension erkennt höchstens 20 Wurzeln je Bereich und Arbeitsbereichsordner (mehr lassen sich in
`eduI18n.roots` festlegen), prüft keine Wurzel mit mehr als 5.000 Dateien und liest keine Übersetzungsdatei über 5 MB.
Reguläre Ausdrücke aus den Einstellungen dürfen höchstens 1.000 Zeichen lang sein und keine wiederholte Gruppe haben,
die mit einem wiederholten Teil beginnt, wie `(a+)+`.

## Protokoll

Ausgabe → „edu-sharing i18n" zeigt, was die Extension einliest, prüft und schreibt, mit Dauer, aber ohne Texte der
Dateien. Mehr Einzelheiten: „Developer: Set Log Level…" für diesen Kanal.

## Geplant

Phase 3 bis 8 laut [Taskliste](docs/plans/2026-09-24-edu-sharing-i18n-vscode-tasks.md):
- Füllen aus einem Übersetzungsspeicher oder per KI (b-api), immer mit Prüfliste;
- Import und Export (CSV, JSON);
- Metadataset-`.properties` und Mail-Templates;
- Kontext, Review-Status und eine Übersicht;
- Release über GitHub.

Das [Design-Dokument](docs/plans/2026-09-24-edu-sharing-i18n-vscode-design.md) beschreibt den vollen Umfang, die
Abnahmen stehen unter [`docs/verification`](docs/verification).

## Mitentwickeln

Siehe [CONTRIBUTING.md](CONTRIBUTING.md).

## English

A VS Code extension to check and edit the translation files of edu-sharing (Angular JSON): findings in the Problems
panel, a translation editor with table and list, writes that change only the edited line, undo and backups. Work in
progress (phase 2 of 8); filling, import/export, `.properties` and mail templates follow. The design documents are
in German.

## Lizenz

[Apache-2.0](LICENSE). Die Extension bündelt Pakete Dritter; ihre Lizenzen stehen in
[ThirdPartyNotices.txt](ThirdPartyNotices.txt).
