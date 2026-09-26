# Abnahme Phasen 5 und 6 (Kern) – Metadatasets und Mail-Templates

> Gehört zu Task 6.8 in [`../plans/2026-09-24-edu-sharing-i18n-vscode-tasks.md`](../plans/2026-09-24-edu-sharing-i18n-vscode-tasks.md)
> (Abschnitt „Phasen 5 und 6 (Kern)“). Stand: 26.09.2026, Branch `feat/extension-v1`, Version 0.3.0 (Code wie in
> Commit `f715159`). Geprüft in VS Code 1.139.1 unter Windows 11, mit einem eigenen Profil und der Extension im
> Entwicklungsmodus; die Durchläufe steuerte ein Skript über das DevTools-Protokoll mit echten Tastenereignissen.

## 1. Tests

| Prüfung | Aufruf | Ergebnis |
|---|---|---|
| alle Unit- und Komponententests, darunter die Golden-Dateien von `.properties` (UTF-8, ISO-8859-1 mit CRLF, BOM ohne Newline am Ende) und Mail-XML (Tabs mit CRLF, Leerzeichen ohne Newline am Ende) | `npm run test:unit` | 837 bestanden |
| Integrationstests in VS Code stable (1.139.1) und 1.90.0 | `npm run test:integration` | je 89 bestanden, 15 ausgelassen (Messung, Multi-Root und Formate laufen in eigenen Profilen) |
| Profil `multi` (vier Arbeitsbereichsordner) | ebenda | 5 bestanden |
| Profil `formats`: ein synthetischer Datenordner mit allen drei Bereichen | ebenda | 9 bestanden |
| Typen, Lint, Format | `npm run typecheck`, `npm run lint`, `npm run format:check` | ohne Befund |

## 2. Rundlauf gegen echte Dateien (nur lesend)

`npm run check:repo -- <Ordner> --roundtrip` liest jede Übersetzungsdatei aller Bereiche, schreibt sie ohne Änderung
zurück und vergleicht die Bytes; danach setzt es jeden Text der Datei auf sich selbst und prüft, dass er sich
gleich zurückliest.

| Ordner | Dateien | Ergebnis |
|---|--:|---|
| edu-sharing-Clone (`maven/fixes/11.0`) | 116 (87 JSON, 25 `.properties`, 4 Mail-XML) | alle byte-gleich und stabil (16 s) |
| Datenordner der alten App (`data/1.0.0`) | 112 | alle byte-gleich und stabil |

## 3. Befunde gegen den Clone

`npm run check:repo -- <Clone>` mit den Standardeinstellungen, verglichen mit dem Probelauf in Design §2.3:

| Bereich | Befund | Design §2.3 | jetzt |
|---|---|--:|--:|
| Metadatasets (7 Einheiten) | fehlende Keys gegenüber `de_DE` | 2.605 | 2.605 |
| | dazu Keys, die nur die Basisdatei hat und die anderen Sprachen daher nicht | – | 27 |
| | doppelte Keys | 14 | 14 |
| | verwaiste Keys | – | 1 |
| Mail (1 Einheit, 22 Templates) | `added_inbox` fehlt in `fr_FR` und `it_IT` | 2 Templates | 4 Felder |
| | `passwordRequest` gibt es nur in `templates.xml`: fehlt in `de_DE`, `fr_FR`, `it_IT` | – | 6 Felder |
| | Platzhalter-Abweichung (`userRegister`, `{{image:…}}`) | 1 | 1 |
| | HTML-Abweichungen | – | 3 |
| Angular | unverändert gegenüber Phase 2 | | 975 fehlende Keys, 33 Fehler |

Zwei Korrekturen stammen aus diesem Abgleich:
- Metadatasets schreiben Platzhalter mit einer Klammer (`{user}`). Vorher meldete die Prüfung 60 Fehler
  `placeholder-malformed`; jetzt keinen. Behoben mit `placeholderSyntax` (`single-brace`).
- Die Datei ohne Sprachkürzel (`templates.xml`, `mds.properties`) liest edu-sharing für jede Sprache zuletzt. Ein Key,
  den nur sie hat, fehlt deshalb den anderen Sprachen. Vorher hieß er „verwaist“ in der Basisdatei, was nahelegte,
  den englischen Text zu löschen.

## 4. Datenordner der alten App in VS Code

Eine Kopie von `data/` kam in ein eigenes Git-Repository (`core.autocrlf false`); die Instanz lief mit eigenem Profil
und ohne eingeschränkten Modus. Das Skript gibt nur Struktur und Zahlen aus, keine Texte; die Bilder liegen außerhalb
des Repositorys.

