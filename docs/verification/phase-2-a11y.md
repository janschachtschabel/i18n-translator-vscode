# Barrierefreiheit Phase 2 – Übersetzungseditor

> Gehört zu Task 2.16 in [`../plans/2026-09-24-edu-sharing-i18n-vscode-tasks.md`](../plans/2026-09-24-edu-sharing-i18n-vscode-tasks.md).
> Ziel: WCAG 2.2 AA (Design §7.4). Stand: 26.09.2026 nach dem Review von Block C, Branch `feat/extension-v1`.
> Automatische Prüfungen laufen in der CI; NVDA und die Sichtprüfung in VS Code sind Handarbeit (Abschnitt 5).

## 1. Automatisch geprüft (CI)

| Prüfung | Wo | Ergebnis |
|---|---|---|
| axe-core, 0 Verstöße und nichts Unentschiedenes außer dem Kontrast (braucht Layout) | jede Komponententest-Datei: App, Werkzeugleiste, Filter, Tabelle, Liste, Zell-Editor, Details | bestanden |
| axe mit offenem Editor, mit Konflikt, mit „nicht gespeichert“, in der Liste und in den Details | `cellEditor.test.tsx`, `details.test.tsx` | bestanden |
| Tastatur-Durchlauf (Tab-Reihenfolge wie im Browser, Tasten der Widgets) | `keyboardWalk.test.tsx` | bestanden, siehe 2 |
| Tasten des Grids (Pfeile, Pos1/Ende, Bild↑/↓, Strg+Pos1/Ende, Alt+↓/↑) | `table.test.tsx`, `gridKeys.test.ts` | bestanden |
| Tasten des Editors (Enter/F2, Enter/Strg+Enter, Tab/Umschalt+Tab, Esc, Eingabemethoden) | `cellEditor.test.tsx` | bestanden |
| Fokus kehrt zurück (Editor geschlossen, Zeile verschwunden, „Text löschen“, Wahl im Konflikt verschwunden, Tabelle mit Details ↔ Liste in derselben Sprache, auch hinter den ersten 200 Zeilen) | `table.test.tsx`, `cellEditor.test.tsx`, `list.test.tsx` | bestanden |
| Fokus wird nicht genommen (Liste kehrt nach „kein Treffer“ zurück, während die Filterauswahl ihn hat) | `list.test.tsx`, `store.test.ts` | bestanden |
| Konflikt: Enter führt zur Wahl, Esc verwirft, Verlassen behält den Entwurf als „nicht gespeichert“ | `cellEditor.test.tsx`, `edits.test.ts` | bestanden |
| Ansagen (Trefferzahl nach Tipp-Pause, gespeichert, gelöscht, nicht gespeichert mit Key und Sprache, Konflikt, Editor ausgeblendet, Einheit geöffnet oder weg) | `filterBar`, `edits`, `store` | bestanden |
| Jeder Text in Deutsch, gleiche Argumente | `l10n.test.ts` | bestanden |

## 2. Tastatur-Durchlauf

Tab-Reihenfolge der Tabellenansicht (1.300 px, Details an), wie der Test sie festhält:

1. Sprunglinks „Zur Suche“, „Zur Tabelle“ (nur bei Fokus sichtbar)
2. Werkzeugleiste: Ansicht (eine Radiogruppe, ein Halt), „Lange Texte umbrechen“, „Details anzeigen“,
   „Key hinzufügen…“, „Sprache hinzufügen…“, „Letzte Änderung rückgängig machen“
3. Angezeigte Sprachen: ein Kontrollkästchen je Sprache
4. Filter: Suchen, Suchen in, Regulärer Ausdruck, Groß-/Kleinschreibung, Zeigen
5. Tabelle: **ein** Halt (roving tabindex); darin Pfeiltasten, Enter/F2 öffnet den Editor. Die Zeile über der
   Tabelle nennt die Tasten (auch Cmd+Rücktaste auf dem Mac) und ist die Beschreibung des Grids (`aria-describedby`); die aktive Zelle nennt ihre
   Tasten zusätzlich in `aria-keyshortcuts`.
