# Einstellungen

Alle Einstellungen der Extension beginnen mit `eduI18n.`. Für das Repository von edu-sharing ist keine nötig: Die
Standardwerte passen darauf. Die Kurzfassung steht im [README](../README.md#einstellungen). Hier steht jede
Einstellung mit Beispielen, dazu die Grenzen und die geplanten Einstellungen.

## Wo man sie ändert

- **Oberfläche:** Strg+, (macOS: Cmd+,) öffnet die Einstellungen; dort nach `edu-sharing i18n` suchen. Oben wählt man
  die Ebene:
  - „Benutzer“ gilt in jedem Arbeitsbereich.
  - „Arbeitsbereich“ gilt nur in diesem und wird in `.vscode/settings.json` gespeichert.
  - „Ordner“ gibt es zusätzlich, wenn der Arbeitsbereich mehrere Ordner hat.
- **JSON:** Befehlspalette (Strg+Umschalt+P) → „Einstellungen: Benutzereinstellungen öffnen (JSON)“ bzw.
  „Einstellungen: Arbeitsbereichseinstellungen öffnen (JSON)“ (englisch „Preferences: Open User Settings (JSON)“).
  - Die strukturierten Einstellungen `areas`, `roots`, `variants` und `checks.severity` bearbeitet man hier.
  - VS Code schlägt beim Tippen die Felder vor und markiert ungültige.
- Eine Änderung wirkt gleich: Die Extension liest die Übersetzungsordner neu ein.

Drei Regeln gelten für alle Einstellungen:

1. **Vertrauen:** `areas`, `variants` und `roots` aus den Einstellungen des Arbeitsbereichs gelten erst, wenn der
   Arbeitsbereich vertrauenswürdig ist.
   - Im eingeschränkten Modus nimmt VS Code für sie nur die Benutzereinstellungen.
   - Grund: Ein fremdes Repository soll weder Pfade noch reguläre Ausdrücke vorgeben.
2. **Zusammenführen:** Objekte (`variants`, `roots`, `checks.severity`) führt VS Code über die Ebenen zusammen.
   - Einträge aus Benutzer- und Arbeitsbereichseinstellungen kommen zu den Standards hinzu.
   - Ein gleichnamiger Eintrag ändert nur die Felder, die er angibt.
   - Listen (`areas`, `exclude`, `checks.ignoreSameAsReference`) dagegen ersetzt die speziellere Ebene ganz.
3. **Ungültige Werte** meldet die Extension oben in der Seitenleiste „Bereiche“ und im Protokoll.
   - Für eine ungültige Einstellung gilt ihr Standard.
   - Ein ungültiger Eintrag einer Liste oder eines Objekts fällt weg, die übrigen gelten.

## Übersicht

| Einstellung | Standard | Kurz |
|---|---|---|
| `eduI18n.referenceLanguage` | `de` | Sprache, mit der verglichen wird |
| `eduI18n.baseFileLanguage` | `en` | Sprache der Dateien ohne Sprachsuffix |
| `eduI18n.areas` | `[]` | eigene Übersetzungsbereiche oder Ersatz eines eingebauten |
| `eduI18n.roots` | `{}` | feste Wurzelordner je Bereich statt der Erkennung |
| `eduI18n.exclude` | `node_modules`, `.git`, `dist`, `out`, `target`, `build` | Ordner, die nie durchsucht werden |
| `eduI18n.variants` | `de-informal`, `de-no-binnen-i` | dünn besetzte Sprachvarianten und ihre Regeln |
| `eduI18n.checks.severity` | `{}` | Schweregrad je Prüfregel |
| `eduI18n.checks.ignoreSameAsReference` | `OK`, `E-Mail`, `CC-0`, `ID` | Texte, die wie die Referenz lauten dürfen |
| `eduI18n.diagnostics.missing` | `aggregate` | fehlende Keys in „Probleme“: je Datei, je Key oder gar nicht |
| `eduI18n.backup.intervalMinutes` | `10` | Abstand der Sicherungen während der Arbeit |
| `eduI18n.backup.keep` | `10` | Anzahl der aufbewahrten Sicherungen |

## Sprachen

### `eduI18n.referenceLanguage`

Standard: `de`. An dieser Sprache misst die Extension die anderen:
- Fehlende Keys, Platzhalter und HTML-Tags vergleicht sie mit ihr.
- Ein neuer Key braucht zuerst einen Text in ihr.
- `de` passt auch auf `de_DE`.
- Ein Bereich kann eine eigene Referenz haben (`referenceLanguage` in `eduI18n.areas`).
- Sprachvarianten werden nie Referenz.

### `eduI18n.baseFileLanguage`

Standard: `en`. Die Sprache von Dateien ohne Sprachsuffix. Sie zählt nur für Bereiche, deren Dateimuster die Sprache
optional macht (`[…]` in `files`, etwa `{bundle}[_{locale}].properties`):
- Bei edu-sharing sind das `mds.properties` und die anderen Gruppen der Metadatasets sowie `templates.xml` der
  Mail-Templates. edu-sharing liest sie als letzten Rückfall.
- Der Editor nennt eine solche Datei `default (en)`.
- Im Angular-JSON hat jede Datei ein Suffix.

## Bereiche und Ordner

Ein **Bereich** ist eine Art von Übersetzungsdateien:
- ein Dateiformat,
- ein Pfadmuster unterhalb eines Wurzelordners,
- ein Muster für den Teil des Pfads, der die Sprache nennt.

Eingebaut sind drei Bereiche. Angular-JSON, `edu-sharing.angular`:

```json
{
  "id": "edu-sharing.angular",
  "label": "Angular JSON",
  "format": "json-nested",
  "files": "{bundle}/{locale}.json",
  "localePattern": "[a-z]{2}(?:-[a-z0-9]+)*",
  "bundleOrder": ["common", "admin", "recycle", "workspace", "…", "override"],
  "mergeSemantics": "shallow-toplevel",
  "detect": { "glob": "**/common/de.json", "marker": "common/de.json" }
}
```

Metadatasets, `edu-sharing.mds`:

```json
{
  "id": "edu-sharing.mds",
  "label": "Metadatasets",
  "format": "properties",
  "files": "{bundle}[_{locale}].properties",
  "localePattern": "[a-z]{2}_[A-Z]{2}",
  "ignoredKeys": ["this_is_a_bug_the_first_line_will_not_be_translated"],
  "placeholderSyntax": "single-brace",
  "detect": { "glob": "**/metadatasets/i18n/mds.properties", "marker": "mds.properties" }
}
```

Mail-Templates, `edu-sharing.mail`:

```json
{
  "id": "edu-sharing.mail",
  "label": "Mail templates",
  "format": "mail-xml",
  "files": "templates[_{locale}].xml",
  "localePattern": "[a-z]{2}_[A-Z]{2}",
  "bundleName": "templates",
  "detect": { "glob": "**/mailtemplates/templates.xml", "marker": "templates.xml" }
}
```

So funktioniert die Erkennung:
- Sie findet jede Markerdatei (`glob`) im Arbeitsbereichsordner, auch in Unterordnern, etwa in einem Datenordner.
- Der Pfad vor dem Marker ist eine Wurzel, bei edu-sharing `Frontend/src/assets/i18n`,
  `config/defaults/src/main/resources/metadatasets/i18n` und `…/mailtemplates`.
- Unter der Wurzel ordnet `files` jede Datei einer Einheit und einer Sprache zu:
  - Angular: jeder Unterordner eine Einheit (`common`, `admin`, …), jede Datei darin eine Sprache;
  - Metadatasets: `mds_de_DE.properties` gehört zur Einheit `mds` und zur Sprache `de_DE`, `mds.properties` zur Datei
    ohne Suffix (`default`);
  - Mail-Templates: alle Dateien bilden die Einheit `templates`; `templates_de_DE_override.xml` gehört nicht dazu.
- Die Referenz ist überall `de` (`eduI18n.referenceLanguage`); bei Metadatasets und Mail-Templates passt sie auf
  `de_DE`.

### `eduI18n.areas`

Standard: `[]`, also nur die eingebauten Bereiche. Eigene Bereiche kommen hinzu; ein Bereich mit der `id` eines
eingebauten ersetzt diesen.

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `id` | ja | eindeutige ID; die ID eines eingebauten Bereichs ersetzt diesen |
| `label` | | Name in den Ansichten; Standard: die ID |
| `format` | ja | Dateiformat: `json-nested` (verschachteltes JSON wie bei Angular), `properties` (Java-Properties, ein Key ist der ganze Name) oder `mail-xml` (Mail-Templates von edu-sharing) |
| `files` | ja | Pfad der Dateien unterhalb einer Wurzel, mit `{bundle}` (Einheit) und `{locale}` (Sprache); `[…]` markiert einen optionalen Teil |
| `localePattern` | ja | regulärer Ausdruck für `{locale}`, ohne `^` und `$` |
| `roots` | ja, wenn `detect` fehlt | Wurzelordner, relativ zum Arbeitsbereichsordner |
| `detect` | | Erkennung der Wurzeln: `glob` findet Markerdateien, `marker` ist ihr Pfad unterhalb der Wurzel; der Glob muss auf den Marker enden |
| `bundlePattern` | | regulärer Ausdruck für `{bundle}`; Standard: ein Pfadsegment |
| `bundleName` | | Name der Einheit für Dateien ohne Einheitenteil im Pfad |
| `referenceLanguage` | | Referenzsprache dieses Bereichs; Standard: `eduI18n.referenceLanguage` |
| `bundleOrder` | | Reihenfolge, in der die Anwendung die Einheiten lädt |
| `mergeSemantics` | | `shallow-toplevel` oder `none`, siehe unten |
| `ignoredKeys` | | Keys, die keine Übersetzungen sind: Einheit, Prüfungen und Editor lassen sie aus, die Dateien behalten sie, und neue Keys kommen nie davor |
| `placeholderSyntax` | | `double-brace` (Standard, `{{name}}`) oder `single-brace` (`{name}`); danach prüft die Extension Platzhalter. `{{GENDER_SEPARATOR}}` gilt in beiden |

`mergeSemantics`:
- `shallow-toplevel`: Die Anwendung führt die Einheiten flach zusammen; eine spätere Einheit ersetzt ganze Werte der
  obersten Ebene. Das schaltet die Prüfungen `key-overridden` und `subtree-lost` ein.
- `none`: Die Einheiten werden nicht zusammengeführt.

Regeln für Pfade und Ausdrücke:
- **Pfade:** `files` und `roots` bleiben im Arbeitsbereich.
  - Verboten sind absolute Pfade, `..`, `\` sowie leere oder `.`-Segmente.
  - Trennzeichen ist `/`.
- **Reguläre Ausdrücke:** `localePattern`, `bundlePattern` und die Varianten sind JavaScript-Ausdrücke ohne Flags.
  - Groß- und Kleinschreibung zählt.
  - Sie dürfen höchstens 1.000 Zeichen lang sein.
  - Verboten ist eine mehr als dreimal wiederholte Gruppe, die mit einem wiederholten Teil beginnt, wie `(a+)+`
    oder `(a+){1,20}`: Solche Ausdrücke können bei jedem Einlesen exponentiell lange laufen.
  - In JSON wird jeder Backslash verdoppelt: `"\\d"` für `\d`.

Beispiel: Übersetzungen eines Kundenprojekts unter `customer/i18n/<Einheit>/<Sprache>.json`:

```json
"eduI18n.areas": [
  {
    "id": "kunde",
    "label": "Kunde",
    "format": "json-nested",
    "roots": ["customer/i18n"],
    "files": "{bundle}/{locale}.json",
    "localePattern": "[a-z]{2}(-[a-z0-9]+)*"
  }
]
```

### `eduI18n.roots`

Standard: `{}`. Feste Wurzelordner je Bereichs-ID, relativ zum Arbeitsbereichsordner:

```json
"eduI18n.roots": {
  "edu-sharing.angular": ["Frontend/src/assets/i18n"],
  "edu-sharing.mds": ["config/defaults/src/main/resources/metadatasets/i18n"]
}
```

- Für einen Bereich mit Eintrag sucht die Extension nicht mehr selbst.
- Das hilft, wenn die Erkennung zu viel findet (etwa Kopien in Unterordnern) oder mehr als 20 Wurzeln.
- Der Befehl „Übersetzungsordner festlegen…“ schreibt die Einstellung in die Einstellungen des Arbeitsbereichsordners.
- „Automatisch erkennen“ im selben Befehl entfernt den Eintrag wieder.

### `eduI18n.exclude`

Standard: `**/node_modules/**`, `**/.git/**`, `**/dist/**`, `**/out/**`, `**/target/**`, `**/build/**`.

Das sind Glob-Muster für Ordner, die die Extension nie nach Übersetzungsdateien durchsucht. Eine eigene Liste
ersetzt die Standardliste; deren Muster also bei Bedarf mit aufnehmen:

```json
"eduI18n.exclude": [
  "**/node_modules/**", "**/.git/**", "**/dist/**", "**/out/**", "**/target/**", "**/build/**",
  "**/archiv/**"
]
```

## Sprachvarianten

### `eduI18n.variants`

Eine Variante ist eine dünn besetzte Sprache: Ihre Datei (etwa `de-informal.json`) enthält nur die Texte, die von
ihrer Basis abweichen. Für alle anderen Keys zeigt die Anwendung den Text der Basis.

Dazu gehören drei Prüfungen:
- `requiredWhen`: Trifft der Ausdruck auf den Text der Basis zu, braucht die Variante einen eigenen Text. Das meldet
  die Prüfung `variant-needed`, etwa bei der Sie-Form für `de-informal`.
- `forbidden`: Text, den die Variante nicht enthalten soll; das meldet `variant-inconsistent`.
- Keys, die die Basis nicht hat, meldet `variant-orphan`.

Standard:

```json
"eduI18n.variants": {
  "de-informal": {
    "base": "de",
    "requiredWhen": "\\b(?:Sie|Ihnen|Ihr|Ihre|Ihrem|Ihren|Ihrer|Ihres)\\b",
    "forbidden": "\\b(?:Sie|Ihnen|Ihr|Ihre|Ihrem|Ihren|Ihrer|Ihres)\\b"
  },
  "de-no-binnen-i": {
    "base": "de",
    "requiredWhen": "\\{\\{GENDER_SEPARATOR\\}\\}|[*:_]innen\\b|[a-zäöüß]Innen\\b",
    "forbidden": "\\{\\{GENDER_SEPARATOR\\}\\}"
  }
}
```

Eigene Varianten kommen zu diesen hinzu. Ein gleichnamiger Eintrag ändert nur die angegebenen Felder, etwa:

```json
"eduI18n.variants": {
  "de-informal": { "forbidden": "\\b(?:Sie|Ihnen)\\b" }
}
```

Für die Ausdrücke gelten die Regeln oben unter [Bereiche und Ordner](#bereiche-und-ordner).

## Prüfregeln

### `eduI18n.checks.severity`

Standard: `{}`. Der Schweregrad je Prüfregel ist `error` (Fehler), `warning` (Warnung), `info` (Hinweis) oder `off`
(aus). Er bestimmt:
- das Symbol in der Ansicht „Probleme“, in der Seitenleiste und im Editor,
- die Zähler in der Statusleiste.

```json
"eduI18n.checks.severity": {
  "same-as-reference": "off",
  "orphan-key": "info"
}
```

| Regel | Standard | Meldet |
|---|---|---|
| `parse-error` | Fehler | Eine Datei ist nicht lesbar. |
| `not-utf8` | Fehler | Eine JSON- oder Mail-Datei ist kein gültiges UTF-8 (`.properties` dürfen ISO-8859-1 sein, Mail-Templates, wenn sie es deklarieren). |
| `bom-first-key` | Warnung | Eine `.properties`-Datei beginnt mit einer Byte-Order-Mark; Java liest sie als Teil des ersten Keys, der dann nie gefunden wird. |
| `non-string-value` | Warnung | Ein Wert ist kein Text, z. B. eine Zahl oder eine Liste. |
| `duplicate-key` | Warnung | Ein Key kommt in derselben Datei doppelt vor; nur eine Definition gilt: in JSON und `.properties` die letzte, in einem Mail-Template das erste Feld und das letzte Template. |
| `missing-file` | Warnung | Einer Einheit fehlt die Datei einer Sprache. |
| `missing-key` | Warnung | Ein Key der Referenz fehlt in einer Sprache; der Rückfalltext erscheint. |
| `empty-value` | Warnung | Ein Text ist leer, obwohl die Referenz einen hat; er verdeckt den Rückfall. |
| `orphan-key` | Warnung | Ein Key existiert in einer Sprache, aber nicht in der Referenz. |
| `misplaced-key` | Warnung | Ein verwaister Key, dessen letztes Segment zu einem fehlenden Key passt: vermutlich falsch einsortiert. |
| `placeholder-malformed` | Fehler | Ein Platzhalter ist falsch geschrieben, z. B. `{{{x}}`. |
| `placeholder-mismatch` | Fehler | Die Platzhalter weichen von der Referenz ab. |
| `html-mismatch` | Warnung | Die HTML-Tags weichen von der Referenz ab. |
| `variant-needed` | Warnung | Der Basistext braucht in einer Variante einen eigenen Text. |
| `variant-inconsistent` | Hinweis | Der Text einer Variante enthält, was er nicht enthalten soll. |
| `variant-orphan` | Hinweis | Eine Variante hat einen Key, den ihre Basis nicht hat. |
| `key-overridden` | Warnung | Ein Key der obersten Ebene steht in mehreren Einheiten mit anderem Text; die spätere Einheit gewinnt. |
| `subtree-lost` | Fehler | Ein Objekt der obersten Ebene steht in mehreren Einheiten; die Keys der früheren gehen zur Laufzeit verloren. |
| `same-as-reference` | Hinweis | Ein Text gleicht der Referenz und ist vielleicht unübersetzt. |

`key-overridden` und `subtree-lost` prüft die Extension nur in Bereichen mit `"mergeSemantics": "shallow-toplevel"`,
wie dem eingebauten.

### `eduI18n.checks.ignoreSameAsReference`

Standard: `["OK", "E-Mail", "CC-0", "ID"]`. Diese Texte dürfen wie die Referenz lauten, ohne dass `same-as-reference`
sie meldet.
- Verglichen wird der ganze Text, mit Groß- und Kleinschreibung.
- Texte mit weniger als vier Buchstaben meldet die Regel ohnehin nicht, Sprachvarianten auch nicht.
- Eine eigene Liste ersetzt die Standardliste.

### `eduI18n.diagnostics.missing`

Standard: `aggregate`. So erscheinen fehlende Keys in der Ansicht „Probleme“:
- `aggregate`: ein Problem je Datei mit der Anzahl der fehlenden Keys;
- `individual`: ein Problem je fehlendem Key;
- `off`: gar nicht.

Seitenleiste, Statusleiste und Editor zeigen fehlende Keys in jedem Fall.

## Sicherungen

### `eduI18n.backup.intervalMinutes`

Standard: `10`. Die Extension sichert die Übersetzungsdateien:
- vor der ersten Änderung einer Sitzung;
- vor Änderungen mehrerer Einheiten, etwa „Sprache hinzufügen“;
- während der Arbeit erneut, sobald seit der letzten Sicherung so viele Minuten vergangen sind.

`0` schaltet nur die zeitgesteuerten Sicherungen ab.

### `eduI18n.backup.keep`

Standard: `10`, erlaubt sind 1 bis 100. So viele Sicherungen bewahrt die Extension auf; ältere löscht sie.
- Die Sicherungen liegen im Speicher der Extension für diesen Arbeitsbereich (im VS-Code-Benutzerordner unter
  `workspaceStorage`), nie im Repository.
- Zurückholen: „Übersetzungsdateien aus einer Sicherung wiederherstellen…“.
- Beide Sicherungseinstellungen gelten für das ganze Fenster, nicht je Ordner.

## Grenzen

Damit ein Repository VS Code nicht lahmlegen kann, gilt:
- höchstens 20 erkannte Wurzeln je Bereich und Arbeitsbereichsordner (mehr lassen sich in `eduI18n.roots` festlegen);
- keine Wurzel mit mehr als 5.000 Dateien, wobei alle Dateien unter der Wurzel zählen;
- keine Übersetzungsdatei über 5 MB;
- keine Datei hinter einer symbolischen Verknüpfung im Arbeitsbereichsordner, weil sie aus dem Ordner herausführen
  könnte.

## Geplante Einstellungen

Mit den nächsten Phasen kommen Einstellungen hinzu:
- für die KI (`eduI18n.ai.*`, siehe [README](../README.md#ki-füllen-und-b-api-schlüssel));
- für Import und Export, Metadaten und Kontext.

Die geplante Liste steht im [Design, Abschnitt 9](plans/2026-09-24-edu-sharing-i18n-vscode-design.md#9-einstellungen-contributesconfiguration).
