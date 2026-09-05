# Event Log Pattern Catalogue

An explorable version of `Patterns_findings.xlsx`, plus links to the Jupyter
notebooks that implement the patterns.

## Looking at the site

Clone the repository and open `docs/index.html` in a browser. No server, no
install, no internet connection needed — the whole catalogue is in
`docs/data/patterns.js`.

```
git clone https://github.com/mafranco2000/patterns_website.git
open patterns_website/docs/index.html          # macOS
xdg-open patterns_website/docs/index.html      # Linux
```

What it gives you over the spreadsheet: all patterns at a glance, filters
(category, type, status, dataset the evidence comes from, has-a-notebook,
in-marimo, has-open-questions), free-text search across every field,
per-pattern pages with dependencies as clickable links, and a
**Review notes** switch that surfaces the unresolved Excel comments.

Keyboard: `/` to search, `Esc` back to the list, `←`/`→` between patterns.

## Updating the site after the workbook changes

`Patterns_findings.xlsx` stays the master. The website is generated from it.

```
pip install -r tools/requirements.txt     # once
python tools/build_patterns.py
git add Patterns_findings.xlsx docs/data && git commit -m "Update catalogue"
```

This rewrites `docs/data/patterns.js` (the data the site reads) and
`docs/data/build-report.txt` (data issues found — nothing is silently fixed).
The GitHub Action in `.github/workflows/build-catalogue.yml` does the same
automatically whenever a new workbook is pushed.

### What the build reads from the workbook

| In the workbook | On the site |
|---|---|
| Sheet `Pattern Definitions & Examples `, rows 11 onwards | one pattern each |
| Green fill in column B | status *stable* |
| No fill in column B | status *work in progress* |
| Orange/yellow fill on any other cell | ⚑ that field needs discussion |
| **Bold** pattern name | "in marimo" |
| `RTFM:`, `Sepsis:`, … in *Relevant Evidence* | evidence split per dataset, filterable |
| *Dependencies* naming other patterns | clickable links between patterns |
| Threaded comments | review notes (unresolved ones only) |

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
docs/data/build-report.txt          generated - data issues found in the workbook
*.ipynb                             pattern implementations
```