| Schritt | Ergebnis |
|---|---|
| Seitenleiste | drei Bereiche, jeder in seinem Unterordner: „Angular JSON“ `data/1.0.0/json` (15 Einheiten), „Metadatasets“ `data/1.0.0/metadatasets/i18n` (8 Einheiten), „Mail templates“ `data/1.0.0/mailtemplates` (1 Einheit) |
| Editor der Einheit `mds` | 706 Keys, Spalten `Key`, `de_DE reference`, `default (en)`, `fr_FR`, `it_IT`; Chips `de_DE missing: 10`, `fr_FR missing: 10`, `it_IT missing: 10` |
| Filter „fehlend“ (Alt+M) | 11 Keys: die 10 Keys, die nur die Basisdatei hat, und eine Lücke in `fr_FR` |
| Lücke in `fr_FR` gefüllt | `git diff --numstat`: 1 Zeile hinzugefügt, 0 entfernt; die Zeile nutzt den Trenner `: ` der Nachbarn; die Datei bleibt ISO-8859-1 |
| Strg+Z | keine Änderung mehr |
| Editor der Mail-Templates | 38 Zeilen (`subject` und `message` je Template), dieselben vier Spalten; Befunde wie „HTML“ und „placeholders“ in der Zelle; „Lange Texte umbrechen“ zeigt die Nachrichten ganz |
| Filter „fehlend“ | `passwordRequest.subject` und `.message`: fehlen in `de_DE`, `fr_FR`, `it_IT`, der englische Text steht daneben |
| Lücke in `de_DE` gefüllt | das Template `passwordRequest` entsteht in `templates_de_DE.xml` (3 Zeilen, Einrückung der Nachbarn) |
| Strg+Z | keine Änderung mehr |

## 5. Reviews

Nach Block E (Metadatasets) und Block F (Mail-Templates) prüfte je ein Reviewer mit frischem Kontext den Diff; der
erste baute `Properties.load` aus dem JDK nach und verglich 1,5 Millionen Zufallseingaben. Behoben sind:
- ein Backslash am Dateiende, der in eine neue Zeile hinein fortsetzte, und Zeilen aus nur einem Backslash;
- eine Byte-Order-Mark, die Java als Teil des ersten Keys liest (neue Regel `bom-first-key`);
- verborgene Keys als Namen neuer Keys; die Wächterzeile neuer Dateien, jetzt wörtlich aus der Referenz;
- ein Text, den der Schreiber auf mehrere CDATA-Abschnitte verteilt, und Zeilenumbrüche an den Enden eines Texts;
- Zeichen, die XML nicht aufnehmen kann (die Planung lehnt sie ab), `--` in Kommentaren, eine XML-Deklaration nicht
  am Anfang, `context=""`, doppelte Templates beim Löschen, die Kodierung aus der XML-Deklaration;
- Hinweise und Meldungen, die für jedes Format stimmen.

## 6. Ergebnis

| Kriterium (Tasks 5.5 und 6.8) | Stand |
|---|---|
| alle Dateien des Repos byte-identisch | erfüllt (Abschnitt 2) |
| Latin-1 bleibt Latin-1, `€` wird `\u20ac` | erfüllt (Golden-Tests, Abschnitt 4) |
| Zahlen aus Design §2.3 stimmen oder sind begründet | erfüllt (Abschnitt 3) |
| drei Bereiche in der Seitenleiste eines Datenordners | erfüllt (Abschnitt 4) |
| Lücken sichtbar und im Editor zu schließen, `git diff` zeigt genau die Änderung | erfüllt (Abschnitt 4) |

Offen, mit Begründung:
- **Template-Ansicht mit HTML-Vorschau** (Task 6.4) und **KI für Templates** (6.5) folgen mit Phase 3; die Nachrichten
  stehen bis dahin als HTML in der Tabelle. *Die Vorschau gibt es seit Abschnitt 7; hervorgehobener Code und KI folgen.*
- **Unübersetzbare Werte der Basisdatei:** Keys wie die Lizenz-URLs von `mds` hat nur die Basisdatei. Sie zählen jetzt
  als fehlend in den anderen Sprachen, obwohl der englische Rückfall dort genügt. Abhilfe bis zu den akzeptierten
  Warnungen (Phase 7): den Wert in die Sprachdateien übernehmen oder den Schweregrad von `missing-key` anpassen.
  *Behoben, siehe Abschnitt 7.*
- **Override-Dateien** (`mds_override*`, `templates_*_override.xml`) prüft die Extension wie eigene Einheiten bzw. gar
  nicht; zur Laufzeit legen sie sich über die Grunddateien. Ob sie wie Sprachvarianten dünn besetzt sein dürfen, ist
  eine offene Frage. *Ja, siehe Abschnitt 7.*
- **Zeilenenden nur mit CR** (klassisches Mac OS): Das Lesen versteht sie, neue Zeilen schreibt die Extension dann mit
  LF. Keine der geprüften Dateien nutzt sie. *Behoben, siehe Abschnitt 7.*

## 7. Offene Punkte behoben (26.09.2026)

Die Punkte aus Abschnitt 6 und die NIT zu `validKey`, umgesetzt nach der Taskliste (Abschnitt „Offene Punkte aus
0.3.0“, Entscheidungen P1–P6). Code wie in Commit `ac60ac2`, nach dem Review (unten).

