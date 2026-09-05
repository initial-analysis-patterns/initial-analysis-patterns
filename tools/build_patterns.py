#!/usr/bin/env python3
"""Convert Patterns_findings.xlsx into the data file the website reads.

Run after every change to the workbook:

    python tools/build_patterns.py

Reads   : Patterns_findings.xlsx      (the master; the team keeps editing it in Excel)
          *.ipynb                     (the notebooks, rendered for in-page reading)
Writes  : docs/data/patterns.js       (window.PATTERNS = {...}, loadable via file://)
          docs/data/notebooks.js      (window.NOTEBOOKS = {...}, the rendered notebooks)
          docs/data/build-report.txt  (data issues found, nothing is silently fixed)

Notebook links are resolved by name, not from the workbook: a pattern called
"Transaction Detection" links to transaction_detection.ipynb if that file exists
in the repository root. Committing a notebook is enough to make its link appear.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import unicodedata
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

import openpyxl
from openpyxl.cell.rich_text import CellRichText

REPO = Path(__file__).resolve().parent.parent
WORKBOOK = REPO / "Patterns_findings.xlsx"
SHEET = "Pattern Definitions & Examples "
OUT_JS = REPO / "docs" / "data" / "patterns.js"
OUT_NOTEBOOKS = REPO / "docs" / "data" / "notebooks.js"
OUT_REPORT = REPO / "docs" / "data" / "build-report.txt"

HEADER_ROW = 9
FIRST_DATA_ROW = 11

# Workbook column -> key used by the website.
COLUMNS = {
    2: "number",
    3: "category_old",
    4: "category",
    5: "type",
    6: "name_old",
    7: "name",
    8: "information_need",
    9: "motivation",
    10: "preconditions",
    11: "approach",
    12: "output",
    13: "evidence",
    14: "dependencies",
    15: "literature",
    16: "implementation",
    17: "notes_connection",
    18: "notes_further",
}

# Human labels for the columns, used when attaching review comments.
COLUMN_LABELS = {
    2: "No.",
    3: "Category (old)",
    4: "Category",
    5: "Type",
    6: "Name (old)",
    7: "Name",
    8: "Information Need",
    9: "Motivation / Context",
    10: "Preconditions",
    11: "Approach",
    12: "Output",
    13: "Relevant Evidence",
    14: "Dependencies",
    15: "Literature Support",
    16: "Implementation",
    17: "Notes (connection)",
    18: "Further notes",
}

# Fills used as status markers in the workbook (legend in cells J3:J5).
# Theme indices: 9 = accent6 (green), 5 = accent2 (orange).
STATUS_BY_THEME = {9: "stable", 5: "discussion"}
STATUS_LABELS = {
    "stable": "Stable — checked, implemented, evidence provided",
    "wip": "Work in progress",
    "discussion": "Needs discussion / input",
}

NS_TC = "{http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments}"

report_lines: list[str] = []


def note(kind: str, message: str) -> None:
    report_lines.append(f"{kind:<9} {message}")


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", str(text))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.replace("–", " ").replace("—", " ").replace("&", " and ")
    text = re.sub(r"[^A-Za-z0-9]+", "_", text).strip("_").lower()
    return text


def esc(text: str) -> str:
    return (
        text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    )


def rgb_of(colour) -> str | None:
    """Return an RRGGBB string for an explicit rgb colour, else None."""
    if colour is None:
        return None
    try:
        value = colour.rgb
    except (AttributeError, TypeError):
        return None
    if isinstance(value, str) and len(value) == 8:
        return value[2:].upper()
    return None


def rich_to_html(value) -> str:
    """Render a cell as HTML, preserving bold/italic/underline and red/blue runs.

    Red text is Lisa's inline remarks, blue is Marco's (legend in H3:H4), so the
    colour carries meaning and is kept as a marked-up span rather than dropped.
    """
    if value is None:
        return ""
    if not isinstance(value, CellRichText):
        return esc(str(value)).replace("\n", "<br>")

    out = []
    for block in value:
        text = esc(str(block))
        font = getattr(block, "font", None)
        if font is not None:
            if font.b:
                text = f"<strong>{text}</strong>"
            if font.i:
                text = f"<em>{text}</em>"
            if font.u:
                text = f"<u>{text}</u>"
            colour = rgb_of(getattr(font, "color", None))
            if colour == "FF0000":
                text = f'<span class="ink ink-red">{text}</span>'
            elif colour in {"0070C0", "0000FF", "1F4E79", "2E75B6", "0563C1"}:
                text = f'<span class="ink ink-blue">{text}</span>'
        out.append(text)
    return "".join(out).replace("\n", "<br>")


def plain(value) -> str:
    return "" if value is None else str(value).strip()


def read_status(cell) -> str:
    fill = cell.fill
    if fill is None or fill.fill_type is None:
        return "wip"
    fg = fill.fgColor
    if fg.type == "theme":
        return STATUS_BY_THEME.get(fg.theme, "wip")
    if fg.type == "rgb":
        rgb = rgb_of(fg)
        if rgb in {"70AD47", "92D050", "00B050"}:
            return "stable"
        if rgb in {"ED7D31", "FFC000", "FFFF00"}:
            return "discussion"
    return "wip"


DATASET_ALIASES = {
    "rftm": "RTFM",
    "rtfm": "RTFM",
    "sepsis": "Sepsis",
    "domesticdeclarations": "DomesticDeclarations",
    "domestic_declarations": "DomesticDeclarations",
    "bpic_2011": "BPIC 2011",
    "bpic_2012": "BPIC 2012",
    "bpic_2012_loan_application": "BPIC 2012",
    "bpic_2015": "BPIC 2015",
    "bpic_2017": "BPIC 2017",
    "bpic_2017_loan_application": "BPIC 2017",
    "bpic_2018": "BPIC 2018",
    "bpic_2019": "BPIC 2019",
}

# Datasets are marked in the evidence cell as a bold run ending in a colon,
# e.g. "<strong>RTFM:</strong>". Cells without formatting fall back to a plain
# line ending in a colon.
BOLD_HEADING = re.compile(r"<strong>\s*([^<:]{2,45?}):?\s*</strong>\s*(?:<br>)*", re.I)
LINE_HEADING = re.compile(r"^\s*([A-Za-z0-9 ()_\-\.]{2,45})\s*:\s*$")


def canonical_dataset(label: str, pattern_name: str) -> str:
    key = slugify(label)
    canonical = DATASET_ALIASES.get(key)
    if canonical is None:
        note("dataset", f"{pattern_name}: unrecognised dataset heading {label!r}")
        return label
    if canonical.lower() != label.lower():
        note("dataset", f"{pattern_name}: dataset {label!r} normalised to {canonical!r}")
    return canonical


def _tidy(html: str) -> str:
    html = re.sub(r"^(?:\s|<br>)+|(?:\s|<br>)+$", "", html)
    return html.strip()


def split_evidence(html: str, pattern_name: str) -> list[dict]:
    """Split the evidence cell into one block per dataset."""
    if not html.strip():
        return []

    blocks: list[dict] = []
    matches = list(BOLD_HEADING.finditer(html))
    # Only treat bold runs as headings if they look like dataset names.
    matches = [m for m in matches if slugify(m.group(1)) in DATASET_ALIASES]

    if matches:
        if matches[0].start() > 0:
            lead = _tidy(html[: matches[0].start()])
            if lead:
                blocks.append({"dataset": None, "html": lead})
        for i, m in enumerate(matches):
            stop = matches[i + 1].start() if i + 1 < len(matches) else len(html)
            body = _tidy(html[m.end(): stop])
            if body:
                blocks.append({"dataset": canonical_dataset(m.group(1), pattern_name), "html": body})
    else:
        current = {"dataset": None, "html": []}
        for line in html.split("<br>"):
            bare = re.sub(r"<[^>]+>", "", line).strip()
            m = LINE_HEADING.match(bare)
            if m and slugify(m.group(1)) in DATASET_ALIASES:
                if any(x.strip() for x in current["html"]):
                    blocks.append({"dataset": current["dataset"],
                                   "html": _tidy("<br>".join(current["html"]))})
                current = {"dataset": canonical_dataset(m.group(1), pattern_name), "html": []}
            else:
                current["html"].append(line)
        if any(x.strip() for x in current["html"]):
            blocks.append({"dataset": current["dataset"],
                           "html": _tidy("<br>".join(current["html"]))})

    blocks = [b for b in blocks if b["html"]]

    # Flag dataset names mentioned mid-text instead of as a heading.
    for b in blocks:
        bare = re.sub(r"<[^>]+>", "", b["html"])
        for other in set(DATASET_ALIASES.values()):
            if other != b["dataset"] and re.search(rf"\b{re.escape(other)}\s*:", bare):
                note("dataset", f"{pattern_name}: {other!r} appears inside the "
                                f"{b['dataset'] or 'unlabelled'} block instead of as its own heading")
    return blocks


def split_dependencies(raw: str) -> list[str]:
    """Dependencies are free text: one per line, sometimes comma-separated.

    Deliberately not split on a bare " and ", because pattern names contain it
    ("Log and Case Attribute Candidates").
    """
    if not raw:
        return []
    parts: list[str] = []
    for line in raw.split("\n"):
        for piece in line.split(","):
            piece = re.sub(r"^\s*and\b\s*", "", piece.strip()).strip().rstrip(".")
            if piece:
                parts.append(piece)
    return parts


def load_comments(path: Path) -> dict[int, list[dict]]:
    """Read threaded comments from the workbook, keyed by worksheet row."""
    with zipfile.ZipFile(path) as zf:
        names = zf.namelist()
        people = {}
        if "xl/persons/person.xml" in names:
            root = ET.fromstring(zf.read("xl/persons/person.xml"))
            for person in root:
                people[person.get("id")] = person.get("displayName", "")

        # sheet1.xml is the main sheet; find which threadedComment file belongs to it.
        target = None
        rels = "xl/worksheets/_rels/sheet1.xml.rels"
        if rels in names:
            root = ET.fromstring(zf.read(rels))
            for rel in root:
                t = rel.get("Target", "")
                if "threadedComment" in t:
                    target = "xl/" + t.replace("../", "")
        if target is None or target not in names:
            return {}

        root = ET.fromstring(zf.read(target))
        raw = []
        for tc in root:
            text_el = tc.find(f"{NS_TC}text")
            raw.append(
                {
                    "id": tc.get("id"),
                    "parent": tc.get("parentId"),
                    "ref": tc.get("ref", ""),
                    "date": (tc.get("dT") or "")[:10],
                    "author": people.get(tc.get("personId"), "Unknown"),
                    "resolved": tc.get("done") == "1",
                    "text": (text_el.text or "").strip() if text_el is not None else "",
                }
            )

    # A reply inherits the resolved state of its thread root.
    by_id = {c["id"]: c for c in raw}
    for c in raw:
        root_c = c
        while root_c.get("parent") and root_c["parent"] in by_id:
            root_c = by_id[root_c["parent"]]
        c["resolved"] = root_c["resolved"]
        c["thread"] = root_c["id"]

    out: dict[int, list[dict]] = {}
    for c in raw:
        m = re.match(r"([A-Z]+)(\d+)", c["ref"])
        if not m:
            continue
        col = 0
        for ch in m.group(1):
            col = col * 26 + (ord(ch) - 64)
        row = int(m.group(2))
        c["field"] = COLUMN_LABELS.get(col, m.group(1))
        c["is_reply"] = bool(c.get("parent"))
        out.setdefault(row, []).append(c)
    return out


def build(workbook_path: Path) -> dict:
    wb = openpyxl.load_workbook(workbook_path, rich_text=True)
    if SHEET not in wb.sheetnames:
        raise SystemExit(f"sheet {SHEET!r} not found; sheets are {wb.sheetnames}")
    ws = wb[SHEET]
    comments_by_row = load_comments(workbook_path)

    notebooks = {slugify(p.stem): p.name for p in sorted(REPO.glob("*.ipynb"))}
    used_notebooks: set[str] = set()

    patterns = []
    for row in range(FIRST_DATA_ROW, ws.max_row + 1):
        if all(ws.cell(row, col).value in (None, "") for col in COLUMNS):
            continue

        record = {}
        for col, key in COLUMNS.items():
            cell = ws.cell(row, col)
            if key in {"evidence", "motivation", "approach", "information_need",
                       "output", "preconditions", "literature",
                       "notes_connection", "notes_further"}:
                record[key] = rich_to_html(cell.value)
            else:
                record[key] = plain(cell.value)

        name = record["name"] or record["name_old"]
        if not name:
            note("skip", f"row {row}: no name, skipped")
            continue

        slug = slugify(name)
        record["slug"] = slug
        record["row"] = row
        record["status"] = read_status(ws.cell(row, 2))
        # Individual cells highlighted orange/yellow mark a field that still
        # needs discussion (legend in J5), independent of the row status.
        record["flagged_fields"] = [
            COLUMN_LABELS[col]
            for col in COLUMNS
            if col != 2 and read_status(ws.cell(row, col)) == "discussion"
        ]
        record["marimo"] = bool(ws.cell(row, 7).font.bold)
        record["evidence_blocks"] = split_evidence(record["evidence"], name)
        record["datasets"] = sorted(
            {b["dataset"] for b in record["evidence_blocks"] if b["dataset"]}
        )
        record["dependency_names"] = split_dependencies(record["dependencies"])

        notebook = notebooks.get(slug)
        if notebook:
            used_notebooks.add(notebook)
        record["notebook"] = notebook
        if record["implementation"] and not notebook:
            note("notebook", f"{name}: workbook links an implementation but no {slug}.ipynb in the repo")

        record["comments"] = sorted(
            comments_by_row.get(row, []),
            key=lambda c: (c["thread"], c["date"]),
        )
        record["open_comments"] = sum(1 for c in record["comments"] if not c["resolved"])
        patterns.append(record)

    # Resolve dependency names against the catalogue (old and new names).
    index = {}
    for p in patterns:
        index[slugify(p["name"])] = p["slug"]
        if p["name_old"]:
            index.setdefault(slugify(re.sub(r"^NEW:\s*", "", p["name_old"])), p["slug"])
    for p in patterns:
        resolved = []
        for dep in p["dependency_names"]:
            target = index.get(slugify(dep))
            if target and target != p["slug"]:
                resolved.append({"label": dep, "slug": target})
            else:
                resolved.append({"label": dep, "slug": None})
                if len(dep.split()) <= 8:
                    note("dependency", f"{p['name']}: dependency {dep!r} matches no pattern")
        p["dependency_links"] = resolved

    seen_numbers: dict[str, str] = {}
    for p in patterns:
        if p["number"] in seen_numbers:
            note("number", f"number {p['number']} used by both {seen_numbers[p['number']]!r} and {p['name']!r}")
        seen_numbers[p["number"]] = p["name"]

    for name in sorted(set(notebooks.values()) - used_notebooks):
        note("notebook", f"{name} is in the repo but matches no pattern name")

    categories = sorted({p["category"] for p in patterns if p["category"]})
    for cat in categories:
        members = [p["name"] for p in patterns if p["category"] == cat]
        if len(members) == 1:
            note("category", f"category {cat!r} has a single member: {members[0]}")

    return {
        "generated": dt.datetime.now().strftime("%Y-%m-%d %H:%M"),
        "source": workbook_path.name,
        "status_labels": STATUS_LABELS,
        "categories": categories,
        "types": sorted({p["type"] for p in patterns if p["type"]}),
        "datasets": sorted({d for p in patterns for d in p["datasets"]}),
        "patterns": patterns,
    }


# Output types that only exist to drive JavaScript in a live Jupyter session
# (tqdm progress bars, the VS Code data viewer). Dropping them before conversion
# makes nbconvert fall back to the plain-text output instead of emitting an
# empty box plus a few hundred kilobytes of widget state.
DEAD_MIMETYPES = (
    "application/vnd.jupyter.widget-view+json",
    "application/vnd.jupyter.widget-state+json",
    "application/vnd.microsoft.datawrangler.viewer.v0+json",
)


# nbconvert leaves TeX for a browser-side MathJax that this site deliberately
# does not load (it would need a CDN, and the site has to work offline). Instead
# the formulas are turned into readable plain text at build time. This is not a
# TeX engine and is not meant to be one: it covers the notation the notebooks
# actually use, and anything it does not know simply keeps its backslash.
MATH_BLOCK = re.compile(r"\$\$(.+?)\$\$", re.S)
# Inline math, kept on one line and never crossing a tag boundary.
MATH_INLINE = re.compile(r"(?<![\w$])\$(?!\s)([^$\n<>]{1,200}?)(?<!\s)\$(?![\w$])")

TEX_WORDS = {
    r"\\cdot": "·", r"\\times": "×", r"\\leq": "≤", r"\\geq": "≥",
    r"\\neq": "≠", r"\\approx": "≈", r"\\in\b": "∈", r"\\cup": "∪",
    r"\\cap": "∩", r"\\sum": "sum", r"\\prod": "prod", r"\\min": "min",
    r"\\max": "max", r"\\log": "log", r"\\left": "", r"\\right": "",
    r"\\,": "", r"\\;": " ", r"\\!": "", r"\\quad": "  ", r"\\qquad": "   ",
}


def _wrap(part: str) -> str:
    """Parenthesise a fraction operand only when it is more than a single term."""
    part = part.strip()
    return part if re.fullmatch(r"[\w.^_]+", part) else f"({part})"


def tex_to_text(tex: str) -> str:
    """Best-effort plain-text rendering of the TeX used in these notebooks."""
    out = tex.strip()
    out = re.sub(r"\\(?:mathrm|mathit|text|mathbf)\{([^{}]*)\}", r"\1", out)
    out = re.sub(r"\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}",
                 lambda m: f"{_wrap(m.group(1))} / {_wrap(m.group(2))}", out)
    for pattern, replacement in TEX_WORDS.items():
        out = re.sub(pattern, replacement, out)
    out = re.sub(r"\s+", " ", out)
    return out.strip()


def mark_math(html: str) -> str:
    # Inline "$...$" is only interpreted in notebooks that also use display
    # math, so a stray pair of dollar amounts elsewhere is left alone.
    uses_tex = "$$" in html
    html = MATH_BLOCK.sub(
        lambda m: f'<code class="tex">{tex_to_text(m.group(1))}</code>', html)
    if uses_tex:
        html = MATH_INLINE.sub(
            lambda m: f'<code class="tex inline">{tex_to_text(m.group(1))}</code>', html)
    return html


def render_notebooks(patterns: list[dict]) -> dict[str, str]:
    """Render each linked notebook to an HTML fragment for in-page reading.

    Optional: without nbconvert the site simply keeps linking to the notebooks
    instead of showing them, so the build never fails over a missing dependency.
    """
    wanted = [p for p in patterns if p["notebook"]]
    if not wanted:
        return {}

    try:
        import nbformat
        from nbconvert import HTMLExporter
    except ImportError:
        note("notebook", "nbconvert is not installed - notebooks are linked but not shown "
                         "(pip install -r tools/requirements.txt)")
        return {}

    exporter = HTMLExporter(template_name="basic", embed_images=True)
    rendered = {}
    for p in wanted:
        path = REPO / p["notebook"]
        try:
            nb = nbformat.read(path, as_version=4)
        except Exception as exc:  # a malformed notebook must not break the build
            note("notebook", f"{p['notebook']}: could not be read ({exc})")
            continue

        for cell in nb.cells:
            for output in cell.get("outputs", []):
                data = output.get("data")
                if data:
                    for mime in DEAD_MIMETYPES:
                        data.pop(mime, None)

        try:
            body, _ = exporter.from_notebook_node(nb)
        except Exception as exc:
            note("notebook", f"{p['notebook']}: could not be rendered ({exc})")
            continue

        # The fragment is injected with innerHTML, which never runs scripts;
        # removing them keeps the markup honest rather than merely inert.
        body = re.sub(r"<script\b.*?</script>", "", body, flags=re.S | re.I)
        body = mark_math(body)
        rendered[p["slug"]] = body.strip()

    return rendered


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("workbook", nargs="?", default=str(WORKBOOK),
                    help="path to the xlsx (default: Patterns_findings.xlsx in the repo root)")
    args = ap.parse_args()

    path = Path(args.workbook)
    if not path.exists():
        raise SystemExit(f"workbook not found: {path}")

    data = build(path)
    OUT_JS.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data, ensure_ascii=False, indent=1)
    OUT_JS.write_text(
        "// Generated by tools/build_patterns.py - do not edit by hand.\n"
        "// Edit Patterns_findings.xlsx and re-run the script instead.\n"
        f"window.PATTERNS = {payload};\n",
        encoding="utf-8",
    )

    notebooks = render_notebooks(data["patterns"])
    OUT_NOTEBOOKS.write_text(
        "// Generated by tools/build_patterns.py - do not edit by hand.\n"
        "// Rendered from the .ipynb files in the repository root.\n"
        f"window.NOTEBOOKS = {json.dumps(notebooks, ensure_ascii=False)};\n",
        encoding="utf-8",
    )

    header = [
        f"Build report - {data['generated']}",
        f"Source: {data['source']}",
        f"{len(data['patterns'])} patterns, "
        f"{sum(1 for p in data['patterns'] if p['notebook'])} with a notebook, "
        f"{sum(p['open_comments'] for p in data['patterns'])} open review comments, "
        f"{len(notebooks)} notebooks rendered",
        "",
    ]
    body = report_lines or ["No issues found."]
    OUT_REPORT.write_text("\n".join(header + sorted(body)) + "\n", encoding="utf-8")

    print("\n".join(header + sorted(body)))
    print(f"\nwrote {OUT_JS.relative_to(REPO)}, {OUT_NOTEBOOKS.relative_to(REPO)} "
          f"and {OUT_REPORT.relative_to(REPO)}")


if __name__ == "__main__":
    main()
