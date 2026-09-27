# edu-sharing i18n – VS-Code-Extension

Übersetzungsdateien von [edu-sharing](https://github.com/edu-sharing/edu-sharing-community-repository) in VS Code
**prüfen und bearbeiten**, mit allen Sprachen nebeneinander:
- Angular-JSON (`Frontend/src/assets/i18n`);
- Metadatasets (`.properties` unter `config/defaults/src/main/resources/metadatasets/i18n`);
- Mail-Templates (`templates*.xml` unter `config/defaults/src/main/resources/mailtemplates`).

Das geht in einem edu-sharing-Checkout ebenso wie in einem Datenordner mit Kopien davon, etwa dem der alten
i18n-App (`data/1.0.0/` mit `json/`, `metadatasets/i18n/` und `mailtemplates/`).

> **Status:** in Entwicklung. Prüfen und Bearbeiten sind fertig, für alle drei Bereiche (Phasen 2, 5 und der Kern von
> 6 der [Taskliste](docs/plans/2026-09-24-edu-sharing-i18n-vscode-tasks.md)), dazu Vorschläge, Füllen und Prüfen mit KI
> über die b-api (Phase 3). Noch nicht für den produktiven Einsatz gedacht: bitte auf einer Kopie oder in einem
> Git-Arbeitsstand testen, dessen Änderungen sich zurücknehmen lassen.

## Was die Extension kann

**Prüfen.** Beim Öffnen eines Arbeitsbereichs sucht die Extension die Übersetzungsordner (siehe
[Die drei Bereiche](#die-drei-bereiche)) und prüft sie auf:
- fehlende Keys und Sprachdateien;
- Platzhalter und HTML-Tags, die von der Referenzsprache abweichen, und kaputte Platzhalter;
- leere Texte;
- Sprachvarianten (`de-informal`, `de-no-binnen-i`);
- Keys, die eine andere Einheit überschreibt;
- verwaiste oder vermutlich verschobene Keys;
- Texte, die mit der Referenz übereinstimmen;
- Zeichen, die beim Speichern in einer anderen Kodierung verloren gingen (`l?apprentissage`).

Die Befunde stehen an drei Stellen:
- in der Ansicht „Probleme“;
- in der Seitenleiste „edu-sharing i18n“, je Bereich und Einheit mit Zählern;
- in der Statusleiste.

**Bearbeiten.** Der Übersetzungseditor zeigt eine Einheit (etwa `common`, `mds` oder die Mail-Templates) als
Tabelle mit einer Spalte je Sprache oder, in schmalen Fenstern, als Liste:
- einen Text bearbeiten und speichern, mit Prüfung beim Tippen;
- filtern und suchen, Sprachen aus- und einblenden;
- die Details eines Keys mit Erklärungen und Hinweisen zu jedem Befund;
- Keys hinzufügen, umbenennen und löschen; Sprachen hinzufügen.

**KI (b-api).** Ein Vorschlag für den Text einer Zelle, übersetzt aus der Referenz, geprüft wie ein getippter Text und
erst auf Ihren Wunsch gespeichert; das Füllen aller fehlenden Texte einer Sprache und die Prüfung aller vorhandenen,
beides mit einer Prüfliste (siehe [KI-Füllen und b-api-Schlüssel](#ki-füllen-und-b-api-schlüssel)).

**Daten sicher halten.**
- **Nur das Nötige schreiben:** Eine Zelle ändert genau eine Zeile. Einrückung, Zeilenenden und Reihenfolge der
  Datei bleiben, ebenso das Encoding einer `.properties`-Datei (UTF-8 oder ISO-8859-1) und in Mail-Templates CDATA,
  Kommentare und das Stylesheet.
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
  - Wann: vor der ersten Änderung einer Sitzung, vor Änderungen mehrerer Einheiten, vor dem Übernehmen von Texten der
    Prüfliste, vor dem Wiederherstellen und alle 10 Minuten während der Arbeit.
  - Wo: im Speicher der Extension für diesen Arbeitsbereich, nie im Repository; die letzten 10 bleiben.
  - Zurückholen: „Übersetzungsdateien aus einer Sicherung wiederherstellen…“.
- **Eingeschränkter Modus:** In einem nicht vertrauenswürdigen Arbeitsbereich lässt sich nur prüfen und ansehen,
  nichts schreiben.

## Die drei Bereiche

| Bereich | Erkannt an | Einheiten | Referenz |
|---|---|---|---|
| **Angular JSON** | `common/de.json`; der Ordner darüber ist die Wurzel | je Unterordner eine (`common`, `admin`, …), je Datei eine Sprache (`de.json`, `en.json`, …) | `de` |
| **Metadatasets** | `metadatasets/i18n/mds.properties` | je Gruppe eine (`mds`, `valuespaces_i18n`, …); `mds_de_DE.properties` ist `de_DE` | `de_DE` |
| **Mail templates** | `mailtemplates/templates.xml` | eine: `templates`; `templates_fr_FR.xml` ist `fr_FR` | `de_DE` |

Gut zu wissen:
- **Die Datei ohne Sprachkürzel** (`mds.properties`, `templates.xml`) liest edu-sharing als letzten Rückfall. Der
  Editor nennt sie `default (en)`; die Sprache legt `eduI18n.baseFileLanguage` fest. Ein Key, den nur sie hat, fehlt
  deshalb den anderen Sprachen, auch der Referenz: Dort erscheint der englische Text. Ausgenommen sind Texte ohne
  Wörter, etwa die Lizenz-Links von `mds.properties`: Für sie ist der englische Rückfall richtig.
- **Override-Einheiten** wie `mds_override` und die Angular-Kategorie `override` legen sich zur Laufzeit über die
  anderen und enthalten nur, was sie ändern. Für sie meldet die Extension keine fehlenden Keys oder Dateien (Feld
  `overrideBundlePattern`, siehe [Einstellungen](docs/einstellungen.md#edui18nareas)).
- **Metadatasets:**
  - Ein Key ist der ganze Name, Punkte eingeschlossen (`ccm:lrt.video`).
  - Platzhalter haben eine Klammer (`{user}`), nur `{{GENDER_SEPARATOR}}` hat zwei.
  - Die erste Zeile der Hauptdateien (`this_is_a_bug_the_first_line_will_not_be_translated`) liest edu-sharing nie.
    Der Editor blendet sie aus, sie bleibt aber an erster Stelle in der Datei, und neue Sprachdateien beginnen mit ihr.
- **Mail-Templates:**
  - Jedes Template steht mit zwei Zeilen im Editor: `invited.subject` für den Betreff, `invited.message` für die
    Nachricht (HTML).
  - Fehlt einer Sprache ein Feld oder das ganze Template, legt das Füllen der Zelle es dort an, an der Stelle der
    Referenz.
  - Ein neuer Key heißt `Template.subject` oder `Template.message`.
  - Templates ohne Betreff und Nachricht, etwa das Stylesheet, erscheinen nicht und bleiben unverändert.
  - **Mail-Vorschau:** „Mail-Vorschau“ in den Details einer Zeile, im Kontextmenü einer Zeile oder in der
    Befehlspalette zeigt neben dem Editor die Mail des Templates in jeder Sprache, die Referenz zuerst, so
    zusammengesetzt, wie edu-sharing sie verschickt: Stylesheet, Kopf, Text und Fuß. Fehlen einer Sprache Texte, sagt
    ein Hinweis, dass die Mail die der Basisdatei zeigt. Kann edu-sharing die Datei einer Sprache nicht lesen, steht
    dort statt der Mail der Grund: edu-sharing verschickt dann in dieser Sprache keine Mail. Die Vorschau führt keine Skripte aus und lädt nichts nach,
    auch keine Bilder; Platzhalter wie `{{firstName}}` bleiben stehen.
  - Override-Dateien (`templates_de_DE_override.xml`) ersetzen zur Laufzeit ganze Templates; die Extension zeigt sie
    nicht.
- **Andere Ordner:** Für Übersetzungen, die anders liegen, lassen sich Wurzeln festlegen oder eigene Bereiche
  anlegen, siehe [Einstellungen](docs/einstellungen.md#bereiche-und-ordner).

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
    `common/de.json`, `metadatasets/i18n/mds.properties` oder `mailtemplates/templates.xml`.
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

1. **Ordner öffnen** („Datei“ → „Ordner öffnen…“): einen edu-sharing-Checkout, einen Datenordner mit Kopien der
   Übersetzungsdateien (etwa den der alten i18n-App) oder direkt `Frontend/src/assets/i18n`.
   - Die Extension findet die Bereiche auch in Unterordnern, siehe [Die drei Bereiche](#die-drei-bereiche).
   - Ohne geöffneten Ordner zeigt die Seitenleiste „Ordner öffnen“ an.
   - Zum Ausprobieren eignet sich eine Kopie, denn die Extension schreibt beim Bearbeiten.
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
   - **Lücken finden:** Die Sprach-Chips über der Tabelle zeigen je Sprache, wie viele Texte fehlen, und blenden
     Sprachen aus oder ein, etwa um nur Referenz und Französisch nebeneinander zu sehen. Alt+M (Filter „fehlend“)
     zeigt nur die Keys, denen in einer sichtbaren Sprache ein Text fehlt. Zeilen, die Sie bearbeitet haben, bleiben
     stehen, bis Sie den Filter oder die sichtbaren Sprachen ändern.
   - **Befunde erkennen:** Eine Zelle mit Warnung (etwa „⚠ fehlt“ oder „⚠ leer“) ist gelb hinterlegt, eine mit Fehler
     (etwa „✖ Platzhalter“) rot, jeweils mit einem Balken am Anfang; im hohen Kontrast bleiben Balken und Symbol.
     Hinweise wie „ℹ wie Referenz“ bleiben ohne Fläche und Balken. „–“ heißt: kein eigener Text, die Sprache zeigt
     den Text ihrer Basis (etwa eine Variante den von `de`).
   - Lange Texte wie die Nachrichten der Mail-Templates zeigt „Lange Texte umbrechen“ ganz.
   - **Mail-Templates ansehen:** „Mail-Vorschau“ in den Details zeigt die Mail in jeder Sprache neben dem Editor.
5. **Text bearbeiten:** eine Zelle anklicken (oder mit den Pfeiltasten wählen und Enter oder F2 drücken), tippen und
   mit Enter speichern. Bei mehrzeiligen Texten speichert Strg+Enter; Esc bricht ab. Ein Klick in eine andere Zelle
   speichert ebenfalls und öffnet deren Text.
   - Der Editor prüft schon beim Tippen, etwa Platzhalter und HTML-Tags.
   - Er schreibt nur die geänderte Zeile.
   - Ein geleerter Text wird nach Rückfrage in dieser Sprache gelöscht; dann erscheint der Text der Referenz.
6. **Keys und Sprachen:**
   - Kontextmenü der Key-Spalte: Key hinzufügen, umbenennen oder löschen, Sprache hinzufügen.
   - Knöpfe in der Werkzeugleiste des Editors, dazu im „…“-Menü seiner Titelleiste: Key oder Sprache hinzufügen.
   - Kontextmenü einer Einheit in der Seitenleiste: Key oder Sprache hinzufügen, dazu „Im Explorer zeigen“.
   - Die Eingabefelder dieser Befehle schließen ohne Änderung mit Esc, dem X in ihrer Titelzeile oder einem Klick
     daneben.
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
| Mail-Vorschau | die Mail eines Templates in jeder Sprache neben dem Editor zeigen, wie edu-sharing sie verschickt |
| KI einrichten… | Schlüssel, Adresse der b-api und Modell auf einen Blick, mit den Schritten, sie zu ändern |
| API-Schlüssel setzen… · API-Schlüssel entfernen | den b-api-Schlüssel im Schlüsselspeicher von VS Code ablegen oder löschen |
| b-api-Adresse festlegen… | eine andere Adresse der b-api als Staging, etwa die Produktion |
| KI-Verbindung testen | prüfen, ob die b-api mit Schlüssel und Modell antwortet |
| KI-Modell wählen… | ein Chat-Modell der b-api für Vorschläge, Füllen und Prüfen wählen |
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
| Esc | Bearbeitung abbrechen; mit einem KI-Vorschlag erst den vorigen Text zurückholen |
| Strg+I | KI-Vorschlag für den Text (öffnet das Textfeld der gewählten Zelle) |
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
| `eduI18n.areas` | `[]` | eigene Übersetzungsbereiche oder Ersatz eines eingebauten |
| `eduI18n.roots` | `{}` | feste Wurzelordner je Bereich; ohne Eintrag erkennt die Extension sie |
| `eduI18n.exclude` | `node_modules`, `.git`, `dist`, `out`, `target`, `build` | Ordner, die nie durchsucht werden |
| `eduI18n.variants` | `de-informal`, `de-no-binnen-i` | dünn besetzte Sprachvarianten und ihre Regeln |
| `eduI18n.checks.severity` | `{}` | Schweregrad je Prüfregel (`error`, `warning`, `info`, `off`) |
| `eduI18n.checks.ignoreSameAsReference` | `OK`, `E-Mail`, `CC-0`, `ID` | Texte, die wie die Referenz lauten dürfen |
| `eduI18n.diagnostics.missing` | `aggregate` | fehlende Keys in „Probleme“: je Datei, je Key oder gar nicht |
| `eduI18n.backup.intervalMinutes` | `10` | Abstand der Sicherungen während der Arbeit (`0`: nur die festen Anlässe) |
| `eduI18n.backup.keep` | `10` | Anzahl der aufbewahrten Sicherungen |
| `eduI18n.ai.*` | b-api Staging, `gpt-6-luna` | KI-Anbindung, siehe [KI-Füllen und b-api-Schlüssel](#ki-füllen-und-b-api-schlüssel) |

- `areas`, `variants` und `roots` aus den Einstellungen des Arbeitsbereichs gelten erst, wenn der Arbeitsbereich
  vertrauenswürdig ist.
- Ungültige Werte meldet die Extension oben in der Seitenleiste „Bereiche“ und im Protokoll; dann gilt der Standard.
- Jede Einstellung mit Beispielen, die Liste der Prüfregeln und die Grenzen der Extension stehen in
  [docs/einstellungen.md](docs/einstellungen.md).

## KI-Füllen und b-api-Schlüssel

Die Extension schlägt auf Wunsch Übersetzungen per KI vor. Die Anfragen gehen an die b-api von OpenEduHub
(Voreinstellung `https://b-api.staging.openeduhub.net`, Modell `gpt-6-luna`); der Schlüssel weist sie dort aus
(Header `X-API-KEY`). Es ist derselbe Schlüssel, den die bisherige Standalone-App als `B_API_KEY` nutzt. Wer keinen
hat, bekommt ihn bei den Betreibern der b-api.

**Einrichten:** „KI einrichten…“ fasst alles zusammen: in der Werkzeugleiste des Editors (Gruppe „KI“), im Menü „…“
der Seitenleiste „Bereiche“ und in der Befehlspalette („edu-sharing i18n: KI einrichten…“). Es zeigt, was gerade gilt
(Schlüssel, Adresse der b-api, Modell), und führt zu den einzelnen Schritten:
1. **Schlüssel setzen:** „API-Schlüssel setzen…“.
   - Das Eingabefeld zeigt den Schlüssel nicht an und bleibt offen, während Sie ihn etwa aus einem Passwortmanager
     kopieren.
   - VS Code bewahrt ihn im Schlüsselspeicher auf (SecretStorage), den das Betriebssystem verschlüsselt.
   - „API-Schlüssel entfernen“ löscht ihn wieder.
   - **Rückfall:** Ohne gespeicherten Schlüssel gilt die Umgebungsvariable `B_API_KEY`, wenn sie beim Start von VS Code
     gesetzt ist. Windows, dauerhaft für den eigenen Benutzer: in PowerShell `setx B_API_KEY "<Schlüssel>"`, danach alle
     VS-Code-Fenster schließen und VS Code neu starten. macOS und Linux: `export B_API_KEY="<Schlüssel>"` in
     `~/.zshrc` bzw. `~/.bashrc`. `setx` und die Shell-Datei speichern den Schlüssel im Klartext; der Befehl ist
     sicherer.
   - **Nie** in `settings.json`, im Repository oder in anderen Dateien des Arbeitsbereichs. Die Extension liest ihn dort
     nicht und schreibt ihn nie in Protokoll, Editor oder Meldungen.
2. **Adresse der b-api** (nur wenn nicht Staging): „b-api-Adresse festlegen…“ nimmt eine andere Adresse, etwa
   `https://b-api.prod.openeduhub.net` für die Produktion, und prüft sie beim Tippen (nur `https:`, `http:` nur auf
   diesem Rechner). Die Adresse von Staging entfernt die Einstellung wieder. Bevor zum ersten Mal Texte an eine neue
   Adresse gehen, fragt die Extension nach.
3. **Verbindung testen:** „KI-Verbindung testen“ fragt die Modelle der b-api ab und schickt dem eingestellten Modell
   einen festen Testtext (nichts aus dem Arbeitsbereich). Die Meldung nennt die Antwortzeit, oder die Ursache eines
   Fehlers mit dem Schritt, der ihn behebt.
4. **Modell wählen** (optional, Standard `gpt-6-luna`): „KI-Modell wählen…“ bietet die Chat-Modelle des Anbieters an
   und speichert die Wahl in den Benutzereinstellungen.

**Vorschlag für eine Zelle:**
- Eine Zelle anklicken und „KI-Vorschlag“ unter dem Textfeld wählen, oder Strg+I drücken (auch auf einer gewählten
  Zelle der Tabelle, dann öffnet sich ihr Textfeld).
- Übersetzt wird der Text der Referenz, bei einer Variante (`de-informal`, `de-no-binnen-i`) der Text ihrer Basis;
  bis zu drei Texte in anderen Sprachen helfen mit dem Sinn.
- Der Vorschlag steht im Textfeld, markiert mit „KI-Vorschlag – bitte prüfen“; die Prüfung beim Tippen zeigt
  abweichende Platzhalter und HTML-Tags wie bei einem getippten Text.
- Enter, Tab oder ein Klick daneben speichern ihn wie einen getippten Text; Esc holt den vorigen Text zurück, ein
  zweites Esc schließt das Textfeld. Strg+Z nimmt einen gespeicherten Vorschlag zurück.
- Ohne Schlüssel steht dort „KI-Vorschlag: API-Schlüssel setzen…“.

**Eine Sprache füllen:**
- Die Werkzeugleiste des Editors zeigt in der Gruppe „KI“, ob die KI bereit ist und mit welchem Modell („bereit ·
  gpt-6-luna“), daneben „Mit KI füllen…“, „Mit KI prüfen…“ und „KI einrichten…“. Ohne Schlüssel steht dort „kein
  API-Schlüssel“ mit „API-Schlüssel setzen…“, bei einer unbrauchbaren Adresse „Adresse der b-api ungültig“.
- „Mit KI füllen…“ fragt nach der Sprache, jeweils mit der Zahl der Texte: fehlende und leere, bei einer Variante die
  Texte, die sie selbst braucht. Ab fünf Anfragen fragt die Extension noch einmal nach, mit Modell und Adresse.
- Die Vorschläge erscheinen Paket für Paket in einer Prüfliste an Stelle der Tabelle: je Text die Quelle, der bisherige
  Text, der Vorschlag zum Bearbeiten mit der Prüfung und ein Kästchen „übernehmen“.
- Vorgewählt ist jeder Vorschlag, den die Datei so aufnehmen kann. Einer mit abweichenden Platzhaltern bleibt
  abgewählt, mit dem Grund; wählbar bleibt er. Ein leerer lässt sich nicht wählen: Er schriebe nichts. „Alle
  auswählen“ wählt jeden Text, der etwas zu schreiben hat (nicht leer, nicht der Text der Zelle); „Keine auswählen“
  wählt alle ab.
- „Ausgewählte übernehmen (n)“ schreibt die gewählten Texte auf einmal: vorher eine Sicherung, danach ein Schritt
  „Letzte Änderung rückgängig“. Ein Text, der sich inzwischen geändert hat, wird übersprungen und bleibt mit dem Grund
  in der Liste.
- „Abbrechen“ beendet das Füllen, die erhaltenen Vorschläge bleiben. „Verwerfen“ schließt die Liste, ohne zu
  schreiben. Esc bricht nichts ab.

**Eine Sprache prüfen:**
- „Mit KI prüfen…“ fragt nach der Sprache, jeweils mit der Zahl der Texte, die sie hat und die sich mit ihrer Quelle
  vergleichen lassen (bei einer Variante: ihre eigenen Texte gegen die Basis).
- Die KI beurteilt jeden Text: Sagt er, was die Quelle sagt, mit denselben Platzhaltern und HTML-Tags, in der Anrede
  und den Begriffen, die die Beschreibung der Sprache verlangt, ohne Fehler in Rechtschreibung und Grammatik? Sie nutzt
  dafür `eduI18n.ai.reviewReasoningEffort` (Standard `medium`).
- Die Prüfliste zeigt nur, was sie findet: je Text das Problem mit seiner Schwere (Fehler, Warnung, Hinweis) in der
  Sprache von VS Code, die Quelle, den bisherigen Text und die Korrektur zum Bearbeiten. Nichts ist vorgewählt: Die
  Prüfung ändert Texte, die jemand geschrieben hat. Ein Befund ohne Korrektur lässt sich wählen, sobald man den Text
  selbst ändert.
- Am Ende steht die Zusammenfassung „Geprüft · in Ordnung · Hinweise · ohne Antwort“. Übernehmen, Abbrechen und
  Verwerfen wie beim Füllen.

**Was die b-api bekommt:** den zu übersetzenden Text, seinen Key und seine Texte in anderen Sprachen, keine
personenbezogenen Daten. Bevor zum ersten Mal Texte an eine Adresse gehen, fragt die Extension einmal nach (je
Adresse; ein Wechsel etwa zur Produktion fragt erneut). Im eingeschränkten Modus und mit `eduI18n.ai.enabled: false`
ist die KI aus.

**Einstellungen** (Kategorie „KI (b-api)“, Einzelheiten in [docs/einstellungen.md](docs/einstellungen.md#ki-b-api)):
`eduI18n.ai.enabled` (in den Benutzereinstellungen ausgeschaltet, bleibt die KI in jedem Arbeitsbereich aus);
`ai.baseUrl`, `ai.provider`, `ai.model`, `ai.reasoningEffort`, `ai.reviewReasoningEffort` (nur in den
Benutzereinstellungen, damit kein Repository den Schlüssel umlenkt); `ai.batchSize`, `ai.maxConcurrency`,
`ai.timeoutSeconds`, `ai.languageDescriptions`.

## Protokoll

Ausgabe → „edu-sharing i18n“ zeigt, was die Extension einliest, prüft und schreibt, mit Dauer, aber ohne Texte der
Dateien. Mehr Einzelheiten: „Developer: Set Log Level…“ für diesen Kanal.

## Datenschutz

- Keine Telemetrie.
- Netzwerkzugriffe nur für die KI, nur nach einer Aktion (Vorschlag, Füllen, Prüfen, Verbindungstest, Modellwahl) und nur zur
  eingestellten b-api-Adresse; bevor Texte dorthin gehen, fragt die Extension einmal nach.
- Sicherungen liegen im Speicher der Extension für diesen Arbeitsbereich, nie im Repository.
- Die Ansicht je Einheit und die nicht gespeicherten Texte liegen im Arbeitsbereichsspeicher von VS Code.

## Wenn etwas nicht klappt

**Die Seitenleiste findet keine Übersetzungen:**
- Ist überhaupt ein Ordner geöffnet? „Configure folders“ bzw. „Übersetzungsordner festlegen…“ braucht einen.
- Enthält der geöffnete Ordner irgendwo `common/de.json`, `metadatasets/i18n/mds.properties` oder
  `mailtemplates/templates.xml`? Wer den Ordner `metadatasets/i18n` oder `mailtemplates` selbst öffnet, legt ihn mit
  „Übersetzungsordner festlegen…“ als Wurzel fest.
- Liegt der Ordner unter einem Muster aus `eduI18n.exclude`?
- Ist eine der [Grenzen](docs/einstellungen.md#grenzen) erreicht?
- Dann hilft „Übersetzungsordner festlegen…“.

**Speichern geht nicht:**
- Im eingeschränkten Modus schreibt die Extension nicht; „Arbeitsbereichsvertrauen verwalten“ hebt ihn auf.
- Hat die Datei ungespeicherte Änderungen in einem Texteditor, diese erst speichern oder verwerfen.
- Hat sich ein Text außerhalb des Editors geändert, fragt der Editor, welcher gilt.

**Eine Einstellung wirkt nicht:** Warum, steht oben in der Seitenleiste „Bereiche“ und im Protokoll.

**Die KI antwortet nicht:** „KI-Verbindung testen“ nennt die Ursache und den nächsten Schritt: einen abgelehnten
Schlüssel („API-Schlüssel setzen…“), ein Modell, das die b-api nicht anbietet („KI-Modell wählen…“), eine nicht
erreichbare Adresse (Netzwerk, Proxy, `eduI18n.ai.baseUrl`). Im eingeschränkten Modus ist die KI aus.

## Geplant

Laut [Taskliste](docs/plans/2026-09-24-edu-sharing-i18n-vscode-tasks.md):
- ein Übersetzungsspeicher;
- Import und Export (CSV, JSON, `.properties`, Mail-XML);
- Mail-Templates: hervorgehobener HTML-Code, die Vorschau schon beim Tippen und im Farbschema von VS Code;
- Kontext, Review-Status und eine Übersicht;
- Feinschliff: Doku auch auf Englisch, vollständige Übersetzung der Meldungen, Rauchtest in VS-Code-Forks.

Weitere Unterlagen:
- Das [Design-Dokument](docs/plans/2026-09-24-edu-sharing-i18n-vscode-design.md) beschreibt den vollen Umfang.
- Die Abnahmen stehen unter [`docs/verification`](docs/verification).

## Mitentwickeln

Siehe [CONTRIBUTING.md](CONTRIBUTING.md).

## English

A VS Code extension to check and edit the translation files of edu-sharing: Angular JSON, metadatasets (`.properties`)
and mail templates (XML), in a checkout or in a data folder with copies of them. It shows findings in the Problems
panel and offers a translation editor with a column per language, with a preview of each mail template in every
language. Writes change only the edited line and keep each file's encoding and layout, with undo and backups.

- **Status:** work in progress: checking and editing are done for all three areas, and so are suggestions, filling
  and checks with AI via the b-api.
- **Install:** on Windows, run
  `powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://github.com/janschachtschabel/i18n-translator-vscode/releases/latest/download/install.ps1 | iex"`;
  on Linux and macOS,
  `curl -fsSL https://github.com/janschachtschabel/i18n-translator-vscode/releases/latest/download/install.sh | bash`.
  Or download
  [edu-sharing-i18n.vsix](https://github.com/janschachtschabel/i18n-translator-vscode/releases/latest/download/edu-sharing-i18n.vsix)
  and run "Extensions: Install from VSIX…".
- **AI (b-api):** "Set API key…" keeps the key of the b-api in VS Code's secret storage (fallback: the `B_API_KEY`
  environment variable); "Test AI connection" checks it. In the editor, "AI Suggestion" (Ctrl+I) puts a translation
  of the reference text into a cell's field, to check and save like a typed text; "Fill with AI…" in the toolbar
  translates the missing texts of a language into a review list, whose chosen texts are written at once, and "Check
  with AI…" lists the problems the AI finds in the translations of a language, with corrections to choose.
- **Documentation:** the settings are described in German in [docs/einstellungen.md](docs/einstellungen.md), as are
  the design documents.

## Lizenz

[Apache-2.0](LICENSE). Die Extension bündelt Pakete Dritter; ihre Lizenzen stehen in
[ThirdPartyNotices.txt](ThirdPartyNotices.txt).
