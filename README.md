# Event Log Pattern Catalogue

An explorable version of `Patterns_findings.xlsx`, plus links to the Jupyter
notebooks that implement the patterns.

## Looking at the site

Clone the repository and open `docs/index.html` in a browser. No server, no
install, no internet connection needed — the whole catalogue is in
`docs/data/patterns.js`.

```
git clone https://github.com/initial-analysis-patterns/initial-analysis-patterns.git
open initial-analysis-patterns/docs/index.html          # macOS
xdg-open initial-analysis-patterns/docs/index.html      # Linux
```

What it gives you over the spreadsheet: all patterns at a glance, filters
(category, tags, dataset the evidence comes from), free-text search across every
field, per-pattern pages with dependencies as clickable links, and the
implementing notebook readable in the page.

The workbook's threaded comments are internal review discussion and are
deliberately **not** carried into the generated site.

Keyboard: `/` to search, `Esc` back to the list, `←`/`→` between patterns.

## Updating the site after the workbook changes

`Patterns_findings.xlsx` stays the master. The website is generated from it.

```
pip install -r tools/requirements.txt     # once
python tools/build_patterns.py
git add Patterns_findings.xlsx docs/data && git commit -m "Update catalogue"
```

This rewrites `docs/data/patterns.js` (the catalogue), `docs/data/notebooks.js`
(the rendered notebooks) and `docs/data/build-report.txt` (data issues found —
nothing is silently fixed).
The GitHub Action in `.github/workflows/build-catalogue.yml` does the same
automatically whenever a new workbook is pushed.

### What the build reads from the workbook

| In the workbook | On the site |
|---|---|
| Sheet `Pattern Definitions & Examples `, header row 9, rows 11 onwards | one pattern each |
| *Tags* (one per line and/or comma-separated) | filterable tag chips |
| Sheets `EventLog Analysis Results` + `Utility`, joined by *No.* | the **Evidence and Utility** section, one block per event log |
| *Dependencies* naming other patterns | clickable links between patterns |
| *Relation with Imperfection Patterns* | shown as a plain-text section |

The catalogue columns read from `Pattern Definitions & Examples ` are *No.,
Category, Tags, Name, Information Need / Modification Objective, Motivation /
Context, Preconditions, Approach, Output, Dependencies* and *Relation with
Imperfection Patterns*. The *Relevant Evidence*, *Literature Support*, *Notes*
and *Further notes* columns on that sheet are **not** used.

Evidence comes from the `EventLog Analysis Results` sheet and the analyst
takeaway from the `Utility` sheet — both have a *No. / Category / Pattern name*
block followed by one column per event log, and are joined to the catalogue by
*No.*. A pattern × event-log block is shown **only where the Utility cell has
content**; the evidence is then displayed with its utility appended. If a
utility cell is empty, that event log's evidence is not shown at all.

Cell fill colours and bold text in the workbook are **not** interpreted: the
site has no status or "in marimo" markers and no per-field discussion flags.

## Adding a notebook

Notebook links are **not** taken from the workbook. A pattern links to the
notebook whose filename matches its name:

| Pattern | Notebook |
|---|---|
| Transaction Detection | `transaction_detection.ipynb` |
| Attribute Functional Relationship | `attribute_functional_relationship.ipynb` |
| Uninformative Attribute Removal | `uninformative_attribute_removal.ipynb` |

Commit a notebook with that name in the repository root, re-run the build, and
its link appears. The pattern page tells you the exact filename it expects.

### Notebooks are also readable in the page

`build_patterns.py` renders each linked notebook with nbconvert into
`docs/data/notebooks.js`, and the pattern page shows it under
**Read <notebook>.ipynb** — markdown, code, results, all styled like the rest of
the site and readable offline.

- The rendering is read-only. The GitHub link stays above it, because the
  runnable notebook is the real artefact.
- The notebooks read logs from `../../logs/` and `../../data/`, which are not in
  this repository, so the outputs record a run rather than something a reader
  can reproduce from here. The page says so.
- `$…$` and `$$…$$` formulas are converted to readable plain text at build time
  rather than by loading MathJax from a CDN, which would break offline use. The
  converter covers the notation these notebooks use; if the maths gets heavier,
  vendoring KaTeX into `docs/assets/` is the next step.
- tqdm progress bars and the VS Code data viewer are dropped — they only exist
  to drive JavaScript in a live kernel.
- If nbconvert is not installed the build still succeeds; the site just links to
  the notebooks instead of showing them.

## Publishing

The site is currently **internal**: everyone opens it from their own clone.
Nothing is published.

To put it on the web later, a repository admin enables GitHub Pages
(Settings → Pages → Deploy from a branch → `main` / `/docs`) and uncomments the
`deploy` job in `.github/workflows/build-catalogue.yml`. Note that Pages served
from a private repository is **publicly readable** unless the organisation is on
GitHub Enterprise Cloud — so this is a decision about publishing unfinished
patterns, not just a technical switch.

## Layout

```
Patterns_findings.xlsx              the master (edited in Excel, as before)
tools/build_patterns.py             workbook -> website data
docs/index.html                     the site
docs/assets/                        style.css, app.js
docs/data/patterns.js               generated - do not edit
docs/data/notebooks.js              generated - the rendered notebooks
docs/data/build-report.txt          generated - data issues found in the workbook
*.ipynb                             pattern implementations
```
