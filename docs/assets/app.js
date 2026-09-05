/* Event Log Pattern Catalogue — reads window.PATTERNS from data/patterns.js.
   No build step, no dependencies; works from file:// and from a web server. */

const REPO = 'https://github.com/mafranco2000/patterns_website/blob/main/';

const DATA = window.PATTERNS;
const PATTERNS = DATA.patterns;
const BY_SLUG = Object.fromEntries(PATTERNS.map(p => [p.slug, p]));

const CAT_VAR = {};
DATA.categories.forEach((c, i) => { CAT_VAR[c] = `var(--cat-${(i % 5) + 1})`; });

const STATUS_ORDER = ['stable', 'wip', 'discussion'];

const state = {
  q: '',
  category: new Set(),
  type: new Set(),
  status: new Set(),
  dataset: new Set(),
  onlyNotebook: false,
  onlyMarimo: false,
  onlyOpen: false,
  sort: 'category',
  notes: false,
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
    p.number, p.name, p.name_old, p.category, p.category_old, p.type,
    stripTags(p.information_need), stripTags(p.motivation), stripTags(p.preconditions),
    stripTags(p.approach), stripTags(p.output), stripTags(p.evidence),
    p.dependencies, stripTags(p.literature), stripTags(p.notes_connection),
    stripTags(p.notes_further), p.notebook || '',
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
  if (skip !== 'type' && state.type.size && !state.type.has(p.type)) return false;
  if (skip !== 'status' && state.status.size && !state.status.has(p.status)) return false;
  if (skip !== 'dataset' && state.dataset.size && !p.datasets.some(d => state.dataset.has(d))) return false;
  if (skip !== 'extra') {
    if (state.onlyNotebook && !p.notebook) return false;
    if (state.onlyMarimo && !p.marimo) return false;
    if (state.onlyOpen && !p.open_comments) return false;
  }
  return true;
}

const visible = () => PATTERNS.filter(p => matches(p));

function sortPatterns(list) {
  const byNum = (a, b) => parseFloat(a.number) - parseFloat(b.number) || a.name.localeCompare(b.name);
  if (state.sort === 'number') return [...list].sort(byNum);
  if (state.sort === 'name') return [...list].sort((a, b) => a.name.localeCompare(b.name));
  if (state.sort === 'status') {
    return [...list].sort((a, b) =>
      STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || byNum(a, b));
  }
  return [...list].sort((a, b) =>
    a.category.localeCompare(b.category) || byNum(a, b));
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
      key === 'dataset' ? p.datasets.includes(value) : p[key === 'status' ? 'status' : key] === value
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
    label.appendChild(el('span', null, key === 'status' ? statusName(value) : value));
    label.appendChild(el('span', 'n', String(count)));
    box.appendChild(label);
  });
  return box;
}

const statusName = s => ({ stable: 'Stable', wip: 'Work in progress', discussion: 'Needs discussion' }[s] || s);