| Prüfung | Aufruf | Ergebnis |
|---|---|---|
| Unit- und Komponententests | `npm run test:unit` | 876 bestanden |
| Integrationstests stable (1.139.1) und 1.90.0 | `npm run test:integration` | je 89 bestanden, 21 ausgelassen |
| Profil `multi` | ebenda | 5 bestanden |
| Profil `formats`, mit der Vorschau aus den Details, dem Kontextmenü und der Befehlspalette, einem fremden Key, einer unlesbaren Datei und einem gelöschten Template | ebenda | 15 bestanden |
| Typen, Lint, Format | `npm run typecheck`, `npm run lint`, `npm run format:check` | ohne Befund |

| Punkt | Umsetzung | Nachweis |
|---|---|---|
| Keys der Basisdatei ohne Wörter | Sie fehlen den anderen Sprachen nicht mehr, und wer sie hat, bekommt keinen `orphan-key` | Clone: `mds` 98 → 71 fehlende Keys (9 Lizenz-Links × 3 Sprachen), Metadatasets wieder 2.605 wie in Design §2.3; Datenordner: `mds` 30 → 3 (es bleibt der eine Key mit Text); `passwordRequest` bleibt eine Lücke |
| Override-Einheiten | Bereichsfeld `overrideBundlePattern` (`.+_override`, Angular `override`): keine Befunde zu fehlenden oder verwaisten Keys und fehlenden Dateien, die übrigen Regeln gelten | Unit-Tests; die `mds_override*`-Dateien sind im Clone und im Datenordner leer |
| Mail-Overrides | bleiben außerhalb des Mail-Bereichs: Sie ersetzen ganze Templates und kommen weder im Clone noch im Datenordner vor | – |
| Verlorene Zeichen | Regel `lost-character` | je 67 Befunde im Clone und im Datenordner: 62 `?` zwischen Buchstaben in `fr_FR` (Apostrophe, `n?ud` für `nœud`), 5 Ersatzzeichen für Umlaute in `mds.properties`; kein Fehlalarm |
| Zeilenenden nur mit CR | `detectStyle` erkennt `\r`; JSON- und Mail-Schreiber finden Zeilenanfänge über `lineStartAt` | Unit-Tests: Einfügen, Löschen und Umbenennen ergeben in JSON, `.properties` und Mail-XML mit CR dasselbe wie mit LF |
| `validKey` | Hinweis am Hook, welche Meldung ein abgelehnter Key bekommt | – |
| Mail-Vorschau | eigener Tab ohne Skripte, je Mail ein `iframe sandbox="" srcdoc` | Abnahme unten |

Abnahme der Vorschau in VS Code 1.139.1 mit der Kopie des Datenordners (`out/acceptance/preview.mjs`, echte Maus- und
Tastaturereignisse über das DevTools-Protokoll):

| Schritt | Ergebnis |
|---|---|
| Klick auf „Preview Mail“ in den Details von `invited.subject` | Tab „Mail Preview: invited“ in Gruppe 2 neben dem Editor; der Fokus bleibt auf dem Knopf im Editor, dessen Gruppe aktiv |
| Seite | vier Sprachen (`de_DE (reference)`, `default (en)`, `fr_FR`, `it_IT`), je ein Rahmen mit `sandbox=""`, kein Skript |
| Rahmen | `about:srcdoc` mit dem `lang` der Mail; `.content` hat `max-width: 500px` aus dem Stylesheet von edu-sharing, das Stylesheet greift also im Rahmen |
| Befehlspalette „Preview mail“ | fragt nach dem Template des Editors („Choose a mail template“) |
| Probe-Template (nur in der Kopie) mit Skript, entferntem Bild, `meta refresh` und Link | das Skript läuft nicht („Blocked script execution … sandboxed“), keine Anfrage an `http(s)` (das Bild: „violates … img-src data:“), keine Weiterleitung (die Rahmen bleiben `about:srcdoc`); in den drei Sprachen ohne das Template steht der Hinweis auf die Basisdatei |
| Details unter der Tabelle in der geteilten Ansicht | vorher 40 von 434 px, der Knopf verdeckt; behoben (`734dc58`): 190 px (40 %), der Knopf sichtbar |
| Kopie | danach unverändert (`git status` leer) |
| Nach dem Review wiederholt | alles wie oben; das Probe-Template steht nur in der Basisdatei, daher tragen jetzt alle vier Rahmen `lang="en"` |

Review mit frischem Kontext (`/better-coding-review`): 2 MAJOR, 4 MINOR, 4 NIT, alle behoben. Links fand ein Ausdruck
in quadratischer Zeit (`e99c8c1`). Eine Sprache, deren Datei edu-sharing nicht lesen kann, zeigte die Mail der
Basisdatei, obwohl edu-sharing dann keine verschickt; jetzt steht dort der Grund (`0d7f230`, dazu Kopf und Fuß im
Hinweis, die Sprache jedes Texts, das Template des Kontexts wie in edu-sharing). Die Befehlspalette bietet nur
Mail-Templates an (`bc9488e`), die Ansage sagt, dass die Vorschau öffnet (`ac60ac2`).
