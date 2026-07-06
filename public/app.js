// GOAT — Gorecki Offline Asset Tracker
// Vanilla JS single-page app. Data lives on the server (data/goat-data.json);
// the whole document is loaded once and saved back with optimistic rev checks.

'use strict';

let state = null;

const TYPE_META = {
  fund: { label: 'Fund', color: 'var(--series-1)' },
  startup: { label: 'Startup / unlisted', color: 'var(--series-2)' },
  cash: { label: 'Cash', color: 'var(--series-3)' },
  other: { label: 'Other', color: 'var(--series-4)' },
};
const TYPE_ORDER = ['fund', 'startup', 'cash', 'other'];

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
  form.onsubmit = (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    data._checked = [...form.querySelectorAll('input[type=checkbox]:checked')].map((c) => c.value);
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
    ${field('Groups', groupChecks(existing?.groupIds || []))}
    ${field('Notes', `<textarea name="notes" placeholder="Anything worth remembering — terms, agreements, links to contract files on the NAS…">${esc(existing?.notes || '')}</textarea>`)}
  `, (d) => {
    if (existing) {
      Object.assign(existing, { name: d.name.trim(), type: d.type, groupIds: d._checked, notes: d.notes });
      mutate(() => {});
    } else {
      mutate(() => state.investments.push({
        id: uid(), name: d.name.trim(), type: d.type, groupIds: d._checked,
        notes: d.notes, contacts: [], documents: [], createdAt: today(),
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
  openDialog(existing ? 'Edit valuation' : 'Record a valuation', `
    <div class="field-row">
      ${field('Date', `<input name="date" type="date" required value="${esc(existing?.date || today())}">`)}
      ${field('Total value', `<input name="value" type="number" step="any" required value="${existing ? esc(existing.value) : ''}" placeholder="120000">`, 'The whole position’s worth on that date.')}
    </div>
    ${field('Source / note', `<input name="note" value="${esc(existing?.note || '')}" placeholder="e.g. annual statement, funding round, bank depot">`)}
  `, (d) => {
    const value = parseFloat(d.value);
    if (!isFinite(value)) return false;
    if (existing) {
      Object.assign(existing, { date: d.date, value, note: d.note });
      mutate(() => {});
    } else {
      mutate(() => state.valuations.push({ id: uid(), investmentId: invId, date: d.date, value, note: d.note }));
    }
  });
}

function contactForm(inv, existing) {
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
      inv.contacts = inv.contacts || [];
      mutate(() => inv.contacts.push({ id: uid(), name: d.name, role: d.role, phone: d.phone, email: d.email, notes: d.notes }));
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
        <td><span class="type-key"><span class="swatch" style="background:${TYPE_META[inv.type]?.color}"></span>${esc(TYPE_META[inv.type]?.label || inv.type)}</span></td>
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

function viewDashboard() {
  let contributed = 0, value = 0;
  for (const inv of state.investments) {
    const s = investmentSummary(inv);
    contributed += s.contributed;
    value += s.value;
  }
  const gain = value - contributed;
  const gainPct = contributed > 0 ? (gain / contributed) * 100 : null;
  const deltaCls = gain > 0 ? 'up' : gain < 0 ? 'down' : 'flat';
  const staleCount = state.investments.filter((i) => ['warning', 'serious'].includes(staleness(i.id).cls)).length;

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
      <div class="tile"><div class="tile-label">Portfolio value</div><div class="tile-value">${fmtMoney(value)}</div>
        <div class="tile-delta ${deltaCls}">${gain >= 0 ? '+' : ''}${fmtMoney(gain)}${gainPct !== null ? ` (${gain >= 0 ? '+' : ''}${gainPct.toFixed(1)}%)` : ''} vs paid in</div></div>
      <div class="tile"><div class="tile-label">Paid in (net)</div><div class="tile-value">${fmtMoney(contributed)}</div></div>
      <div class="tile"><div class="tile-label">Investments</div><div class="tile-value">${state.investments.length}</div></div>
      <div class="tile"><div class="tile-label">Values needing an update</div><div class="tile-value">${staleCount}</div>
        <div class="tile-delta flat">${staleCount ? 'valued more than 3 months ago' : 'all values are fresh'}</div></div>
    </div>
    ${allocationCard()}
    <div class="card">
      <div class="card-head"><h2>Investments</h2></div>
      ${investmentsTable(state.investments)}
    </div>
    ${groupCards ? `
    <div class="card">
      <div class="card-head"><h2>Groups</h2></div>
      <table>
        <thead><tr><th>Group</th><th class="num">Paid in (net)</th><th class="num">Value</th><th class="num">Gain</th></tr></thead>
        <tbody>${groupCards}</tbody>
      </table>
    </div>` : ''}`;
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

  const contactRows = (inv.contacts || []).length ? inv.contacts.map((c) => `
    <div class="list-row">
      <div><b>${esc(c.name)}</b>${c.role ? ` <span class="meta">${esc(c.role)}</span>` : ''}
        <div class="meta">${[c.phone, c.email].filter(Boolean).map(esc).join(' · ')}</div>
        ${c.notes ? `<div class="meta">${esc(c.notes)}</div>` : ''}</div>
      <div class="row-actions">
        <button class="iconbtn" data-action="edit-contact" data-id="${esc(c.id)}">Edit</button>
        <button class="iconbtn" data-action="del-contact" data-id="${esc(c.id)}">Delete</button>
      </div>
    </div>`).join('') : '<div class="empty">No contacts yet.</div>';

  const docRows = (inv.documents || []).length ? inv.documents.map((d) => `
    <div class="list-row">
      <div><b>${esc(d.title)}</b>
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
          <span class="type-key"><span class="swatch" style="background:${TYPE_META[inv.type]?.color}"></span>${esc(TYPE_META[inv.type]?.label || inv.type)}</span>
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

// ---------- router & events ----------

function route() {
  const hash = location.hash || '#/dashboard';
  const parts = hash.slice(2).split('/');
  return { page: parts[0] || 'dashboard', id: parts[1] || null };
}

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
  };
  view.innerHTML = (views[page] || views.dashboard)();
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
    'add-contact': () => contactForm(inv, null),
    'edit-contact': () => contactForm(inv, (inv.contacts || []).find((c) => c.id === targetId)),
    'del-contact': () => mutate(() => { inv.contacts = inv.contacts.filter((c) => c.id !== targetId); }),
    'add-document': () => documentForm(inv, null),
    'edit-document': () => documentForm(inv, (inv.documents || []).find((d) => d.id === targetId)),
    'del-document': () => mutate(() => { inv.documents = inv.documents.filter((d) => d.id !== targetId); }),
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