6. Details: ein Text je Sprache des aktiven Keys, auch ausgeblendete
7. **keine Falle:** Auf dem letzten Halt (und mit Umschalt+Tab auf dem ersten) fängt keine Taste Tab ab; der
   Browser gibt den Fokus an VS Code weiter. Der Test prüft das am Ereignis, nicht an seiner Hilfsfunktion.

Im Grid: Enter öffnet den Editor, Tab speichert und öffnet die nächste Zelle, Esc schließt ihn und gibt den Fokus
der Zelle zurück, Tab verlässt das Grid zu den Details, Umschalt+Tab kehrt zur selben Zelle zurück. Im Konflikt
führen Enter und Tab zu „Neuen Text übernehmen“ und „Meinen Text behalten“; Esc verwirft den Entwurf. In der
Liste erreicht Tab die Texte jeder Karte; die Überschriften nehmen nur einen übergebenen Fokus an.

## 3. Kontraste

Berechnet aus den Theme-Dateien von VS Code 1.139 (Registry-Vorgaben eingerechnet) für die Tokens, die die Webview
nutzt. Text braucht 4,5:1, Bedienelemente und Symbole 3:1.

| Paar | Dark Modern | Light Modern | Dark+ | Light+ | HC Dark | HC Light |
|---|--:|--:|--:|--:|--:|--:|
| Text / Hintergrund | 10,26 | 11,20 | 10,38 | 6,19 | 21,00 | 14,55 |
| Beschreibung (Hinweise, Marken) / Hintergrund | 6,08 | 11,20 | 5,76 | 4,88 | 9,96 | 5,47 |
| Feldtext / Feld (Suche, Zell-Editor) | 8,10 | 11,20 | 6,87 | 6,19 | 21,00 | 14,55 |
| Fokus / Hintergrund | 3,64 | 6,31 | 3,96 | 3,35 | 8,18 | 5,47 |
| Fehler-Symbol / Hintergrund | 4,61 | 4,74 | 4,67 | 4,74 | 8,55 | 6,61 |
| Warn-Symbol / Hintergrund | 7,14 | 3,12 | 7,22 | 3,12 | 14,80 | 6,24 |
| Feldrahmen / Hintergrund | 1,49 | 1,57 | 1,51 | 1,57 | 10,55 | 8,98 |

- **Fokus in Feldern:** Auf dem Feldhintergrund erreichte der Fokusrahmen in Dark Modern 2,87 und in Dark+ 2,62.
  Er liegt deshalb bei Textfeldern und Auswahllisten jetzt außen, auf dem Editorhintergrund (3,64 bzw. 3,96).
- **Fokus auf Schaltflächen:** Innen, auf dem Schaltflächenhintergrund (`button.secondaryBackground`), erreichte
  der Fokusrahmen in Light+ nur 1,64 und in Dark+ 2,59. Er liegt jetzt wie in VS Code 2 px außen, auf dem
  Editorhintergrund (3,35 bzw. 3,96); die scrollende Details-Leiste lässt ihm dafür Rand.
- **Feldrahmen:** Sie erreichen in den Standard-Themes keine 3:1, wie VS Codes eigene Felder. Entscheidung: Die
  Webview folgt den Theme-Tokens. Jedes Feld hat eine sichtbare Beschriftung, und die Kontrastthemes liefern
  kräftige Rahmen.
- **Fehlerfarbe als Text** (`errorForeground`, Light Modern 3,35): Die Webview schreibt keine Meldung in dieser
  Farbe; Meldungen stehen in Textfarbe mit rotem Symbol.

## 4. In Chromium geprüft (Vorschau im Scratchpad, echtes Webview-Bundle)

