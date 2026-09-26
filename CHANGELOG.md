# Änderungen

Die nennenswerten Änderungen der Extension je Version. Die Version zählt die Ausbaustufen: `0.<Stufe>.<Korrektur>`.
Bis 0.2 entsprach die Stufe der Phase der [Taskliste](docs/plans/2026-09-24-edu-sharing-i18n-vscode-tasks.md); seit die
Phasen 5 und 6 vorgezogen sind, zählt sie weiter, ohne die Phase zu nennen. Die Installation beschreibt das
[README](README.md#installation).

## 0.3.0 – 26.09.2026

Metadatasets und Mail-Templates kommen hinzu, vorgezogen vor Füllen und Import/Export. Ein edu-sharing-Checkout oder
ein Datenordner wie der der alten i18n-App (`data/1.0.0/` mit `json/`, `metadatasets/i18n/` und `mailtemplates/`)
zeigt jetzt alle drei Bereiche, jeden im selben Editor mit einer Spalte je Sprache.

- **Metadatasets (`.properties`):**
  - Eine Einheit je Gruppe (`mds`, `valuespaces_i18n`, …), Referenz `de_DE`. Die Datei ohne Sprachkürzel heißt im
    Editor `default (en)`.
  - Gelesen wie von Java, mit Fortsetzungszeilen, Escapes und Kommentaren; doppelte Keys werden gemeldet.
  - Jede Datei behält ihr Encoding. Zeichen, die ISO-8859-1 nicht kennt, schreibt die Extension dort als `\uXXXX`.
  - Platzhalter mit einer Klammer (`{user}`) prüft sie als Platzhalter.
  - Die Wächterzeile am Anfang der Hauptdateien bleibt verborgen und an erster Stelle; neue Sprachdateien beginnen
    mit ihr, so wie die Referenz sie schreibt.
  - Beginnt eine Datei mit einer Byte-Order-Mark, meldet die neue Regel `bom-first-key` ihren ersten Key: Java liest
    die Marke als Teil dieses Keys und findet ihn nie.
- **Mail-Templates (XML):**
  - Eine Einheit `templates`, je Template eine Zeile für den Betreff und eine für die Nachricht.
  - Fehlt einer Sprache ein Feld oder ein ganzes Template, legt das Füllen der Zelle es an der Stelle der Referenz an.
  - Geschrieben wird nur der geänderte Text; CDATA, das Stylesheet, Kommentare und Einrückung bleiben.
  - Texte mit Zeichen, die XML nicht erlaubt (etwa ein aus Folien kopierter vertikaler Tabulator), lehnt der Editor ab:
    edu-sharing könnte sonst keine Mail dieser Sprache mehr lesen.
  - Die Kodierung aus der XML-Deklaration gilt, wie für Java.
- **Lücken gegenüber der Basisdatei:** Einen Key, den nur die Datei ohne Sprachkürzel hat, meldet die Extension als
  fehlend in jeder Sprache ohne ihn, die Referenz eingeschlossen; dort erscheint zur Laufzeit der englische Text.
- **Neue Sprache:** Die Abfrage schlägt einen Code in der Form des Bereichs vor (`es` oder `es_ES`).
- **Eigene Bereiche:** die Formate `properties` und `mail-xml` sowie die Felder `ignoredKeys` und `placeholderSyntax`,
  siehe [Einstellungen](docs/einstellungen.md#edui18nareas).
- **Geprüft gegen edu-sharing:** Alle 116 Übersetzungsdateien des Repositorys lassen sich lesen und byte-gleich
  zurückschreiben, und jeder Text, auf sich selbst gesetzt, liest sich gleich zurück
  (`npm run check:repo -- <Checkout> --roundtrip`).
- **Fenster ohne Ordner** (vorgesehen als 0.2.2, das nicht erschien):
  - Die Seitenleiste bittet darum, einen Ordner zu öffnen: einen edu-sharing-Checkout oder dessen Übersetzungsordner.
    Bisher meldete sie „keine Übersetzungsdateien gefunden“.
  - „Übersetzungsordner festlegen…“ sagt dort, was zu tun ist, und bietet „Ordner öffnen…“ an. Bisher geschah nichts.
  - Ein Übersetzungsordner wie `Frontend/src/assets/i18n` oder eine Kopie davon funktioniert als
    Arbeitsbereichsordner; das ging schon vorher, jetzt prüft es ein Integrationstest.

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
