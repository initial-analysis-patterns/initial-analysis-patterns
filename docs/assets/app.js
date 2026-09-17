/* Event Log Pattern Catalogue — reads window.PATTERNS from data/patterns.js.
   No build step, no dependencies; works from file:// and from a web server. */

const REPO = 'https://github.com/initial-analysis-patterns/initial-analysis-patterns/blob/main/';

const DATA = window.PATTERNS;
const NOTEBOOKS = window.NOTEBOOKS || {};
const PATTERNS = DATA.patterns;
const BY_SLUG = Object.fromEntries(PATTERNS.map(p => [p.slug, p]));

const CAT_VAR = {};
const CAT_INDEX = {};
DATA.categories.forEach((c, i) => {
  CAT_VAR[c] = `var(--cat-${(i % 5) + 1})`;
  CAT_INDEX[c] = i;
});

const state = {
  q: '',
  category: new Set(),
  tags: new Set(),
  sort: 'category',
};

/* ---------- helpers ---------- */

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const stripTags = html => (html || '').replace(/<[^>]+>/g, ' ');

function haystack(p) {
  if (p._hay) return p._hay;
  p._hay = [
    p.number, p.name, p.category, (p.tags || []).join(' '),
    stripTags(p.information_need), stripTags(p.motivation), stripTags(p.preconditions),
    stripTags(p.approach), stripTags(p.output),
    (p.evidence_blocks || []).map(b => `${b.dataset || ''} ${stripTags(b.html)} ${stripTags(b.utility)}`).join(' '),
    p.dependencies, stripTags(p.imperfection_relation), p.notebook || '',
  ].join(' ').toLowerCase();
  return p._hay;
}

/** Match against every filter except the one named in `skip` (for facet counts). */
function matches(p, skip) {
  if (skip !== 'q' && state.q) {
    const terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    const hay = haystack(p);
    if (!terms.every(t => hay.includes(t))) return false;
  }
  if (skip !== 'category' && state.category.size && !state.category.has(p.category)) return false;
  if (skip !== 'tags' && state.tags.size && !p.tags.some(t => state.tags.has(t))) return false;
  return true;
}

const visible = () => PATTERNS.filter(p => matches(p));

function sortPatterns(list) {
  const byNum = (a, b) => parseFloat(a.number) - parseFloat(b.number) || a.name.localeCompare(b.name);
  if (state.sort === 'number') return [...list].sort(byNum);
  if (state.sort === 'name') return [...list].sort((a, b) => a.name.localeCompare(b.name));
  return [...list].sort((a, b) =>
    (CAT_INDEX[a.category] - CAT_INDEX[b.category]) || byNum(a, b));
}

/* ---------- filter rail ---------- */

