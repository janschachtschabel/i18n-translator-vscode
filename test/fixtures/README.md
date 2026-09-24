# Test fixtures

All fixtures are **synthetic**. They mimic the structure of the edu-sharing repository
(`Frontend/src/assets/i18n/{category}/{locale}.json`) but contain no text copied from it
(edu-sharing is GPL-3.0, this extension is Apache-2.0).

Files under `test/fixtures/` are marked `-text` in `.gitattributes`: their bytes are part of the
test contract and must not be touched by line-ending conversion or formatters.

## `workspace-basic` – Angular JSON area

Locales in the area: `de` (reference), `en`, `fr`, `it` (full languages) and the sparse variants
`de-informal`, `de-no-binnen-i`. Merge order (edu-sharing `TRANSLATION_LIST`): `common` before `admin`,
`editorial`; `broken` is not part of the list.

### Expected findings (phase 1 rules)

| # | Rule | Severity | Bundle | Locale | Entry | Note |
|---|---|---|---|---|---|---|
| 1 | `missing-key` | warning | common | fr | `CANCEL` | |
| 2 | `missing-key` | warning | common | fr | `WORKSPACE.FILE.TITLE` | |
| 3 | `missing-key` | warning | common | it | `WORKSPACE.FILE.TITLE` | |
| 4 | `empty-value` | warning | common | fr | `SAVE` | `""` overrides the fallback |
| 5 | `placeholder-mismatch` | error | common | fr | `ERROR_TITLE` | missing `date`, extra `data` |
| 6 | `placeholder-malformed` | error | common | it | `ERROR_TITLE` | `{{{date}}` |
| 7 | `html-mismatch` | warning | common | fr | `BOLD_HINT` | `<b>` missing |
| 8 | `orphan-key` | warning | common | it | `OLD_KEY` | |
| 9 | `misplaced-key` | warning | common | it | `FILE.TITLE` | suggestion `WORKSPACE.FILE.TITLE` |
| 10 | `variant-needed` | warning | common | de-no-binnen-i | `PERSON` | `{{GENDER_SEPARATOR}}` in `de` |
| 11 | `key-overridden` | warning | common | de | `ASK` | winner `admin` |
| 12 | `key-overridden` | warning | common | en | `ASK` | winner `admin` |
| 13 | `same-as-reference` | info | common | en | `MINUTE` | |
| 14 | `same-as-reference` | info | common | fr | `MINUTE` | `OK` is on the ignore list |
| 15 | `missing-file` | warning | admin | fr | – | |
| 16 | `missing-file` | warning | admin | it | – | |
| 17 | `variant-needed` | warning | admin | de-informal | `ASK` | formal address in `de`, no variant file |
| 18 | `same-as-reference` | info | admin | en | `ADMIN.TITLE` | |
| 19 | `missing-file` | warning | editorial | fr | – | |
| 20 | `missing-file` | warning | editorial | it | – | |
| 21 | `parse-error` | error | broken | de | – | `{"a": }` |

Totals: **3 errors, 15 warnings, 3 infos.**

Problems panel (mode `aggregate`, infos excluded): **17 diagnostics** – the two `missing-key`
findings for `common/fr.json` are combined into one.

Rule interactions these totals depend on:
- `missing-key` is only computed for locales that **have** a file in the bundle. A missing file is one
  `missing-file` finding, not one `missing-key` per entry (otherwise `admin`/`editorial` would add 6).
- `misplaced-key` **replaces** `orphan-key` for the same entry (`it` `FILE.TITLE` is reported once).
- If the **reference file** of a bundle does not parse, the bundle gets its `parse-error` and no
  completeness findings (`missing-key`, `orphan-key`, `misplaced-key`, `empty-value`).

Not reported on purpose:
- `en` `ERROR_TITLE` uses `{{ date }}` (whitespace is normalized).
- `PERSON` in `en`/`fr`/`it` has no `{{GENDER_SEPARATOR}}` (German-only marker).
- `de-informal` has no file in `admin`/`editorial`/`broken` (variants are sparse), but `admin` still
  needs a variant for `ASK` (finding 17).
- `broken/en.json` contains `b`, which the other locales lack. Without the parse-error suppression above
  it would show up as `orphan-key` (en) and `missing-key` (fr, it).
- `CCMAIL.mail.smtp.server` and `MIME.application/vnd.ms-excel` keep their dotted/slashed segments.