function extraGroup() {
  const box = el('div', 'fgroup');
  box.appendChild(el('h3', null, 'Also'));
  const opts = [
    ['onlyNotebook', 'Has notebook', p => !!p.notebook],
    ['onlyMarimo', 'In marimo', p => p.marimo],
    ['onlyOpen', 'Open questions', p => p.open_comments > 0],
  ];
  opts.forEach(([key, text, test]) => {
    const count = PATTERNS.filter(p => matches(p, 'extra') && test(p)).length;
    const label = el('label', 'fopt' + (count === 0 && !state[key] ? ' off' : ''));
    label.appendChild(checkbox(key, state[key], () => { state[key] = !state[key]; render(); }));
    label.appendChild(el('span', null, text));
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
  host.appendChild(filterGroup('Type', 'type', DATA.types));
  host.appendChild(filterGroup('Status', 'status',
    STATUS_ORDER.filter(s => PATTERNS.some(p => p.status === s)),
    value => el('span', `dot ${value}`)));
  host.appendChild(extraGroup());
  host.appendChild(filterGroup('Evidence from', 'dataset', DATA.datasets));
}

/* ---------- chips ---------- */

function categoryChip(p) {
  const chip = el('span', 'chip cat', p.category);
  chip.style.color = CAT_VAR[p.category];
  return chip;
}

function statusChip(p) {
  const chip = el('span', 'chip');
  chip.appendChild(el('span', `dot ${p.status}`));
  chip.appendChild(el('span', null, statusName(p.status)));
  chip.title = DATA.status_labels[p.status] || '';
  return chip;
}

/* ---------- card list ---------- */

function card(p) {
  const node = el('button', 'card');
  node.type = 'button';
  node.style.setProperty('--card-accent', CAT_VAR[p.category]);
  node.addEventListener('click', () => { location.hash = `#/p/${p.slug}`; });

  const top = el('div', 'card-top');
  top.appendChild(el('span', 'dot ' + p.status));
  top.appendChild(el('span', null, p.number));
  top.appendChild(el('span', null, '·'));
  const type = el('span', null, p.type);
  type.style.color = p.type === 'Modification' ? 'var(--accent)' : '';
  top.appendChild(type);
  node.appendChild(top);

  node.appendChild(el('h3', null, p.name));
  node.appendChild(el('p', null, stripTags(p.information_need).trim()));

  const foot = el('div', 'card-foot');
  // When the list is grouped by category the chip only repeats the heading;
  // the coloured card edge carries the category instead.
  if (state.sort !== 'category') foot.appendChild(categoryChip(p));
  if (p.notebook) foot.appendChild(el('span', 'chip nb', 'notebook'));
  if (p.marimo) foot.appendChild(el('span', 'chip', 'marimo'));
  if (p.flagged_fields.length) foot.appendChild(el('span', 'chip flagged', '⚑ ' + p.flagged_fields.join(', ')));
  if (state.notes && p.open_comments) {
    foot.appendChild(el('span', 'chip q', `${p.open_comments} open`));
  }
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
  [['category', 'category'], ['number', 'number'], ['name', 'name'], ['status', 'status']]
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
  const head = el('h3', null, title);
  if (opts.flagged) {
    const flag = el('span', 'chip flagged', '⚑ needs discussion');
    head.appendChild(flag);
  }
  section.appendChild(head);
  const body = el('div', 'body' + (opts.soft ? ' soft' : ''));
  body.innerHTML = html;
  section.appendChild(body);
  return section;
}

function evidenceSection(p) {
  if (!p.evidence_blocks.length) return null;
  const section = el('section', 'field');
  const head = el('h3', null, 'Relevant evidence');
  if (p.flagged_fields.includes('Relevant Evidence')) {
    head.appendChild(el('span', 'chip flagged', '⚑ needs discussion'));
  }
  section.appendChild(head);
  p.evidence_blocks.forEach(block => {
    const box = el('div', 'evidence-block');
    if (block.dataset) box.appendChild(el('div', 'ds', block.dataset));
    const body = el('div', 'body');
    body.innerHTML = block.html;
    box.appendChild(body);
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

function notebookSection(p) {
  const section = el('section', 'field');
  section.appendChild(el('h3', null, 'Implementation'));
  if (p.notebook) {
    const link = el('a', 'nb-link', `Open ${p.notebook}`);
    link.href = REPO + p.notebook;
    link.target = '_blank';
    link.rel = 'noopener';
    section.appendChild(link);
    const local = el('div');
    const localLink = el('a', null, 'local copy in this clone');
    localLink.href = '../' + p.notebook;
    localLink.style.fontSize = '12px';
    local.style.marginTop = '6px';
    local.appendChild(localLink);
    section.appendChild(local);
  } else {
    section.appendChild(el('div', 'nb-none',
      `No notebook yet. Commit ${p.slug}.ipynb to the repository root and it will appear here.`));
  }
  return section;
}

function notesSection(p) {
  const open = p.comments.filter(c => !c.resolved);
  if (!open.length) return null;
  const section = el('section', 'field');
  section.appendChild(el('h3', null, `Review notes (${open.length} open)`));
  const threads = [];
  open.forEach(c => {
    const last = threads[threads.length - 1];
    if (last && last[0].thread === c.thread) last.push(c);
    else threads.push([c]);
  });
  threads.forEach(thread => {
    const box = el('div', 'note-thread');
    box.appendChild(el('div', 'note-field', `on ${thread[0].field}`));
    thread.forEach(c => {
      const note = el('div', 'note' + (c.is_reply ? ' reply' : ''));
      const who = el('div', 'who');
      who.appendChild(el('b', null, c.author));
      who.appendChild(el('span', null, c.date));
      note.appendChild(who);
      note.appendChild(el('div', null, c.text));
      box.appendChild(note);
    });
    section.appendChild(box);
  });
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
  chips.appendChild(el('span', 'chip' + (p.type === 'Modification' ? ' type-modification' : ''), p.type));
  chips.appendChild(statusChip(p));
  if (p.marimo) chips.appendChild(el('span', 'chip', 'in marimo'));
  if (p.notebook) chips.appendChild(el('span', 'chip nb', 'notebook'));
  // Fields flagged in the workbook that have no section of their own
  // (the name and the number) are surfaced here instead.
  const headless = p.flagged_fields.filter(f => ['No.', 'Name', 'Name (old)', 'Category', 'Type'].includes(f));
  if (headless.length) {
    chips.appendChild(el('span', 'chip flagged', `⚑ ${headless.join(', ')} needs discussion`));
  }
  head.appendChild(chips);
  const oldName = (p.name_old || '').replace(/^NEW:\s*/, '').trim();
  if (oldName && oldName.toLowerCase() !== p.name.toLowerCase() && oldName !== 'NEW') {
    head.appendChild(el('div', 'oldname', `Previously: ${oldName}` +
      (p.category_old ? ` · category ${p.category_old}` : '')));
  }
  main.appendChild(head);

  const cols = el('div', 'cols');
  const left = el('div');
  const right = el('div');

  const objective = p.type === 'Modification' ? 'Modification objective' : 'Information need';
  [
    field(objective, p.information_need, { flagged: p.flagged_fields.includes('Information Need') }),
    field('Motivation & context', p.motivation, { flagged: p.flagged_fields.includes('Motivation / Context') }),
    field('Preconditions', p.preconditions, { flagged: p.flagged_fields.includes('Preconditions') }),
    field('Approach', p.approach, { flagged: p.flagged_fields.includes('Approach') }),
    field('Output', p.output, { flagged: p.flagged_fields.includes('Output') }),
  ].forEach(node => node && left.appendChild(node));

  [
    evidenceSection(p),
    notebookSection(p),
    dependencySection(p),
    field('Literature support', p.literature, { soft: true }),
    field('Notes', [p.notes_connection, p.notes_further].filter(Boolean).join('<br><br>'), { soft: true }),
    state.notes ? notesSection(p) : null,
  ].forEach(node => node && right.appendChild(node));

  cols.appendChild(left);
  cols.appendChild(right);
  main.appendChild(cols);

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
  const openNotes = PATTERNS.reduce((n, p) => n + p.open_comments, 0);
  document.getElementById('generated').textContent =
    `${PATTERNS.length} patterns · ${withNotebook} with notebook · built ${DATA.generated}`;
  document.getElementById('footer-note').textContent =
    `Generated from ${DATA.source} by tools/build_patterns.py — edit the workbook and re-run the script to update. ` +
    `${openNotes} unresolved review comments in the workbook.`;

  const search = document.getElementById('search');
  search.addEventListener('input', () => {
    state.q = search.value.trim();
    if (/^#\/p\//.test(location.hash)) location.hash = '';
    else render();
  });

  document.getElementById('notes-toggle').addEventListener('change', event => {
    state.notes = event.target.checked;
    render();
  });

  document.getElementById('reset').addEventListener('click', () => {
    state.q = '';
    search.value = '';
    ['category', 'type', 'status', 'dataset'].forEach(k => state[k].clear());
    state.onlyNotebook = state.onlyMarimo = state.onlyOpen = false;
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
