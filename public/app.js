// GOAT — Gorecki Offline Asset Tracker
// Vanilla JS single-page app. Data lives on the server (data/goat-data.json);
// the whole document is loaded once and saved back with optimistic rev checks.

'use strict';

let state = null;

const TYPE_META = {
  fund: { label: 'Fund', color: 'var(--series-1)', icon: '📈' },
  startup: { label: 'Startup / unlisted', color: 'var(--series-2)', icon: '🚀' },
  cash: { label: 'Cash', color: 'var(--series-3)', icon: '💶' },
  other: { label: 'Other', color: 'var(--series-4)', icon: '💼' },
  property: { label: 'Property', color: 'var(--series-5)', icon: '🏠' },
};
const TYPE_ORDER = ['fund', 'startup', 'cash', 'other', 'property'];

const GROUP_KINDS = {
  advisor: 'Advisor / manager',
  category: 'Category',
  custom: 'Custom',
};

// ---------- utilities ----------

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function fmtMoney(n) {
  const cur = state?.settings?.currency || 'DKK';
  return new Intl.NumberFormat('da-DK', {
    style: 'currency', currency: cur, maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString('da-DK', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysSince(iso) {
  return Math.floor((Date.now() - new Date(iso + 'T00:00:00').getTime()) / 86400000);
}

// ---------- derived values ----------

function contributionsFor(invId) {
  return state.contributions
    .filter((c) => c.investmentId === invId)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function valuationsFor(invId) {
  return state.valuations
    .filter((v) => v.investmentId === invId)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function netContributed(invId) {
  return contributionsFor(invId).reduce((sum, c) => sum + c.amount, 0);
}

function latestValuation(invId) {
  const vals = valuationsFor(invId);
  return vals.length ? vals[vals.length - 1] : null;
}

// Valuation model: the current value of an investment is its most recent manual
// valuation snapshot, adjusted for any contributions/withdrawals made AFTER that
// snapshot (money moved in later is part of the value even if not yet revalued).
// With no snapshot at all, the investment is carried at cost (net contributions).
function currentValue(invId) {
  const val = latestValuation(invId);
  if (!val) return { value: netContributed(invId), basis: 'cost', asOf: null };
  const later = contributionsFor(invId)
    .filter((c) => c.date > val.date)
    .reduce((sum, c) => sum + c.amount, 0);
  return { value: val.value + later, basis: 'valuation', asOf: val.date };
}

// Staleness of the value estimate — the honest answer to "what is it worth?"
function staleness(invId) {
  const cv = currentValue(invId);
  if (cv.basis === 'cost') return { cls: 'plain', label: 'At cost' };
  const days = daysSince(cv.asOf);
  if (days <= 90) return { cls: 'good', label: 'Fresh' };
  if (days <= 365) return { cls: 'warning', label: `${Math.round(days / 30)} mo old` };
  return { cls: 'serious', label: `${(days / 365).toFixed(1)} yr old` };
}

function investmentSummary(inv) {
  const contributed = netContributed(inv.id);
  const cv = currentValue(inv.id);
  const gain = cv.value - contributed;
  const gainPct = contributed > 0 ? (gain / contributed) * 100 : null;
  return { contributed, value: cv.value, basis: cv.basis, asOf: cv.asOf, gain, gainPct };
}

function groupSummary(groupId) {
  const members = state.investments.filter((i) => (i.groupIds || []).includes(groupId));
  let contributed = 0, value = 0;
  for (const inv of members) {
    const s = investmentSummary(inv);
    contributed += s.contributed;
    value += s.value;
  }
  const gain = value - contributed;
  return { members, contributed, value, gain, gainPct: contributed > 0 ? (gain / contributed) * 100 : null };
}

// ---------- persistence ----------

const saveStatusEl = () => document.getElementById('saveStatus');

async function loadState() {
  const res = await fetch('/api/data');
  if (!res.ok) throw new Error('failed to load data');
  state = await res.json();
}

async function saveState() {
  saveStatusEl().textContent = 'Saving…';
  saveStatusEl().classList.remove('error');
  try {
    const res = await fetch('/api/data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
    if (res.status === 409) {
      alert('Someone else saved changes in the meantime. Reloading the latest data — please redo your last change.');
      await loadState();
      render();
      return;
    }
    if (!res.ok) throw new Error((await res.json()).error || res.status);
    state.rev = (await res.json()).rev;
    saveStatusEl().textContent = 'All changes saved';
    setTimeout(() => { if (saveStatusEl().textContent === 'All changes saved') saveStatusEl().textContent = ''; }, 2500);
  } catch (err) {
    saveStatusEl().textContent = 'Save failed: ' + err.message;
    saveStatusEl().classList.add('error');
  }
}

async function mutate(fn) {
  fn();
  render();
  await saveState();
}

// ---------- dialog helper ----------

function openDialog(title, fieldsHtml, onSubmit, submitLabel = 'Save') {
  const dialog = document.getElementById('dialog');
  const form = document.getElementById('dialogForm');
  form.innerHTML = `
    <h2>${esc(title)}</h2>
    ${fieldsHtml}
    <div class="dialog-actions">
      <button type="button" class="btn ghost" data-close>Cancel</button>
      <button type="submit" class="btn">${esc(submitLabel)}</button>
    </div>`;
  form.querySelector('[data-close]').onclick = () => dialog.close();
  dialog.classList.remove('closet-dialog');
  form.onsubmit = (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    data._checked = [...form.querySelectorAll('.checks input[type=checkbox]:checked')].map((c) => c.value);
    if (onSubmit(data) !== false) dialog.close();
  };
  dialog.showModal();
}

function field(label, inner, hint) {
  return `<div class="field"><label>${esc(label)}</label>${inner}${hint ? `<div class="hint">${esc(hint)}</div>` : ''}</div>`;
}

function groupChecks(selectedIds = []) {
  if (!state.groups.length) return '<div class="hint">No groups yet — create them under Groups.</div>';
  return `<div class="checks">${state.groups.map((g) => `
    <label><input type="checkbox" value="${esc(g.id)}" ${selectedIds.includes(g.id) ? 'checked' : ''}> ${esc(g.name)} <span style="color:var(--ink-muted)">(${esc(GROUP_KINDS[g.kind] || g.kind)})</span></label>`).join('')}</div>`;
}

// ---------- forms ----------

function investmentForm(existing) {
  openDialog(existing ? 'Edit investment' : 'New investment', `
    ${field('Name', `<input name="name" required value="${esc(existing?.name || '')}" placeholder="e.g. Nordea EM Index Fund">`)}
    ${field('Type', `<select name="type">${TYPE_ORDER.map((t) => `<option value="${t}" ${existing?.type === t ? 'selected' : ''}>${TYPE_META[t].label}</option>`).join('')}</select>`)}
    <div class="field"><label class="checkline"><input type="checkbox" name="cornerstone" ${existing?.cornerstone ? 'checked' : ''}> Cornerstone — a source of wealth, shown at the top of the dashboard</label></div>
    ${field('Ownership %', `<input name="ownershipPct" type="number" step="any" min="0" max="100" value="${existing?.ownershipPct ?? ''}" placeholder="e.g. 2.12">`, 'Optional — for stakes in companies. Lets you value the position from the company’s total valuation.')}
    ${field('Groups', groupChecks(existing?.groupIds || []))}
    ${field('Notes', `<textarea name="notes" placeholder="Anything worth remembering — terms, agreements, links to contract files on the NAS…">${esc(existing?.notes || '')}</textarea>`)}
  `, (d) => {
    const ownershipPct = d.ownershipPct === '' ? null : parseFloat(d.ownershipPct);
    const common = {
      name: d.name.trim(), type: d.type, groupIds: d._checked, notes: d.notes,
      cornerstone: d.cornerstone === 'on',
      ownershipPct: isFinite(ownershipPct) && ownershipPct > 0 ? ownershipPct : null,
    };
    if (existing) {
      Object.assign(existing, common);
      mutate(() => {});
    } else {
      mutate(() => state.investments.push({
        id: uid(), ...common, contacts: [], documents: [], createdAt: today(),
      }));
    }
  });
}

function contributionForm(invId, existing) {
  openDialog(existing ? 'Edit entry' : 'Add money in / out', `
    <div class="field-row">
      ${field('Date', `<input name="date" type="date" required value="${esc(existing?.date || today())}">`)}
      ${field('Amount', `<input name="amount" type="number" step="any" required value="${existing ? esc(existing.amount) : ''}" placeholder="50000">`, 'Positive = money in. Negative = withdrawal / payout.')}
    </div>
    ${field('Note', `<input name="note" value="${esc(existing?.note || '')}" placeholder="e.g. Q3 top-up via Sopra Advice">`)}
  `, (d) => {
    const amount = parseFloat(d.amount);
    if (!isFinite(amount)) return false;
    if (existing) {
      Object.assign(existing, { date: d.date, amount, note: d.note });
      mutate(() => {});
    } else {
      mutate(() => state.contributions.push({ id: uid(), investmentId: invId, date: d.date, amount, note: d.note }));
    }
  });
}

function valuationForm(invId, existing) {
  const inv = state.investments.find((i) => i.id === invId);
  const pct = inv?.ownershipPct;
  openDialog(existing ? 'Edit valuation' : 'Record a valuation', `
    <div class="field-row">
      ${field('Date', `<input name="date" type="date" required value="${esc(existing?.date || today())}">`)}
      ${field('Value of your position', `<input name="value" type="number" step="any" value="${existing ? esc(existing.value) : ''}" placeholder="120000">`, 'In EUR. The whole position’s worth on that date.')}
    </div>
    ${pct ? field(`…or the whole company's valuation (you own ${pct}%)`,
      `<input name="companyValue" type="number" step="any" placeholder="1000000000">`,
      `In EUR. Leave the field above empty and your ${pct}% stake is computed from this.`) : ''}
    ${field('Source / note', `<input name="note" value="${esc(existing?.note || '')}" placeholder="e.g. annual statement, funding round, bank depot">`)}
  `, (d) => {
    let value = parseFloat(d.value);
    if (!isFinite(value) && pct && d.companyValue) {
      const companyValue = parseFloat(d.companyValue);
      if (isFinite(companyValue)) value = Math.round(companyValue * pct / 100);
    }
    if (!isFinite(value)) return false;
    if (existing) {
      Object.assign(existing, { date: d.date, value, note: d.note });
      mutate(() => {});
    } else {
      mutate(() => state.valuations.push({ id: uid(), investmentId: invId, date: d.date, value, note: d.note }));
    }
  });
}

// `owner` is any object with a contacts array — an investment or a group.
function contactForm(owner, existing) {
  openDialog(existing ? 'Edit contact' : 'Add contact', `
    ${field('Name', `<input name="name" required value="${esc(existing?.name || '')}">`)}
    <div class="field-row">
      ${field('Role', `<input name="role" value="${esc(existing?.role || '')}" placeholder="e.g. CEO, advisor">`)}
      ${field('Phone', `<input name="phone" value="${esc(existing?.phone || '')}">`)}
    </div>
    ${field('Email', `<input name="email" type="email" value="${esc(existing?.email || '')}">`)}
    ${field('Notes', `<textarea name="notes">${esc(existing?.notes || '')}</textarea>`)}
  `, (d) => {
    if (existing) {
      Object.assign(existing, d);
      delete existing._checked;
      mutate(() => {});
    } else {
      owner.contacts = owner.contacts || [];
      mutate(() => owner.contacts.push({ id: uid(), name: d.name, role: d.role, phone: d.phone, email: d.email, notes: d.notes }));
    }
  });
}

function documentForm(inv, existing) {
  openDialog(existing ? 'Edit document' : 'Add document reference', `
    ${field('Title', `<input name="title" required value="${esc(existing?.title || '')}" placeholder="e.g. Shareholder agreement 2024">`)}
    ${field('Location', `<input name="location" value="${esc(existing?.location || '')}" placeholder="e.g. NAS: /investments/acme/contract.pdf">`, 'A path or link to where the file lives — the file itself stays on your NAS.')}
    ${field('Note', `<input name="note" value="${esc(existing?.note || '')}">`)}
  `, (d) => {
    if (existing) {
      Object.assign(existing, d);
      delete existing._checked;
      mutate(() => {});
    } else {
      inv.documents = inv.documents || [];
      mutate(() => inv.documents.push({ id: uid(), title: d.title, location: d.location, note: d.note }));
    }
  });
}

function groupForm(existing) {
  openDialog(existing ? 'Edit group' : 'New group', `
    ${field('Name', `<input name="name" required value="${esc(existing?.name || '')}" placeholder="e.g. Sopra Advice">`)}
    ${field('Kind', `<select name="kind">${Object.entries(GROUP_KINDS).map(([k, v]) => `<option value="${k}" ${existing?.kind === k ? 'selected' : ''}>${v}</option>`).join('')}</select>`)}
    ${field('Notes', `<textarea name="notes">${esc(existing?.notes || '')}</textarea>`)}
  `, (d) => {
    if (existing) {
      Object.assign(existing, { name: d.name.trim(), kind: d.kind, notes: d.notes });
      mutate(() => {});
    } else {
      mutate(() => state.groups.push({ id: uid(), name: d.name.trim(), kind: d.kind, notes: d.notes }));
    }
  });
}

// ---------- shared renderers ----------

function gainCellHtml(gain, gainPct) {
  const cls = gain > 0 ? 'pos' : gain < 0 ? 'neg' : '';
  const sign = gain > 0 ? '+' : '';
  const pct = gainPct === null ? '' : ` (${sign}${gainPct.toFixed(1)}%)`;
  return `<span class="${cls}">${sign}${fmtMoney(gain)}${pct}</span>`;
}

function contactRowsHtml(contacts) {
  if (!(contacts || []).length) return '<div class="empty">No contacts yet.</div>';
  return contacts.map((c) => `
    <div class="list-row">
      <div><b>${esc(c.name)}</b>${c.role ? ` <span class="meta">${esc(c.role)}</span>` : ''}
        <div class="meta">${[c.phone, c.email].filter(Boolean).map(esc).join(' · ')}</div>
        ${c.notes ? `<div class="meta">${esc(c.notes)}</div>` : ''}</div>
      <div class="row-actions">
        <button class="iconbtn" data-action="edit-contact" data-id="${esc(c.id)}">Edit</button>
        <button class="iconbtn" data-action="del-contact" data-id="${esc(c.id)}">Delete</button>
      </div>
    </div>`).join('');
}

function stalenessBadge(invId) {
  const s = staleness(invId);
  return `<span class="badge ${s.cls}"><span class="bdot"></span>${esc(s.label)}</span>`;
}

function investmentsTable(investments) {
  if (!investments.length) return '<div class="empty">No investments yet. Add the first one to get started.</div>';
  const rows = investments.map((inv) => {
    const s = investmentSummary(inv);
    const groups = (inv.groupIds || [])
      .map((gid) => state.groups.find((g) => g.id === gid))
      .filter(Boolean)
      .map((g) => `<span class="chip">${esc(g.name)}</span>`)
      .join('');
    return `
      <tr class="rowlink" data-href="#/investment/${esc(inv.id)}">
        <td class="name-cell">${esc(inv.name)}${groups ? `<span class="sub">${groups}</span>` : ''}</td>
        <td><span class="type-key"><span class="swatch" style="background:${TYPE_META[inv.type]?.color}"></span>${TYPE_META[inv.type]?.icon || ''} ${esc(TYPE_META[inv.type]?.label || inv.type)}</span></td>
        <td class="num">${fmtMoney(s.contributed)}</td>
        <td class="num">${fmtMoney(s.value)}</td>
        <td>${stalenessBadge(inv.id)}</td>
        <td class="num">${gainCellHtml(s.gain, s.gainPct)}</td>
      </tr>`;
  }).join('');
  return `
    <table>
      <thead><tr>
        <th>Investment</th><th>Type</th><th class="num">Paid in (net)</th>
        <th class="num">Value</th><th>Value as of</th><th class="num">Gain</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function allocationCard() {
  const byType = {};
  for (const inv of state.investments) {
    const s = investmentSummary(inv);
    byType[inv.type] = (byType[inv.type] || 0) + Math.max(0, s.value);
  }
  const total = Object.values(byType).reduce((a, b) => a + b, 0);
  if (total <= 0) return '';
  const segs = TYPE_ORDER.filter((t) => byType[t] > 0);
  return `
    <div class="card">
      <h2>Allocation by type</h2>
      <div class="alloc-bar">
        ${segs.map((t) => `<div class="alloc-seg" style="flex:${byType[t] / total};background:${TYPE_META[t].color}" title="${esc(TYPE_META[t].label)}: ${fmtMoney(byType[t])}"></div>`).join('')}
      </div>
      <div class="legend">
        ${segs.map((t) => `<span class="legend-item"><span class="swatch" style="background:${TYPE_META[t].color}"></span>${esc(TYPE_META[t].label)} <b>${((byType[t] / total) * 100).toFixed(0)}%</b> · ${fmtMoney(byType[t])}</span>`).join('')}
      </div>
    </div>`;
}

// ---------- views ----------

// Cornerstone flavor: which illustration a source-of-wealth card gets.
function cornerstoneKind(inv) {
  if (inv.type === 'property') return 'property';
  if (inv.type === 'cash') return 'bank';
  if (inv.ownershipPct) return 'egg';
  return 'generic';
}

const CORNERSTONE_ART = {
  bank: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 6 4 18h40Z" fill="currentColor" opacity=".9"/><rect x="8" y="20" width="5" height="16" rx="1" fill="currentColor" opacity=".7"/><rect x="17" y="20" width="5" height="16" rx="1" fill="currentColor" opacity=".7"/><rect x="26" y="20" width="5" height="16" rx="1" fill="currentColor" opacity=".7"/><rect x="35" y="20" width="5" height="16" rx="1" fill="currentColor" opacity=".7"/><rect x="5" y="38" width="38" height="4" rx="1" fill="currentColor" opacity=".9"/></svg>`,
  egg: `<svg viewBox="0 0 48 48" aria-hidden="true"><defs><radialGradient id="eggG" cx="35%" cy="30%"><stop offset="0%" stop-color="#ffe9a8"/><stop offset="60%" stop-color="#e3b34c"/><stop offset="100%" stop-color="#a97817"/></radialGradient></defs><ellipse cx="24" cy="27" rx="14" ry="18" fill="url(#eggG)"/><ellipse cx="19" cy="18" rx="4" ry="6" fill="#fff5d6" opacity=".7"/></svg>`,
  property: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 6 6 22h6v20h24V22h6Z" fill="currentColor" opacity=".85"/><rect x="20" y="28" width="8" height="14" fill="#fff" opacity=".85"/></svg>`,
  generic: `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="16" fill="currentColor" opacity=".8"/></svg>`,
};

function cornerstoneCardHtml(inv) {
  const s = investmentSummary(inv);
  const kind = cornerstoneKind(inv);
  const detail = inv.ownershipPct
    ? `${inv.ownershipPct}% ownership`
    : TYPE_META[inv.type]?.label || '';
  return `
    <div class="cstone cstone-${kind} rowlink" data-href="#/investment/${esc(inv.id)}">
      <div class="cstone-art">${CORNERSTONE_ART[kind]}</div>
      <div class="cstone-body">
        <div class="cstone-name">${esc(inv.name)}</div>
        <div class="cstone-detail">${esc(detail)}</div>
        <div class="cstone-value">${fmtMoney(s.value)}</div>
        <div class="cstone-foot">${stalenessBadge(inv.id)}</div>
      </div>
    </div>`;
}

function viewDashboard() {
  let contributed = 0, value = 0, sourcesValue = 0, managedValue = 0;
  for (const inv of state.investments) {
    const s = investmentSummary(inv);
    contributed += s.contributed;
    value += s.value;
    if (inv.cornerstone) sourcesValue += s.value; else managedValue += s.value;
  }
  const gain = value - contributed;
  const gainPct = contributed > 0 ? (gain / contributed) * 100 : null;
  const deltaCls = gain > 0 ? 'up' : gain < 0 ? 'down' : 'flat';
  const staleCount = state.investments.filter((i) => ['warning', 'serious'].includes(staleness(i.id).cls)).length;

  const cornerstones = state.investments.filter((i) => i.cornerstone);
  const managed = state.investments.filter((i) => !i.cornerstone);

  const groupCards = state.groups.map((g) => {
    const s = groupSummary(g.id);
    if (!s.members.length) return '';
    return `
      <tr class="rowlink" data-href="#/group/${esc(g.id)}">
        <td class="name-cell">${esc(g.name)}<span class="sub">${esc(GROUP_KINDS[g.kind] || g.kind)} · ${s.members.length} investment${s.members.length === 1 ? '' : 's'}</span></td>
        <td class="num">${fmtMoney(s.contributed)}</td>
        <td class="num">${fmtMoney(s.value)}</td>
        <td class="num">${gainCellHtml(s.gain, s.gainPct)}</td>
      </tr>`;
  }).join('');

  return `
    <div class="page-head">
      <div><h1>Dashboard</h1><p class="view-sub">The whole portfolio at a glance.</p></div>
      <button class="btn" data-action="add-investment">+ Add investment</button>
    </div>
    <div class="tiles">
      <div class="tile"><div class="tile-label">Total wealth</div><div class="tile-value">${fmtMoney(value)}</div>
        <div class="tile-delta ${deltaCls}">${gain >= 0 ? '+' : ''}${fmtMoney(gain)}${gainPct !== null ? ` (${gain >= 0 ? '+' : ''}${gainPct.toFixed(1)}%)` : ''} vs paid in</div></div>
      <div class="tile"><div class="tile-label">Sources of wealth</div><div class="tile-value">${fmtMoney(sourcesValue)}</div>
        <div class="tile-delta flat">${cornerstones.length} cornerstone${cornerstones.length === 1 ? '' : 's'}</div></div>
      <div class="tile"><div class="tile-label">Managed portfolio</div><div class="tile-value">${fmtMoney(managedValue)}</div>
        <div class="tile-delta flat">${managed.length} investment${managed.length === 1 ? '' : 's'}</div></div>
      <div class="tile"><div class="tile-label">Values needing an update</div><div class="tile-value">${staleCount}</div>
        <div class="tile-delta flat">${staleCount ? 'valued more than 3 months ago' : 'all values are fresh'}</div></div>
    </div>
    ${cornerstones.length ? `
    <div class="card">
      <div class="card-head"><h2>Sources of wealth</h2></div>
      <div class="cstone-grid">${cornerstones.map(cornerstoneCardHtml).join('')}</div>
    </div>` : ''}
    ${allocationCard()}
    <div class="card">
      <div class="card-head"><h2>Managed portfolio</h2></div>
      ${investmentsTable(managed)}
    </div>
    ${groupCards ? `
    <div class="card">
      <div class="card-head"><h2>Groups</h2></div>
      <table>
        <thead><tr><th>Group</th><th class="num">Paid in (net)</th><th class="num">Value</th><th class="num">Gain</th></tr></thead>
        <tbody>${groupCards}</tbody>
      </table>
    </div>` : ''}
    <a class="secret-shoe" href="#/closet" title="ssshh…">👠</a>`;
}

function viewInvestments() {
  return `
    <div class="page-head">
      <div><h1>Investments</h1><p class="view-sub">Everything you own, in one list.</p></div>
      <button class="btn" data-action="add-investment">+ Add investment</button>
    </div>
    <div class="card">${investmentsTable(state.investments)}</div>`;
}

function viewInvestmentDetail(id) {
  const inv = state.investments.find((i) => i.id === id);
  if (!inv) return '<h1>Not found</h1><p class="view-sub">This investment no longer exists.</p>';
  const s = investmentSummary(inv);
  const contribs = contributionsFor(id);
  const vals = valuationsFor(id);
  const groups = (inv.groupIds || []).map((gid) => state.groups.find((g) => g.id === gid)).filter(Boolean);

  const contribRows = contribs.length ? contribs.map((c) => `
    <div class="list-row">
      <div><b>${c.amount >= 0 ? '+' : ''}${fmtMoney(c.amount)}</b> <span class="meta">${fmtDate(c.date)}${c.note ? ' · ' + esc(c.note) : ''}</span></div>
      <div class="row-actions">
        <button class="iconbtn" data-action="edit-contribution" data-id="${esc(c.id)}">Edit</button>
        <button class="iconbtn" data-action="del-contribution" data-id="${esc(c.id)}">Delete</button>
      </div>
    </div>`).join('') : '<div class="empty">No money movements recorded yet.</div>';

  const valRows = vals.length ? vals.slice().reverse().map((v) => `
    <div class="list-row">
      <div><b>${fmtMoney(v.value)}</b> <span class="meta">${fmtDate(v.date)}${v.note ? ' · ' + esc(v.note) : ''}</span></div>
      <div class="row-actions">
        <button class="iconbtn" data-action="edit-valuation" data-id="${esc(v.id)}">Edit</button>
        <button class="iconbtn" data-action="del-valuation" data-id="${esc(v.id)}">Delete</button>
      </div>
    </div>`).join('') : '<div class="empty">No valuations yet — carried at cost.</div>';

  const contactRows = contactRowsHtml(inv.contacts);

  const docRows = (inv.documents || []).length ? inv.documents.map((d) => `
    <div class="list-row">
      <div><b>${d.file ? `<a href="/files/${encodeURIComponent(d.file)}" target="_blank">${esc(d.title)}</a>` : esc(d.title)}</b>
        ${d.location ? `<div class="meta">${esc(d.location)}</div>` : ''}
        ${d.note ? `<div class="meta">${esc(d.note)}</div>` : ''}</div>
      <div class="row-actions">
        <button class="iconbtn" data-action="edit-document" data-id="${esc(d.id)}">Edit</button>
        <button class="iconbtn" data-action="del-document" data-id="${esc(d.id)}">Delete</button>
      </div>
    </div>`).join('') : '<div class="empty">No documents yet.</div>';

  return `
    <div class="page-head">
      <div>
        <h1>${esc(inv.name)}</h1>
        <p class="view-sub">
          <span class="type-key"><span class="swatch" style="background:${TYPE_META[inv.type]?.color}"></span>${TYPE_META[inv.type]?.icon || ''} ${esc(TYPE_META[inv.type]?.label || inv.type)}</span>
          ${inv.cornerstone ? '<span class="chip chip-gold">Cornerstone</span>' : ''}
          ${inv.ownershipPct ? `<span class="chip">${inv.ownershipPct}% ownership</span>` : ''}
          ${groups.map((g) => `<span class="chip">${esc(g.name)}</span>`).join('')}
        </p>
      </div>
      <div class="row-actions">
        <button class="btn ghost small" data-action="edit-investment">Edit</button>
        <button class="btn danger small" data-action="del-investment">Delete</button>
      </div>
    </div>
    <div class="tiles">
      <div class="tile"><div class="tile-label">Current value</div><div class="tile-value">${fmtMoney(s.value)}</div>
        <div class="tile-delta flat">${s.basis === 'cost' ? 'carried at cost — no valuation yet' : `last valued ${fmtDate(s.asOf)}`}</div></div>
      <div class="tile"><div class="tile-label">Paid in (net)</div><div class="tile-value">${fmtMoney(s.contributed)}</div></div>
      <div class="tile"><div class="tile-label">Gain</div><div class="tile-value">${gainCellHtml(s.gain, s.gainPct)}</div></div>
    </div>
    <div class="detail-grid">
      <div class="card">
        <div class="card-head"><h2>Money in / out</h2><button class="btn ghost small" data-action="add-contribution">+ Add</button></div>
        ${contribRows}
      </div>
      <div class="card">
        <div class="card-head"><h2>Valuations</h2><button class="btn ghost small" data-action="add-valuation">+ Record</button></div>
        ${valRows}
        <div class="stale-note">Newer money in/out is added on top of the latest valuation until you record a fresh one. ${stalenessBadge(inv.id)}</div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Contacts</h2><button class="btn ghost small" data-action="add-contact">+ Add</button></div>
        ${contactRows}
      </div>
      <div class="card">
        <div class="card-head"><h2>Documents & contracts</h2><button class="btn ghost small" data-action="add-document">+ Add</button></div>
        ${docRows}
      </div>
    </div>
    ${inv.notes ? `<div class="card"><h2>Notes</h2><div class="notes-block">${esc(inv.notes)}</div></div>` : ''}`;
}

function viewGroups() {
  const rows = state.groups.map((g) => {
    const s = groupSummary(g.id);
    return `
      <tr class="rowlink" data-href="#/group/${esc(g.id)}">
        <td class="name-cell">${esc(g.name)}<span class="sub">${esc(GROUP_KINDS[g.kind] || g.kind)}</span></td>
        <td class="num">${s.members.length}</td>
        <td class="num">${fmtMoney(s.contributed)}</td>
        <td class="num">${fmtMoney(s.value)}</td>
        <td class="num">${gainCellHtml(s.gain, s.gainPct)}</td>
      </tr>`;
  }).join('');
  return `
    <div class="page-head">
      <div><h1>Groups</h1><p class="view-sub">Group investments by advisor, theme, or anything else — and see how each group performs.</p></div>
      <button class="btn" data-action="add-group">+ New group</button>
    </div>
    <div class="card">
      ${state.groups.length ? `
      <table>
        <thead><tr><th>Group</th><th class="num">Investments</th><th class="num">Paid in (net)</th><th class="num">Value</th><th class="num">Gain</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>` : '<div class="empty">No groups yet. Create one — for example your advisor — then tag investments with it.</div>'}
    </div>`;
}

function viewGroupDetail(id) {
  const g = state.groups.find((x) => x.id === id);
  if (!g) return '<h1>Not found</h1>';
  const s = groupSummary(id);
  return `
    <div class="page-head">
      <div><h1>${esc(g.name)}</h1><p class="view-sub">${esc(GROUP_KINDS[g.kind] || g.kind)}${g.notes ? ' · ' + esc(g.notes) : ''}</p></div>
      <div class="row-actions">
        <button class="btn ghost small" data-action="edit-group">Edit</button>
        <button class="btn danger small" data-action="del-group">Delete</button>
      </div>
    </div>
    <div class="tiles">
      <div class="tile"><div class="tile-label">Group value</div><div class="tile-value">${fmtMoney(s.value)}</div></div>
      <div class="tile"><div class="tile-label">Paid in (net)</div><div class="tile-value">${fmtMoney(s.contributed)}</div></div>
      <div class="tile"><div class="tile-label">Gain</div><div class="tile-value">${gainCellHtml(s.gain, s.gainPct)}</div></div>
    </div>
    <div class="card">
      <div class="card-head"><h2>Investments in this group</h2></div>
      ${investmentsTable(s.members)}
    </div>
    <div class="card">
      <div class="card-head"><h2>Contacts</h2><button class="btn ghost small" data-action="add-contact">+ Add</button></div>
      ${contactRowsHtml(g.contacts)}
    </div>`;
}

function viewSettings() {
  return `
    <h1>Settings</h1>
    <p class="view-sub">Data lives in <code>data/goat-data.json</code> next to the server — nothing leaves your NAS.</p>
    <div class="card">
      <h2>Currency</h2>
      <div class="field" style="max-width:220px">
        <select id="currencySelect">
          ${['DKK', 'EUR', 'USD', 'SEK', 'NOK', 'GBP'].map((c) => `<option ${state.settings.currency === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
        <div class="hint">Used for display everywhere. Amounts are stored as plain numbers.</div>
      </div>
    </div>
    <div class="card">
      <h2>Backup & restore</h2>
      <p class="view-sub">The server also keeps the last 30 versions automatically in <code>data/backups/</code>.</p>
      <div class="row-actions">
        <button class="btn ghost" data-action="export-json">Download data as JSON</button>
        <button class="btn ghost" data-action="import-json">Import JSON…</button>
        <input type="file" id="importFile" accept="application/json" hidden>
      </div>
    </div>`;
}

// ---------- Carrie's closet (the easter egg) ----------

const BOX_BRAND = {
  fund: 'Maison Index',
  startup: 'Atelier Venture',
  cash: 'Petty Cash & Co.',
  other: 'Objet Trouvé',
};

function closetQuip(s) {
  if (s.basis === 'cost') return 'never appraised — priceless, presumably';
  const when = fmtDate(s.asOf);
  if (s.gain > 0) return `appraised ${when}. Worth more than you paid. Fabulous.`;
  if (s.gain < 0) return `appraised ${when}. We don't talk about it.`;
  return `appraised ${when}. Exactly what you paid. How sensible.`;
}

function viewCloset() {
  let contributed = 0, value = 0;
  for (const inv of state.investments) {
    const s = investmentSummary(inv);
    contributed += s.contributed;
    value += s.value;
  }
  const gain = value - contributed;
  const gainLine = gain > 0
    ? `up ${fmtMoney(gain)} on what you paid, darling`
    : gain < 0
      ? `down ${fmtMoney(-gain)} — but money can't buy style anyway`
      : 'worth exactly what you paid. How rare.';

  // Cornerstones become the closet's iconic pieces; the rest go on shelves.
  const icons = state.investments.filter((i) => i.cornerstone);
  const regular = state.investments.filter((i) => !i.cornerstone);

  const galleryHtml = icons.length ? `
    <section class="closet-gallery">
      ${icons.map((inv) => {
        const s = investmentSummary(inv);
        const kind = cornerstoneKind(inv);
        if (kind === 'egg') return `
          <button class="gallery-item" data-action="open-box" data-id="${esc(inv.id)}">
            <span class="pedestal-top">
              <svg viewBox="0 0 120 90" aria-hidden="true">
                <defs><linearGradient id="satin" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#7fa4f0"/><stop offset="55%" stop-color="#2f55c4"/><stop offset="100%" stop-color="#1b3a99"/></linearGradient></defs>
                <!-- pump silhouette, side view, toe to the right -->
                <path d="M22 38 C26 32 33 32 36 38 C40 46 46 54 58 59 C74 65 92 66 103 68 C110 69 112 71 112 74 L112 75 C112 77 110 78 107 78 L36 78 C30 78 27 74 27 68 C27 58 20 48 22 38 Z" fill="url(#satin)"/>
                <path d="M22 38 C26 32 33 32 36 38 C38 43 41 48 46 52 C42 60 38 66 37 78 L36 78 C30 78 27 74 27 68 C27 58 20 48 22 38 Z" fill="#24469f" opacity=".55"/>
                <!-- stiletto heel -->
                <path d="M31 78 L27 90 L33 90 L38 78 Z" fill="#1b3a99"/>
                <!-- crystal buckle on the toe -->
                <rect x="88" y="56" width="15" height="11" rx="2" transform="rotate(6 95 61)" fill="#dfe9ff" stroke="#9fb6e8"/>
                <circle cx="92" cy="59" r="1.3" fill="#fff"/><circle cx="97" cy="60" r="1.3" fill="#fff"/><circle cx="94" cy="63" r="1.3" fill="#fff"/><circle cx="100" cy="63" r="1.3" fill="#fff"/>
              </svg>
            </span>
            <span class="gallery-caption">the blue Manolos</span>
            <span class="gallery-name">${esc(inv.name)}</span>
            <span class="gallery-value">${fmtMoney(s.value)}</span>
          </button>`;
        if (kind === 'bank') return `
          <button class="gallery-item" data-action="open-box" data-id="${esc(inv.id)}">
            <span class="pedestal-top">
              <svg viewBox="0 0 120 90" aria-hidden="true">
                <defs><pattern id="newsprint" width="8" height="6" patternUnits="userSpaceOnUse"><rect width="8" height="6" fill="#f4f1e8"/><rect x="0.5" y="1" width="7" height="0.9" fill="#8b8578"/><rect x="0.5" y="3.4" width="5" height="0.9" fill="#b3ac9c"/></pattern></defs>
                <path d="M60 6 L54 14 L66 14 Z" fill="#6b6458"/>
                <path d="M48 16 L72 16 L82 48 C84 60 78 84 60 84 C42 84 36 60 38 48 Z" fill="url(#newsprint)" stroke="#8b8578" stroke-width="1"/>
                <path d="M48 16 L60 30 L72 16 L72 22 L60 38 L48 22 Z" fill="#d6cfbf"/>
                <rect x="57" y="2" width="6" height="6" rx="2" fill="none" stroke="#6b6458" stroke-width="1.6"/>
              </svg>
            </span>
            <span class="gallery-caption">the newspaper dress</span>
            <span class="gallery-name">${esc(inv.name)}</span>
            <span class="gallery-value">${fmtMoney(s.value)}</span>
          </button>`;
        if (kind === 'property') return `
          <button class="gallery-item" data-action="open-box" data-id="${esc(inv.id)}">
            <span class="pedestal-top deed-frame">
              <span class="deed-paper">
                <span class="deed-title">DEED</span>
                <span class="deed-lines"></span>
                <span class="deed-seal"></span>
              </span>
            </span>
            <span class="gallery-caption">framed &amp; on the wall</span>
            <span class="gallery-name">${esc(inv.name)}</span>
            <span class="gallery-value">${fmtMoney(s.value)}</span>
          </button>`;
        return `
          <button class="gallery-item" data-action="open-box" data-id="${esc(inv.id)}">
            <span class="pedestal-top">${CORNERSTONE_ART.generic}</span>
            <span class="gallery-caption">one of a kind</span>
            <span class="gallery-name">${esc(inv.name)}</span>
            <span class="gallery-value">${fmtMoney(s.value)}</span>
          </button>`;
      }).join('')}
    </section>` : '';

  const shelves = [];
  for (const g of state.groups) {
    const members = regular.filter((i) => (i.groupIds || []).includes(g.id));
    if (members.length) shelves.push({ title: `The ${g.name} collection`, members });
  }
  const solo = regular.filter((i) => !(i.groupIds || []).length);
  if (solo.length) shelves.push({ title: 'One-of-a-kind pieces', members: solo });

  const shelvesHtml = shelves.map((shelf) => `
    <section class="shelf">
      <div class="shelf-title">${esc(shelf.title)}</div>
      <div class="shelf-boxes">
        ${shelf.members.map((inv) => {
          const s = investmentSummary(inv);
          return `
          <button class="shoebox" data-action="open-box" data-id="${esc(inv.id)}">
            <span class="box-brand">${esc(BOX_BRAND[inv.type] || 'Vintage')}</span>
            <span class="box-name">${esc(inv.name)}</span>
            <span class="box-value">${fmtMoney(s.value)}</span>
          </button>`;
        }).join('')}
      </div>
    </section>`).join('');

  return `
    <div class="closet">
      <h1>Carrie's Closet</h1>
      <p class="tagline">“I like my money right where I can see it… hanging in my closet.”</p>
      <div class="vanity">
        <div class="mirror">
          <div class="mirror-label">the mirror never lies, darling</div>
          <div class="mirror-value">${fmtMoney(value)}</div>
          <div class="mirror-gain">${gainLine}</div>
        </div>
      </div>
      ${galleryHtml}
      ${shelvesHtml || (!icons.length ? '<p class="closet-empty">An empty closet. Tragic. Add some investments first.</p>' : '')}
      <a class="closet-exit" href="#/dashboard">← tiptoe back to reality</a>
    </div>`;
}

// ---- entrance: doors + music ----

let closetAudio = null;

// Original chiptune riff (square-wave, latin-swing feel) — plays only if the
// user hasn't dropped a closet-theme.mp3 into data/documents/.
function playChiptune() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.value = 0.12;
  master.connect(ctx.destination);
  const note = (freq, start, dur, type = 'square', vol = 1) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, ctx.currentTime + start);
    g.gain.linearRampToValueAtTime(vol, ctx.currentTime + start + 0.02);
    g.gain.setTargetAtTime(0, ctx.currentTime + start + dur - 0.05, 0.03);
    osc.connect(g).connect(master);
    osc.start(ctx.currentTime + start);
    osc.stop(ctx.currentTime + start + dur + 0.1);
  };
  const N = { C4: 261.6, E4: 329.6, G4: 392.0, A4: 440.0, B4: 493.9, C5: 523.3, D5: 587.3, E5: 659.3, G5: 784.0, A5: 880.0 };
  // melody — an original, upbeat little strut
  const swing = 0.21;
  const mel = [
    [N.E5, 0], [N.G5, 1], [N.A5, 2], [N.G5, 3], [N.E5, 4], [N.C5, 5.5], [N.D5, 6.5], [N.E5, 7],
    [N.D5, 9], [N.E5, 10], [N.C5, 11], [N.A4, 12], [N.B4, 13.5], [N.C5, 14.5], [N.D5, 15],
    [N.E5, 17], [N.G5, 18], [N.A5, 19], [N.G5, 20.5], [N.E5, 21.5], [N.D5, 22.5], [N.C5, 23.5],
  ];
  for (const [f, t] of mel) note(f, t * swing, swing * 1.4, 'square', 0.9);
  // bass bounce
  const bass = [N.C4, N.G4, N.A4, N.G4, N.C4, N.G4, N.E4, N.G4, N.C4, N.G4, N.A4, N.G4, N.C4];
  bass.forEach((f, i) => note(f / 2, i * 2 * swing, swing, 'triangle', 1.2));
  setTimeout(() => ctx.close(), 7000);
}

function playClosetTheme() {
  stopClosetTheme();
  closetAudio = new Audio('/files/closet-theme.mp3');
  closetAudio.volume = 0.6;
  closetAudio.play().catch(() => playChiptune());
  closetAudio.onerror = () => playChiptune();
}

function stopClosetTheme() {
  if (closetAudio) {
    closetAudio.pause();
    closetAudio = null;
  }
}

function animateClosetEntrance() {
  const doors = document.createElement('div');
  doors.className = 'closet-doors';
  doors.innerHTML = '<div class="door left"><span class="knob"></span></div><div class="door right"><span class="knob"></span></div>';
  document.body.appendChild(doors);
  requestAnimationFrame(() => requestAnimationFrame(() => doors.classList.add('open')));
  setTimeout(() => doors.remove(), 2100);
}

function openClosetBox(inv) {
  const dialog = document.getElementById('dialog');
  const form = document.getElementById('dialogForm');
  const s = investmentSummary(inv);
  const contribs = contributionsFor(inv.id);

  const receipts = contribs.length ? contribs.map((c) => `
    <div class="receipt-line">
      <span>${fmtDate(c.date)}${c.note ? ` <span class="r-note">${esc(c.note)}</span>` : ''}</span>
      <span>${c.amount >= 0 ? '' : '−'}${fmtMoney(Math.abs(c.amount))}</span>
    </div>`).join('') : '<div class="closet-empty">No receipts. A gift? How mysterious.</div>';

  const blackbook = (inv.contacts || []).length ? inv.contacts.map((c) => `
    <div class="blackbook-entry"><b>${esc(c.name)}</b>${c.role ? ` — ${esc(c.role)}` : ''}
      <div class="b-meta">${[c.phone, c.email].filter(Boolean).map(esc).join(' · ')}</div>
    </div>`).join('') : '<div class="closet-empty">No one to call about this one.</div>';

  form.innerHTML = `
    <h2>${esc(inv.name)}</h2>
    <p class="tagline">${esc(BOX_BRAND[inv.type] || 'Vintage')}</p>
    <div class="closet-section">
      <h3>The polaroid</h3>
      <div class="polaroid">
        <div class="p-value">${fmtMoney(s.value)}</div>
        <div class="p-note">${esc(closetQuip(s))}</div>
      </div>
    </div>
    <div class="closet-section">
      <h3>The receipts — ${fmtMoney(s.contributed)} all told</h3>
      ${receipts}
    </div>
    <div class="closet-section">
      <h3>The little black book</h3>
      ${blackbook}
    </div>
    ${inv.notes ? `<div class="closet-section"><h3>A note pinned to the lid</h3><div class="blackbook-entry">${esc(inv.notes)}</div></div>` : ''}
    <div class="dialog-actions">
      <button type="button" class="btn" data-close>Put the lid back on</button>
    </div>`;
  dialog.classList.add('closet-dialog');
  form.querySelector('[data-close]').onclick = () => dialog.close();
  form.onsubmit = (e) => { e.preventDefault(); dialog.close(); };
  dialog.showModal();
}

// ---------- router & events ----------

function route() {
  const hash = location.hash || '#/dashboard';
  const parts = hash.slice(2).split('/');
  return { page: parts[0] || 'dashboard', id: parts[1] || null };
}

let lastPage = null;

function render() {
  if (!state) return;
  const { page, id } = route();
  const view = document.getElementById('view');
  const views = {
    dashboard: () => viewDashboard(),
    investments: () => viewInvestments(),
    investment: () => viewInvestmentDetail(id),
    groups: () => viewGroups(),
    group: () => viewGroupDetail(id),
    settings: () => viewSettings(),
    closet: () => viewCloset(),
  };
  view.innerHTML = (views[page] || views.dashboard)();
  document.body.classList.toggle('in-closet', page === 'closet');
  if (page === 'closet' && lastPage !== 'closet') {
    animateClosetEntrance();
    playClosetTheme();
  }
  if (page !== 'closet' && lastPage === 'closet') stopClosetTheme();
  lastPage = page;
  document.querySelectorAll('.sidebar a').forEach((a) => {
    const target = a.dataset.nav;
    const active = target === page || (target === 'investments' && page === 'investment') || (target === 'groups' && page === 'group');
    a.classList.toggle('active', active);
  });
}

function handleAction(action, targetId) {
  const { id } = route();
  const inv = state.investments.find((i) => i.id === id);
  const group = state.groups.find((g) => g.id === id);
  // Contacts live on whichever entity the current page shows.
  const owner = inv || group;

  const actions = {
    'add-investment': () => investmentForm(null),
    'edit-investment': () => investmentForm(inv),
    'del-investment': () => {
      if (!confirm(`Delete "${inv.name}" and all its history? This cannot be undone in the app (backups exist on disk).`)) return;
      mutate(() => {
        state.investments = state.investments.filter((i) => i.id !== inv.id);
        state.contributions = state.contributions.filter((c) => c.investmentId !== inv.id);
        state.valuations = state.valuations.filter((v) => v.investmentId !== inv.id);
      });
      location.hash = '#/investments';
    },
    'add-contribution': () => contributionForm(id, null),
    'edit-contribution': () => contributionForm(id, state.contributions.find((c) => c.id === targetId)),
    'del-contribution': () => mutate(() => { state.contributions = state.contributions.filter((c) => c.id !== targetId); }),
    'add-valuation': () => valuationForm(id, null),
    'edit-valuation': () => valuationForm(id, state.valuations.find((v) => v.id === targetId)),
    'del-valuation': () => mutate(() => { state.valuations = state.valuations.filter((v) => v.id !== targetId); }),
    'add-contact': () => contactForm(owner, null),
    'edit-contact': () => contactForm(owner, (owner.contacts || []).find((c) => c.id === targetId)),
    'del-contact': () => mutate(() => { owner.contacts = owner.contacts.filter((c) => c.id !== targetId); }),
    'add-document': () => documentForm(inv, null),
    'edit-document': () => documentForm(inv, (inv.documents || []).find((d) => d.id === targetId)),
    'del-document': () => mutate(() => { inv.documents = inv.documents.filter((d) => d.id !== targetId); }),
    'open-box': () => openClosetBox(state.investments.find((i) => i.id === targetId)),
    'add-group': () => groupForm(null),
    'edit-group': () => groupForm(group),
    'del-group': () => {
      if (!confirm(`Delete group "${group.name}"? Investments stay — they just lose this tag.`)) return;
      mutate(() => {
        state.groups = state.groups.filter((g) => g.id !== group.id);
        for (const i of state.investments) i.groupIds = (i.groupIds || []).filter((gid) => gid !== group.id);
      });
      location.hash = '#/groups';
    },
    'export-json': () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `goat-data-${today()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    },
    'import-json': () => {
      const input = document.getElementById('importFile');
      input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;
        try {
          const incoming = JSON.parse(await file.text());
          if (!Array.isArray(incoming.investments)) throw new Error('not a GOAT data file');
          if (!confirm('Replace ALL current data with the imported file?')) return;
          incoming.rev = state.rev;
          state = incoming;
          render();
          await saveState();
        } catch (err) {
          alert('Import failed: ' + err.message);
        }
      };
      input.click();
    },
  };
  actions[action]?.();
}

document.addEventListener('click', (e) => {
  const actionEl = e.target.closest('[data-action]');
  if (actionEl) {
    handleAction(actionEl.dataset.action, actionEl.dataset.id);
    return;
  }
  const row = e.target.closest('tr[data-href]');
  if (row) location.hash = row.dataset.href;
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'currencySelect') {
    mutate(() => { state.settings.currency = e.target.value; });
  }
});

window.addEventListener('hashchange', render);

(async function start() {
  try {
    await loadState();
    render();
  } catch (err) {
    document.getElementById('view').innerHTML = `<h1>Could not load data</h1><p class="view-sub">${esc(err.message)} — is the server running?</p>`;
  }
})();
