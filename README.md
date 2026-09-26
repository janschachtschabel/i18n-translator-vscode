# edu-sharing i18n – VS-Code-Extension

Übersetzungsdateien von [edu-sharing](https://github.com/edu-sharing/edu-sharing-community-repository) in VS Code
**prüfen und bearbeiten**: Angular-JSON unter `Frontend/src/assets/i18n`.

> **Status:** in Entwicklung, Phase 2 von 8 ist abgeschlossen (Prüfen und Bearbeiten). Noch nicht für den produktiven
> Einsatz gedacht: bitte auf einer Kopie oder in einem Git-Arbeitsstand testen, dessen Änderungen sich zurücknehmen
> lassen.

## Was die Extension kann

**Prüfen.** Beim Öffnen eines Arbeitsbereichs mit `common/de.json` sucht die Extension die Übersetzungsordner und
prüft sie auf:
- fehlende Keys und Sprachdateien;
- Platzhalter und HTML-Tags, die von der Referenzsprache abweichen, und kaputte Platzhalter;
- leere Texte;
- Sprachvarianten (`de-informal`, `de-no-binnen-i`);
- Keys, die eine andere Einheit überschreibt;
- verwaiste oder vermutlich verschobene Keys;
- Texte, die mit der Referenz übereinstimmen.

Die Befunde stehen an drei Stellen:
- in der Ansicht „Probleme“;
- in der Seitenleiste „edu-sharing i18n“, je Bereich und Einheit mit Zählern;
- in der Statusleiste.

**Bearbeiten.** Der Übersetzungseditor zeigt eine Einheit (etwa `common`) als Tabelle oder, in schmalen Fenstern,
als Liste:
- einen Text bearbeiten und speichern, mit Prüfung beim Tippen;
- filtern und suchen, Sprachen aus- und einblenden;
- die Details eines Keys mit Erklärungen und Hinweisen zu jedem Befund;
- Keys hinzufügen, umbenennen und löschen; Sprachen hinzufügen.

**Daten sicher halten.**
- **Nur das Nötige schreiben:** Eine Zelle ändert genau eine Zeile. Einrückung, Zeilenenden und Reihenfolge der
  Datei bleiben.
- **Offene Editoren respektieren:** Eine Datei mit ungespeicherten Änderungen in einem Editor wird nie
  überschrieben.
- **Konflikte:** Hat sich ein Text außerhalb des Editors geändert, fragt der Editor, welcher gilt.
- **Leeren heißt löschen:** Ein geleerter Text wird nach Rückfrage in dieser Sprache gelöscht, damit der Rückfall auf
  die Referenz greift.
- **Nichts Getipptes geht verloren:** Ein Text, der nicht gespeichert werden konnte oder beim Schließen des Editors
  noch in Bearbeitung war, bleibt je Einheit erhalten. Beim nächsten Öffnen steht er wieder als „nicht gespeichert“
  in seiner Zelle.
- **Rückgängig:** Strg+Z im Editor oder der Befehl „Letzte Änderung an Übersetzungsdateien rückgängig machen“.
  Betrifft die letzte Änderung eine andere Einheit, fragt der Editor vorher nach.
- **Sicherungen:**
  - Wann: vor der ersten Änderung einer Sitzung, vor Änderungen mehrerer Einheiten und alle 10 Minuten während der
    Arbeit.
  - Wo: im Speicher der Extension für diesen Arbeitsbereich, nie im Repository; die letzten 10 bleiben.
  - Zurückholen: „Übersetzungsdateien aus einer Sicherung wiederherstellen…“.
- **Eingeschränkter Modus:** In einem nicht vertrauenswürdigen Arbeitsbereich lässt sich nur prüfen und ansehen,
  nichts schreiben.

## Installation

Voraussetzung ist VS Code 1.90 oder neuer unter Windows, macOS oder Linux. Die Extension steht nicht im Marketplace:
Jede [Release auf GitHub](https://github.com/janschachtschabel/i18n-translator-vscode/releases/latest) enthält sie als
Datei `edu-sharing-i18n.vsix`. Die Oberfläche folgt der Sprache von VS Code (Deutsch oder Englisch).

### Direkt von GitHub

Ein Installationsskript lädt die vorkompilierte VSIX der neuesten Release und installiert sie in jeden Editor, den es
findet: VS Code, VS Code Insiders, VSCodium, Cursor und Windsurf.

**Windows:** Die Zeile funktioniert in PowerShell, in der Eingabeaufforderung (cmd) und im Ausführen-Dialog (Win+R):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://github.com/janschachtschabel/i18n-translator-vscode/releases/latest/download/install.ps1 | iex"
```

**Linux und macOS:** im Terminal, ohne `sudo`:

```bash
curl -fsSL https://github.com/janschachtschabel/i18n-translator-vscode/releases/latest/download/install.sh | bash
```

Danach in schon offenen VS-Code-Fenstern „Developer: Reload Window“ ausführen und einen edu-sharing-Checkout öffnen.

Was die Skripte tun und wie man sie steuert:
- **Editoren finden:** über ihren Befehl im PATH (`code`, `code-insiders`, `codium`, `cursor`, `windsurf`). Unter
  Windows finden sie VS Code, Insiders und VSCodium auch in deren Standardordnern.
- **Nur bestimmte Editoren:** vorher `EDU_I18N_EDITORS` setzen.
  - PowerShell: `$env:EDU_I18N_EDITORS = 'code'`, dann die Zeile oben.
  - Linux und macOS: `… | EDU_I18N_EDITORS=code bash`.
- **Eine schon heruntergeladene VSIX:** direkt installieren, etwa aus dem Download-Ordner:

  ```powershell
  code --install-extension "$env:USERPROFILE\Downloads\edu-sharing-i18n.vsix"
  ```

- **Vorher lesen:** [install.ps1](scripts/install.ps1) und [install.sh](scripts/install.sh) liegen im Repository und bei
  jeder Release.
- **Eine heruntergeladene `install.ps1`:** `.\install.ps1` startet sie nicht, denn Windows markiert Downloads als aus
  dem Internet, und mit der üblichen Ausführungsrichtlinie `RemoteSigned` führt PowerShell solche nicht signierten
  Skripte nicht aus. So geht es:

  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\install.ps1"
  ```

**Ohne Skript**, im Browser:
1. Die [neueste VSIX](https://github.com/janschachtschabel/i18n-translator-vscode/releases/latest/download/edu-sharing-i18n.vsix)
   herunterladen.
2. In VS Code die Ansicht „Erweiterungen“ öffnen (Strg+Umschalt+X).
3. Im Menü „…“ oben in der Ansicht „Aus VSIX installieren…“ („Install from VSIX…“) wählen und die heruntergeladene
   Datei angeben.

Gut zu wissen:
- **Aktualisieren:** denselben Weg noch einmal gehen; die neue Version ersetzt die alte. Was sich geändert hat, steht
  im [CHANGELOG](CHANGELOG.md).
- **Entfernen:** in der Ansicht „Erweiterungen“ „Deinstallieren“ wählen.
- **Wo die Erweiterung ist:**
  - In VS Code steht sie in der Ansicht „Erweiterungen“ (Strg+Umschalt+X) unter „Installiert“ als „edu-sharing i18n“.
  - Im Terminal zeigt `code --list-extensions --show-versions` die Zeile `janschachtschabel.edu-sharing-i18n@<Version>`.
  - Ihr Symbol erscheint in der Aktivitätsleiste links. Übersetzungen zeigt die Seitenleiste erst in einem Ordner mit
    `common/de.json`.
  - War VS Code beim Installieren offen, einmal „Developer: Reload Window“ ausführen.
- **Eigene VS-Code-Profile:** Die Kommandozeile installiert ins Standardprofil. Für ein anderes Profil die VSIX dort
  über „Aus VSIX installieren…“ installieren oder die Erweiterung über ihr Zahnradmenü auf alle Profile anwenden.
- **Kein Editor gefunden:** Unter macOS in VS Code „Shell Command: Install 'code' command in PATH“ ausführen. Unter
  Windows und Linux richtet die Installation von VS Code den Befehl ein; sonst den Weg im Browser nehmen.
- **VS-Code-Forks** wie Windsurf oder Cursor installieren die VSIX genauso. Getestet ist die Extension dort nicht.
- **Eine bestimmte Version:** Alle Versionen stehen unter
  [Releases](https://github.com/janschachtschabel/i18n-translator-vscode/releases), jeweils auch mit der Version im
  Dateinamen.

### Andere Wege

- **Selbst bauen** (mit Node.js 22.12 oder neuer):

  ```bash
  git clone https://github.com/janschachtschabel/i18n-translator-vscode.git
  cd i18n-translator-vscode
  npm ci
  npm run package
  ```

  Danach liegt `edu-sharing-i18n-<Version>.vsix` im Ordner; installieren wie oben.
- **Ohne Installation ausprobieren:** das Repository in VS Code öffnen, einmal `npm ci` ausführen und **F5** drücken.
  Es öffnet sich ein zweites Fenster („Extension Development Host“) mit einer frischen Kopie der Beispieldaten unter
  `out/dev-workspace`. Änderungen dort berühren nichts Eingechecktes.
- **Aus der CI:** Jeder Lauf des Workflows „CI“ legt die VSIX als Artefakt „vsix“ ab. Zum Herunterladen braucht es eine
  Anmeldung bei GitHub.

## Erste Schritte

1. **Repository öffnen:** den Ordner eines edu-sharing-Checkouts öffnen („Datei“ → „Ordner öffnen…“).
   - Die Extension startet, sobald der Arbeitsbereich eine Datei `common/de.json` enthält.
   - Dann sucht sie die Übersetzungsordner, bei edu-sharing `Frontend/src/assets/i18n`.
2. **Vertrauen:** Fragt VS Code, ob man den Autoren der Dateien vertraut, „Ja“ wählen. Nur in einem
   vertrauenswürdigen Arbeitsbereich schreibt die Extension; im eingeschränkten Modus prüft und zeigt sie nur.
3. **Befunde ansehen:**
   - **Seitenleiste:** Das Symbol „edu-sharing i18n“ in der Aktivitätsleiste öffnet die Ansicht „Bereiche“. Sie
     zeigt Bereich, Übersetzungsordner und Einheiten (`common`, `admin`, …) mit ihren Zählern.
   - **Probleme** (Strg+Umschalt+M): die Befunde je Datei; ein Klick springt an die Stelle.
   - **Statusleiste:** `i18n` mit der Zahl der Fehler und Warnungen; ein Klick öffnet die Seitenleiste.
   - **Nichts gefunden:** Dann bietet die Seitenleiste „Ordner festlegen“ an (siehe [Befehle](#befehle)).
4. **Editor öffnen:** eine Einheit in der Seitenleiste anklicken oder in der Befehlspalette (Strg+Umschalt+P)
   „edu-sharing i18n: Übersetzungseditor öffnen…“ wählen.
   - Die Einheit erscheint als Tabelle, mit dem Key und einer Spalte je Sprache.
   - In schmalen Fenstern erscheint sie als Liste.
5. **Text bearbeiten:** eine Zelle wählen, Enter oder F2 drücken, tippen und mit Enter speichern. Bei mehrzeiligen
   Texten speichert Strg+Enter; Esc bricht ab.
   - Der Editor prüft schon beim Tippen, etwa Platzhalter und HTML-Tags.
   - Er schreibt nur die geänderte Zeile.
   - Ein geleerter Text wird nach Rückfrage in dieser Sprache gelöscht; dann erscheint der Text der Referenz.
6. **Keys und Sprachen:**
   - Kontextmenü der Key-Spalte: Key hinzufügen, umbenennen oder löschen, Sprache hinzufügen.
   - Schaltflächen in der Titelleiste des Editors: Key oder Sprache hinzufügen.
   - Kontextmenü einer Einheit in der Seitenleiste: Key oder Sprache hinzufügen, dazu „Im Explorer zeigen“.
7. **Zurücknehmen:** Strg+Z im Editor nimmt die letzte Änderung zurück. Ältere Stände holt
   „Übersetzungsdateien aus einer Sicherung wiederherstellen…“ zurück.

## Befehle

In der Befehlspalette unter „edu-sharing i18n“:

| Befehl | Zweck |
|---|---|
| Übersetzungseditor öffnen… | eine Einheit wählen und im Editor öffnen |
| Übersetzungen prüfen | alle Übersetzungsordner neu einlesen und prüfen |
| Übersetzungsordner festlegen… | die Ordner selbst wählen, wenn die Erkennung sie nicht findet; speichert `eduI18n.roots` für den Arbeitsbereichsordner (nur in einem vertrauenswürdigen Arbeitsbereich) |
| Key hinzufügen… | einen Key in allen Sprachen einer Einheit anlegen, mit Rückfragen |
| Sprache hinzufügen… | eine Sprachdatei je Einheit anlegen (leer, der Rückfall greift) |
| Letzte Änderung an Übersetzungsdateien rückgängig machen | das letzte Schreiben dieser Sitzung zurücknehmen |
| Übersetzungsdateien jetzt sichern | eine Sicherung von Hand |
| Übersetzungsdateien aus einer Sicherung wiederherstellen… | eine Sicherung wählen und zurückholen; der aktuelle Stand wird vorher gesichert |

„Key umbenennen…“ und „Key löschen…“ gibt es nur im Editor: im Kontextmenü der Key-Spalte oder dort mit F2 bzw.
Entf.

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

Für edu-sharing ist keine Einstellung nötig: Die Standardwerte passen auf das Repository. Ändern lassen sich die
Einstellungen mit Strg+, (Suche: `edu-sharing i18n`) oder in `settings.json`. Sie gelten wahlweise für alle
Arbeitsbereiche („Benutzer“) oder nur für diesen („Arbeitsbereich“).

| Einstellung | Standard | Bedeutung |
|---|---|---|
| `eduI18n.referenceLanguage` | `de` | Sprache, mit der verglichen wird |
| `eduI18n.baseFileLanguage` | `en` | Sprache der Dateien ohne Sprachsuffix |
| `eduI18n.areas` | `[]` | eigene Übersetzungsbereiche oder Ersatz des eingebauten |
| `eduI18n.roots` | `{}` | feste Wurzelordner je Bereich; ohne Eintrag erkennt die Extension sie |
| `eduI18n.exclude` | `node_modules`, `.git`, `dist`, `out`, `target`, `build` | Ordner, die nie durchsucht werden |
| `eduI18n.variants` | `de-informal`, `de-no-binnen-i` | dünn besetzte Sprachvarianten und ihre Regeln |
| `eduI18n.checks.severity` | `{}` | Schweregrad je Prüfregel (`error`, `warning`, `info`, `off`) |
| `eduI18n.checks.ignoreSameAsReference` | `OK`, `E-Mail`, `CC-0`, `ID` | Texte, die wie die Referenz lauten dürfen |
| `eduI18n.diagnostics.missing` | `aggregate` | fehlende Keys in „Probleme“: je Datei, je Key oder gar nicht |
| `eduI18n.backup.intervalMinutes` | `10` | Abstand der Sicherungen während der Arbeit (`0`: nur die festen Anlässe) |
| `eduI18n.backup.keep` | `10` | Anzahl der aufbewahrten Sicherungen |

- `areas`, `variants` und `roots` aus den Einstellungen des Arbeitsbereichs gelten erst, wenn der Arbeitsbereich
  vertrauenswürdig ist.
- Ungültige Werte meldet die Extension oben in der Seitenleiste „Bereiche“ und im Protokoll; dann gilt der Standard.
- Jede Einstellung mit Beispielen, die Liste der Prüfregeln und die Grenzen der Extension stehen in
  [docs/einstellungen.md](docs/einstellungen.md).

## KI-Füllen und b-api-Schlüssel

**Heute ist kein Schlüssel nötig.** Die Extension prüft und bearbeitet nur lokale Dateien und baut keine
Netzwerkverbindung auf. Einen gesetzten `B_API_KEY` liest diese Version nicht.

**Wofür er gebraucht wird:** Ab Phase 3 schlägt die Extension Übersetzungen per KI vor und füllt fehlende auf Wunsch,
immer mit Prüfliste.
- Die Anfragen gehen an die b-api von OpenEduHub (Voreinstellung `https://b-api.staging.openeduhub.net`, Modell
  `gpt-6-luna`).
- Der Schlüssel weist sie dort aus (Header `X-API-KEY`).
- Es ist derselbe Schlüssel, den die bisherige Standalone-App als `B_API_KEY` nutzt. Wer keinen hat, bekommt ihn bei
  den Betreibern der b-api.

**Wo und wie man ihn hinterlegt.** So ist es geplant (siehe
[Design, Abschnitt 6.8](docs/plans/2026-09-24-edu-sharing-i18n-vscode-design.md#68-ki-anbindung-b-api--gpt-6-luna)):
1. **Empfohlen:** der Befehl „edu-sharing i18n: API-Schlüssel setzen“.
   - Er legt den Schlüssel im Schlüsselspeicher von VS Code ab (SecretStorage), den das Betriebssystem verschlüsselt.
   - „API-Schlüssel entfernen“ löscht ihn wieder.
2. **Rückfall:** die Umgebungsvariable `B_API_KEY`. Sie muss gesetzt sein, bevor VS Code startet.
   - Windows, dauerhaft für den eigenen Benutzer: in PowerShell `setx B_API_KEY "<Schlüssel>"` ausführen, danach
     alle VS-Code-Fenster schließen und VS Code neu starten.
   - macOS und Linux: `export B_API_KEY="<Schlüssel>"` in `~/.zshrc` bzw. `~/.bashrc` eintragen und VS Code neu
     starten.
   - `setx` und die Shell-Datei speichern den Schlüssel im Klartext; der Befehl aus Punkt 1 ist sicherer.
3. **Nie** in `settings.json`, im Repository oder in anderen Dateien des Arbeitsbereichs. Die Extension liest ihn dort
   nicht und schreibt ihn nie in Protokoll, Editor oder Meldungen.

**Geplante Einstellungen:**
- `eduI18n.ai.enabled`: KI an oder aus.
- `eduI18n.ai.baseUrl`: Adresse der b-api, etwa die Produktion statt Staging.
- `eduI18n.ai.provider`, `eduI18n.ai.model`: Anbieter und Modell.
- `eduI18n.ai.reasoningEffort`: Denkaufwand des Modells.
- `eduI18n.ai.batchSize`, `eduI18n.ai.maxConcurrency`, `eduI18n.ai.timeoutSeconds`: Größe und Zahl der Anfragen.

Zur b-api gehen nur UI-Texte, Keys und Hinweise, keine personenbezogenen Daten. Im eingeschränkten Modus bleibt die KI
aus.

## Protokoll

Ausgabe → „edu-sharing i18n“ zeigt, was die Extension einliest, prüft und schreibt, mit Dauer, aber ohne Texte der
Dateien. Mehr Einzelheiten: „Developer: Set Log Level…“ für diesen Kanal.

## Datenschutz

- Keine Telemetrie und keine Netzwerkzugriffe.
- Sicherungen liegen im Speicher der Extension für diesen Arbeitsbereich, nie im Repository.
- Die Ansicht je Einheit und die nicht gespeicherten Texte liegen im Arbeitsbereichsspeicher von VS Code.

## Wenn etwas nicht klappt

**Die Seitenleiste findet keine Übersetzungen:**
- Enthält der geöffnete Ordner `…/i18n/common/de.json`?
- Liegt der Ordner unter einem Muster aus `eduI18n.exclude`?
- Ist eine der [Grenzen](docs/einstellungen.md#grenzen) erreicht?
- Dann hilft „Übersetzungsordner festlegen…“.

**Speichern geht nicht:**
- Im eingeschränkten Modus schreibt die Extension nicht; „Arbeitsbereichsvertrauen verwalten“ hebt ihn auf.
- Hat die Datei ungespeicherte Änderungen in einem Texteditor, diese erst speichern oder verwerfen.
- Hat sich ein Text außerhalb des Editors geändert, fragt der Editor, welcher gilt.

**Eine Einstellung wirkt nicht:** Warum, steht oben in der Seitenleiste „Bereiche“ und im Protokoll.

## Geplant

Phase 3 bis 8 laut [Taskliste](docs/plans/2026-09-24-edu-sharing-i18n-vscode-tasks.md):
- Füllen aus einem Übersetzungsspeicher oder per KI (b-api, siehe [oben](#ki-füllen-und-b-api-schlüssel)), immer mit
  Prüfliste;
- Import und Export (CSV, JSON);
- Metadataset-`.properties` und Mail-Templates;
- Kontext, Review-Status und eine Übersicht;
- Feinschliff: Doku auch auf Englisch, vollständige Übersetzung der Meldungen, Rauchtest in VS-Code-Forks.

Weitere Unterlagen:
- Das [Design-Dokument](docs/plans/2026-09-24-edu-sharing-i18n-vscode-design.md) beschreibt den vollen Umfang.
- Die Abnahmen stehen unter [`docs/verification`](docs/verification).

## Mitentwickeln

Siehe [CONTRIBUTING.md](CONTRIBUTING.md).

## English

A VS Code extension to check and edit the translation files of edu-sharing (Angular JSON). It shows findings in the
Problems panel and offers a translation editor with table and list. Writes change only the edited line, with undo and
backups.

- **Status:** work in progress (phase 2 of 8).
- **Install:** on Windows, run
  `powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://github.com/janschachtschabel/i18n-translator-vscode/releases/latest/download/install.ps1 | iex"`;
  on Linux and macOS,
  `curl -fsSL https://github.com/janschachtschabel/i18n-translator-vscode/releases/latest/download/install.sh | bash`.
  Or download
  [edu-sharing-i18n.vsix](https://github.com/janschachtschabel/i18n-translator-vscode/releases/latest/download/edu-sharing-i18n.vsix)
  and run "Extensions: Install from VSIX…".
- **API key:** none is needed yet. AI filling via the b-api comes with phase 3. The key will be kept in VS Code's
  secret storage or in the `B_API_KEY` environment variable.
- **Documentation:** the settings are described in German in [docs/einstellungen.md](docs/einstellungen.md), as are
  the design documents.

## Lizenz

[Apache-2.0](LICENSE). Die Extension bündelt Pakete Dritter; ihre Lizenzen stehen in
[ThirdPartyNotices.txt](ThirdPartyNotices.txt).