- **Themes:** Dark Modern, Light+, High Contrast und High Contrast Light mit offenem Editor und Details. Die
  Kontrastthemes zeigen Kontrastrahmen um Felder, Chips und Leisten.
- **Kopfbereich kompakter:**
  - Überschrift 1,5em, Werkzeugleiste und Filter mit kleineren Abständen.
  - Bei 1.000 × 720 px beginnt die Tabelle bei 296 statt 378 px, und ihr bleiben 237 statt 188 px neben den
    Details darunter.
- **Mehrere Statusmarken:**
  - Im einzeiligen Modus verdrängten zwei Marken (z. B. „nicht gespeichert“ und „Platzhalter“) den Text einer
    schmalen Spalte ganz.
  - Jetzt brechen nur solche Zellen um. Der Text behält seinen Platz (87 px), die übrigen Zeilen bleiben einzeilig.
- **Umbruch bei 320 px** (Liste) und das Wachsen des Editors sind seit 2.11 und 2.12 geprüft.

## 5. Von Hand (offen, für die Abnahme 2.18)

Im Arbeitsbereich mit dem Clone oder dem Fixture, VS Code auf Deutsch:

**NVDA mit VS Code (Windows):**

- [ ] Editor öffnen: „common ist geöffnet. Keys: … · Sprachen: …“ wird angesagt.
- [ ] Tab bis zur Tabelle: „Tabelle common“ mit der Tastenzeile als Beschreibung, Zeile, Spalte, Inhalt;
  Pfeiltasten sagen Zelle und Befund („Warnung: CANCEL fehlt in fr“). Werden die Tasten der aktiven Zelle
  (`aria-keyshortcuts`) genannt?
- [ ] Enter: Feld „SAVE in fr“ mit Beschreibung (Prüfung mit der Schwere in Worten, Tasten); Tippen eines
  fehlenden Platzhalters sagt „Platzhalter und HTML-Tags wie in der Referenz“.
- [ ] Enter: „Gespeichert.“; ein Fehler sagt „SAVE in fr: nicht gespeichert. …“; „Text löschen“ sagt „Text gelöscht.“.
- [ ] Details: Überschrift „Details: KEY“, je Sprache Schaltfläche „fr: Text“, Befund und Hinweis.
- [ ] Filter: Trefferzahl nach der Tipp-Pause.
- [ ] Liste (schmales Editorfenster): Überschrift je Key, Schaltflächen je Sprache.

**Sichtprüfung in Light+, Dark+, High Contrast und High Contrast Light:**

- [ ] Fokus überall sichtbar, auch auf dem Feld des Editors und in den Details.
- [ ] Nach Enter und Esc steht der Fokus wieder auf der Zelle (in der Liste auf dem Text).
- [ ] Rückfrage beim Leeren eines Textes und bei „Text löschen“ (modaler Dialog des Hosts).
- [ ] Kontextmenü (Rechtsklick und Umschalt+F10) auf einer Zeile: Key hinzufügen, umbenennen, löschen.
- [ ] Konflikt: eine Datei außerhalb ändern, während ihr Text bearbeitet wird; Enter führt zu „Neuen Text
  übernehmen“ und „Meinen Text behalten“, Esc verwirft den Entwurf.
- [ ] 200 % Zoom: Kopfbereich und Tabelle; bleibt die Tabelle nutzbar?

## 6. Bewusst offen

- Bei sehr geringer Höhe (etwa 200 % Zoom) scrollen Seite und Tabelle weiterhin ineinander. Eine eigene Ansicht
  für niedrige Fenster (Seite scrollt, Tabelle nicht) wäre der nächste Schritt; der kompaktere Kopfbereich mildert
  es.
- Zebrastreifen: nein. VS Codes Listen und Tabellen kennen keine; Zeilenlinien und der Fokus genügen.
- Eine Layout-Prüfung in echtem Chromium gibt es in der CI nicht; die Vorschau im Scratchpad ersetzt sie.