function checkbox(id, checked, onChange) {
  const input = el('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.id = id;
  input.addEventListener('change', onChange);
  return input;
}

function filterGroup(title, key, values, decorate) {
  const box = el('div', 'fgroup');
  box.appendChild(el('h3', null, title));
  values.forEach(value => {
    const count = PATTERNS.filter(p => matches(p, key) && (
      key === 'tags' ? p.tags.includes(value) : p[key] === value
    )).length;
    const active = state[key].has(value);
    const label = el('label', 'fopt' + (count === 0 && !active ? ' off' : ''));
    label.appendChild(checkbox(`${key}-${value}`, active, () => {
      state[key].has(value) ? state[key].delete(value) : state[key].add(value);
      render();
    }));
    if (decorate) {
      const mark = decorate(value);
      if (mark) label.appendChild(mark);
    }
    label.appendChild(el('span', null, value));
    label.appendChild(el('span', 'n', String(count)));
    box.appendChild(label);
  });
  return box;
}

function renderFilters() {
  const host = document.getElementById('filter-groups');
  host.textContent = '';
  host.appendChild(filterGroup('Category', 'category', DATA.categories, value => {
    const dot = el('span', 'swatch');
    dot.style.background = CAT_VAR[value];
    return dot;
  }));
  if (DATA.tags.length) host.appendChild(filterGroup('Tags', 'tags', DATA.tags));
}

/* ---------- chips ---------- */

function categoryChip(p) {
  const chip = el('span', 'chip cat', p.category);
  chip.style.color = CAT_VAR[p.category];
  return chip;
}

/* ---------- card list ---------- */

function card(p) {
  const node = el('button', 'card');
  node.type = 'button';
  node.style.setProperty('--card-accent', CAT_VAR[p.category]);
  node.addEventListener('click', () => { location.hash = `#/p/${p.slug}`; });

  const top = el('div', 'card-top');
  top.appendChild(el('span', null, p.number));
  node.appendChild(top);

  node.appendChild(el('h3', null, p.name));
  node.appendChild(el('p', null, stripTags(p.information_need).trim()));

  const foot = el('div', 'card-foot');
  // When the list is grouped by category the chip only repeats the heading;
  // the coloured card edge carries the category instead.
  if (state.sort !== 'category') foot.appendChild(categoryChip(p));
  p.tags.forEach(t => foot.appendChild(el('span', 'chip tag', t)));
  if (p.notebook) foot.appendChild(el('span', 'chip nb', 'notebook'));
  node.appendChild(foot);
  return node;
}

function renderList() {
  const main = document.getElementById('main');
  main.textContent = '';
  main.className = '';

  const list = sortPatterns(visible());

  const bar = el('div', 'bar');
  bar.appendChild(el('span', null,
    `${list.length} of ${PATTERNS.length} patterns`));
  const sortLabel = el('label', null, 'Sort by ');
  const select = el('select');
  [['category', 'category'], ['number', 'number'], ['name', 'name']]
    .forEach(([value, text]) => {
      const opt = el('option', null, text);
      opt.value = value;
      if (state.sort === value) opt.selected = true;
      select.appendChild(opt);
    });
  select.addEventListener('change', () => { state.sort = select.value; render(); });
  sortLabel.appendChild(select);
  bar.appendChild(sortLabel);
  main.appendChild(bar);

  if (!list.length) {
    main.appendChild(el('div', 'empty', 'No pattern matches these filters.'));
    return;
  }

  if (state.sort === 'category') {
    DATA.categories.forEach(cat => {
      const group = list.filter(p => p.category === cat);
      if (!group.length) return;
      const head = el('div', 'section-head');
      const title = el('h2', null, cat);
      title.style.color = CAT_VAR[cat];
      head.appendChild(title);
      head.appendChild(el('span', 'n', `${group.length}`));
      main.appendChild(head);
      const grid = el('div', 'grid');
      group.forEach(p => grid.appendChild(card(p)));
      main.appendChild(grid);
    });
  } else {
    const grid = el('div', 'grid');
    list.forEach(p => grid.appendChild(card(p)));
    main.appendChild(grid);
  }
}

/* ---------- detail ---------- */

function field(title, html, opts = {}) {
  if (!html || !stripTags(html).trim()) return null;
  const section = el('section', 'field');
  section.appendChild(el('h3', null, title));
  const body = el('div', 'body' + (opts.soft ? ' soft' : ''));
  body.innerHTML = html;
  section.appendChild(body);
  return section;
}

function evidenceSection(p) {
  if (!p.evidence_blocks.length) return null;
  const section = el('section', 'field');
  section.appendChild(el('h3', null, 'Evidence and Utility'));
  p.evidence_blocks.forEach(block => {
    const box = el('div', 'evidence-block');
    if (block.dataset) box.appendChild(el('div', 'ds', block.dataset));
    if (block.html) {
      const body = el('div', 'body');
      body.innerHTML = block.html;
      box.appendChild(body);
    }
    if (block.utility) {
      const util = el('div', 'utility');
      util.appendChild(el('div', 'utility-label', 'Utility'));
      const body = el('div', 'body');
      body.innerHTML = block.utility;
      util.appendChild(body);
      box.appendChild(util);
    }
    section.appendChild(box);
  });
  return section;
}

function dependencySection(p) {
  if (!p.dependency_links.length) return null;
  const section = el('section', 'field');
  section.appendChild(el('h3', null, 'Related patterns'));
  const box = el('div', 'deps');
  p.dependency_links.forEach(dep => {
    if (dep.slug) {
      const button = el('button', 'dep', BY_SLUG[dep.slug].name);
      button.addEventListener('click', () => { location.hash = `#/p/${dep.slug}`; });
      box.appendChild(button);
    } else {
      box.appendChild(el('div', 'dep unresolved', dep.label));
    }
  });
  section.appendChild(box);
  return section;
}

/** Everything about the implementation in one full-width section below the two
 *  text columns: the link to the runnable notebook, and the notebook itself.
 *  Code lines and result tables need more room than the right-hand column has. */
function implementationSection(p) {
  const section = el('section', 'implementation');
  section.appendChild(el('h3', 'impl-head', 'Implementation'));

  if (!p.notebook) {
    section.appendChild(el('div', 'nb-none',
      `No notebook yet. Commit ${p.slug}.ipynb to the repository root and it will appear here.`));
    return section;
  }

  const links = el('div', 'impl-links');
  const link = el('a', 'nb-link', 'Open on GitHub');
  link.href = REPO + p.notebook;
  link.target = '_blank';
  link.rel = 'noopener';
  links.appendChild(link);
  const localLink = el('a', 'nb-local', 'local copy in this clone');
  localLink.href = '../' + p.notebook;
  links.appendChild(localLink);
  section.appendChild(links);

  const rendered = NOTEBOOKS[p.slug];
  if (!rendered) return section;

  // The rendering is a reading aid under the section, not a section of its own:
  // the runnable notebook linked above stays the artefact.
  const view = el('details', 'nb-view');
  const summary = el('summary');
  summary.appendChild(el('code', 'nb-file', p.notebook));
  summary.appendChild(el('span', 'nb-action'));  // label comes from CSS, open/closed
  view.appendChild(summary);
  view.appendChild(el('p', 'nb-caveat',
    'Rendered from the committed notebook. Its outputs were produced from event logs '
    + 'that are not part of this repository, so they record a run rather than something '
    + 'you can reproduce from here.'));
  const body = el('div', 'nb-body');
  body.innerHTML = rendered;
  view.appendChild(body);
  section.appendChild(view);
  return section;
}

function renderDetail(slug) {
  const p = BY_SLUG[slug];
  const main = document.getElementById('main');
  main.textContent = '';
  main.className = 'detail';

  if (!p) {
    main.appendChild(el('div', 'empty', 'Unknown pattern.'));
    return;
  }

  const back = el('button', 'back', '← All patterns');
  back.addEventListener('click', () => { location.hash = ''; });
  main.appendChild(back);

  const head = el('div', 'detail-head');
  head.appendChild(el('div', 'num', `Pattern ${p.number}`));
  head.appendChild(el('h2', null, p.name));
  const chips = el('div', 'chips');
  chips.appendChild(categoryChip(p));
  p.tags.forEach(t => chips.appendChild(el('span', 'chip tag', t)));
  if (p.notebook) chips.appendChild(el('span', 'chip nb', 'notebook'));
  head.appendChild(chips);
  main.appendChild(head);

  const cols = el('div', 'cols');
  const left = el('div');
  const right = el('div');

  [
    field('Information need / modification objective', p.information_need),
    field('Motivation & context', p.motivation),
    field('Preconditions', p.preconditions),
    field('Approach', p.approach),
    field('Output', p.output),
  ].forEach(node => node && left.appendChild(node));

  [
    evidenceSection(p),
    dependencySection(p),
    field('Relation with imperfection patterns', p.imperfection_relation, { soft: true }),
  ].forEach(node => node && right.appendChild(node));

  cols.appendChild(left);
  cols.appendChild(right);
  main.appendChild(cols);

  main.appendChild(implementationSection(p));

  const siblings = sortPatterns(visible());
  const index = siblings.findIndex(x => x.slug === p.slug);
  const nav = el('div', 'prevnext');
  const prev = el('button', null, index > 0 ? `← ${siblings[index - 1].name}` : '');
  prev.disabled = index <= 0;
  if (index > 0) prev.addEventListener('click', () => { location.hash = `#/p/${siblings[index - 1].slug}`; });
  const next = el('button', null, index >= 0 && index < siblings.length - 1 ? `${siblings[index + 1].name} →` : '');
  next.disabled = !(index >= 0 && index < siblings.length - 1);
  if (!next.disabled) next.addEventListener('click', () => { location.hash = `#/p/${siblings[index + 1].slug}`; });
  nav.appendChild(prev);
  nav.appendChild(next);
  main.appendChild(nav);

  document.title = `${p.name} — Event Log Pattern Catalogue`;
  window.scrollTo(0, 0);
}

/* ---------- routing ---------- */

function render() {
  renderFilters();
  const match = /^#\/p\/(.+)$/.exec(location.hash);
  const listOnly = document.getElementById('filters');
  listOnly.style.display = match ? 'none' : '';
  document.querySelector('.wrap').style.gridTemplateColumns = match ? '1fr' : '';
  if (match) {
    renderDetail(decodeURIComponent(match[1]));
  } else {
    document.title = 'Event Log Pattern Catalogue';
    renderList();
  }
}

/* ---------- wiring ---------- */

function init() {
  const withNotebook = PATTERNS.filter(p => p.notebook).length;
  document.getElementById('generated').textContent =
    `${PATTERNS.length} patterns · ${withNotebook} with notebook · workbook of ${DATA.generated}`;
  document.getElementById('footer-note').textContent =
    `Generated from ${DATA.source} by tools/build_patterns.py — edit the workbook and re-run the script to update.`;

  const search = document.getElementById('search');
  search.addEventListener('input', () => {
    state.q = search.value.trim();
    if (/^#\/p\//.test(location.hash)) location.hash = '';
    else render();
  });

  document.getElementById('reset').addEventListener('click', () => {
    state.q = '';
    search.value = '';
    ['category', 'tags'].forEach(k => state[k].clear());
    render();
  });

  window.addEventListener('hashchange', render);

  document.addEventListener('keydown', event => {
    if (event.key === '/' && document.activeElement !== search) {
      event.preventDefault();
      if (location.hash) location.hash = '';
      search.focus();
      search.select();
    } else if (event.key === 'Escape') {
      if (location.hash) location.hash = '';
      else if (document.activeElement === search) search.blur();
    } else if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight')
               && /^#\/p\//.test(location.hash)
               && document.activeElement !== search) {
      const buttons = document.querySelectorAll('.prevnext button');
      const target = buttons[event.key === 'ArrowLeft' ? 0 : 1];
      if (target && !target.disabled) target.click();
    }
  });

  render();
}

init();
