// The Garden of Earthly Delights — a treasure hunt across Bosch's triptych.
// Eden (left) holds the sources of wealth, the garden (center) the managed
// portfolio, and hell (right) claims any investment whose valuation has gone
// stale — record a fresh one and the soul is redeemed back into the garden.
//
// The painting itself (public domain; Bosch died in 1516) is not bundled:
// the app looks for /files/garden.jpg (data/documents/garden.jpg on disk)
// and shows download instructions when it is missing.

'use strict';

// Positions are % of the full triptych image (x right, y down), placed from
// the painting's composition. Fine-tune with the tune mode: open #/garden,
// tap the ✛ in the header, then click anywhere to read off coordinates.
const GARDEN_ELEMENTS = [
  { match: /safra/i, x: 12.4, y: 43, panel: 'eden', label: 'the owl in the fountain',
    blurb: 'Discreet, watchful, installed at the very heart of Eden’s Fountain of Life. Private banking, as painted around 1500.' },
  { match: /pawatech/i, x: 46.5, y: 56, panel: 'garden', label: 'the great egg',
    blurb: 'The golden egg itself — carried through the garden while everyone wonders what will hatch.' },
  { match: /tallinn|apartment/i, x: 50, y: 12, panel: 'garden', label: 'the blue fountain-tower',
    blurb: 'A fantastical tower rising from the lake — Bosch’s idea of prime real estate, Old Town Tallinn’s spiritual ancestor.' },
  { match: /projekty/i, x: 29, y: 60, panel: 'garden', label: 'the great hoopoe',
    blurb: 'An exotic bird feeding the crowd — a media platform, if you squint like it’s 1504.' },
  { match: /pawapay/i, x: 32.5, y: 64.5, panel: 'garden', label: 'the goldfinch',
    blurb: 'A small bright bird carrying berries to many mouths — payments moving across Africa.' },
  { match: /simpler/i, x: 26.5, y: 55, panel: 'garden', label: 'the mallard',
    blurb: 'A careful bird that inspects everything before it swallows — due diligence, feathered.' },
  { match: /winest/i, x: 40, y: 56.5, panel: 'garden', label: 'the mussel-shell cellar',
    blurb: 'Bosch never painted a wine bottle, but he sealed revelers inside a great shell — the closest thing the garden has to a cellar.' },
  { match: /furenfurn/i, x: 57, y: 73, panel: 'garden', label: 'the great fish',
    blurb: 'Big fish, generously fed. Lending to the largest creatures in the pond.' },
  { match: /selected alternatives/i, x: 31, y: 79, panel: 'garden', label: 'the giant strawberry',
    blurb: 'Bosch died eight years before the first tomato reached Europe — this magnificent berry is as close as he got. The garden’s produce section.' },
  // The six TOBA funds ripen as fruits across the center panel.
  { match: /nasdaq/i, x: 36.5, y: 70, panel: 'garden', label: 'a fruit of the garden', blurb: 'One of the garden’s many fruits — tended by TOBA, ripening quietly.' },
  { match: /global research/i, x: 44, y: 68, panel: 'garden', label: 'a fruit of the garden', blurb: 'One of the garden’s many fruits — tended by TOBA, ripening quietly.' },
  { match: /cat bond/i, x: 52.5, y: 66, panel: 'garden', label: 'a fruit of the garden', blurb: 'A curious fruit that pays for storms — reinsurance, the garden’s strangest crop.' },
  { match: /small cap/i, x: 60, y: 68.5, panel: 'garden', label: 'a fruit of the garden', blurb: 'Small fruits in great numbers — the whole world’s orchard, miniature.' },
  { match: /em research/i, x: 66, y: 72, panel: 'garden', label: 'a fruit of the garden', blurb: 'Fruit from the far corners of the garden — emerging markets, 1504 edition.' },
  { match: /world value/i, x: 56, y: 60.5, panel: 'garden', label: 'a fruit of the garden', blurb: 'The unfashionable fruit, bought cheaply — value investing, as old as orchards.' },
];

// Fallback spots for investments added later that match nothing above.
const GARDEN_FALLBACKS = [
  { x: 63, y: 58 }, { x: 48, y: 74 }, { x: 37, y: 62 }, { x: 68, y: 64 }, { x: 42, y: 78 },
];

// Where stale souls are held until a fresh valuation redeems them.
const HELL_SLOTS = [
  { x: 87, y: 40, label: 'clutched by the tree-man' },
  { x: 82, y: 73, label: 'strung upon the harp' },
  { x: 90.5, y: 71, label: 'at the bird-headed devil’s table' },
  { x: 89.5, y: 28, label: 'between the great ears' },
  { x: 79.5, y: 58, label: 'out on the black ice' },
  { x: 86, y: 11, label: 'in the burning city' },
];

let gardenHandle = null;
let gardenFound = new Set();

function viewGarden() {
  return `
    <div class="garden-wrap" id="gardenWrap">
      <div class="garden-loading">entering the garden…</div>
    </div>
    <div class="garden-ui">
      <div class="garden-title">The Garden of Gorecki</div>
      <div class="garden-status" id="gardenStatus"></div>
      <div class="garden-actions">
        <button class="garden-tune" id="gardenTune" title="coordinate tuning">✛</button>
        <a class="garden-exit" href="#/dashboard">← flee temptation</a>
      </div>
    </div>
    <div class="garden-hint" id="gardenHint">drag to wander · pinch or scroll to look closer · the glowing things are yours</div>`;
}

function gardenSpots() {
  const taken = new Set();
  const spots = [];
  let fallbackIdx = 0;
  let hellIdx = 0;
  for (const inv of state.investments) {
    let el = GARDEN_ELEMENTS.find((e, i) => !taken.has(i) && e.match.test(inv.name));
    if (el) taken.add(GARDEN_ELEMENTS.indexOf(el));
    else el = { ...GARDEN_FALLBACKS[fallbackIdx++ % GARDEN_FALLBACKS.length], label: 'a wonder of the garden', blurb: 'A creature of the garden not yet named by Bosch.' };
    const stale = ['warning', 'serious'].includes(staleness(inv.id).cls);
    if (stale) {
      const slot = HELL_SLOTS[hellIdx++ % HELL_SLOTS.length];
      spots.push({ inv, x: slot.x, y: slot.y, label: slot.label, blurb: el.blurb, stale: true, homeLabel: el.label });
    } else {
      spots.push({ inv, x: el.x, y: el.y, label: el.label, blurb: el.blurb, stale: false });
    }
  }
  return spots;
}

function mountGarden() {
  const wrap = document.getElementById('gardenWrap');
  if (!wrap) return;

  const img = new Image();
  img.src = '/files/garden.jpg';
  img.onload = () => buildGardenViewer(wrap, img);
  img.onerror = () => {
    wrap.innerHTML = `
      <div class="garden-missing">
        <h2>The garden awaits its canvas</h2>
        <p>This easter egg needs Bosch’s <em>Garden of Earthly Delights</em> — a public-domain
        masterpiece too large to ship with the app. Hang it once and it stays:</p>
        <ol>
          <li>On a computer, open <b>Wikimedia Commons</b> and search for
            <b>“The Garden of Earthly Delights by Bosch High Resolution”</b>
            (commons.wikimedia.org). Open the image page and download a large version —
            around 8,000&nbsp;pixels wide is perfect.</li>
          <li>Rename the downloaded file to <b>garden.jpg</b></li>
          <li>Copy it to the NAS into <b>docker/Gorecki/data/documents/</b> (File Station)</li>
          <li>Come back and tap the owl again 🦉</li>
        </ol>
        <p class="garden-missing-note">Bosch died in 1516 — the painting and its faithful photographs are public domain. No rebuild needed; the app picks it up instantly.</p>
        <a class="garden-exit" href="#/dashboard">← back to the dashboard</a>
      </div>`;
  };
}

function buildGardenViewer(wrap, img) {
  const spots = gardenSpots();
  const W = img.naturalWidth, H = img.naturalHeight;

  wrap.innerHTML = `<div class="garden-stage" id="gardenStage"></div>`;
  const stage = document.getElementById('gardenStage');
  stage.style.width = W + 'px';
  stage.style.height = H + 'px';
  img.className = 'garden-img';
  img.draggable = false;
  stage.appendChild(img);

  const spotSize = Math.max(40, W * 0.030);
  for (const spot of spots) {
    const el = document.createElement('button');
    el.className = 'g-hotspot' + (spot.stale ? ' stale' : '');
    el.style.left = spot.x + '%';
    el.style.top = spot.y + '%';
    el.style.width = el.style.height = spotSize + 'px';
    el.innerHTML = `<span class="g-label">${esc(spot.label)}</span>`;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (moved > 8) return;
      gardenFound.add(spot.inv.id);
      el.classList.add('found');
      updateGardenStatus(spots);
      openGardenBox(spot);
    });
    stage.appendChild(el);
  }
  updateGardenStatus(spots);

  // --- pan & zoom ---
  const vw = () => wrap.clientWidth, vh = () => wrap.clientHeight;
  const fitScale = () => Math.min(vw() / W, vh() / H);
  let scale = fitScale();
  const minScale = () => fitScale() * 0.9;
  let tx = (vw() - W * scale) / 2;
  let ty = (vh() - H * scale) / 2;
  let dragging = false, moved = 0, px = 0, py = 0, pinchDist = 0;
  let tuneMode = false;

  function apply() {
    const fs = fitScale();
    scale = Math.max(minScale(), Math.min(fs * 8, scale));
    const maxTx = vw() * 0.6, maxTy = vh() * 0.6;
    tx = Math.min(maxTx, Math.max(vw() - W * scale - maxTx, tx));
    ty = Math.min(maxTy, Math.max(vh() - H * scale - maxTy, ty));
    stage.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }
  apply();

  function zoomAt(cx, cy, factor) {
    const ns = Math.max(minScale(), Math.min(fitScale() * 8, scale * factor));
    tx = cx - (cx - tx) * (ns / scale);
    ty = cy - (cy - ty) * (ns / scale);
    scale = ns;
    apply();
  }

  wrap.addEventListener('pointerdown', (e) => { dragging = true; moved = 0; px = e.clientX; py = e.clientY; });
  wrap.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    tx += e.clientX - px;
    ty += e.clientY - py;
    moved += Math.abs(e.clientX - px) + Math.abs(e.clientY - py);
    px = e.clientX; py = e.clientY;
    apply();
  });
  wrap.addEventListener('pointerup', (e) => {
    dragging = false;
    if (tuneMode && moved < 8) {
      const rect = wrap.getBoundingClientRect();
      const ix = ((e.clientX - rect.left - tx) / scale / W) * 100;
      const iy = ((e.clientY - rect.top - ty) / scale / H) * 100;
      document.getElementById('gardenHint').textContent = `x: ${ix.toFixed(1)}%  ·  y: ${iy.toFixed(1)}%`;
    }
  });
  wrap.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 0.87);
  }, { passive: false });
  wrap.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      if (pinchDist) zoomAt(cx, cy, d / pinchDist);
      pinchDist = d;
      e.preventDefault();
    }
  }, { passive: false });
  wrap.addEventListener('touchend', () => { pinchDist = 0; });

  const tuneBtn = document.getElementById('gardenTune');
  if (tuneBtn) tuneBtn.addEventListener('click', () => {
    tuneMode = !tuneMode;
    tuneBtn.classList.toggle('on', tuneMode);
    document.getElementById('gardenHint').textContent = tuneMode
      ? 'tune mode: click anywhere to read coordinates'
      : 'drag to wander · pinch or scroll to look closer · the glowing things are yours';
  });

  const onResize = () => apply();
  window.addEventListener('resize', onResize);
  gardenHandle = { dispose() { window.removeEventListener('resize', onResize); } };
}

function updateGardenStatus(spots) {
  const el = document.getElementById('gardenStatus');
  if (!el) return;
  const lost = spots.filter((s) => s.stale).length;
  const found = spots.filter((s) => gardenFound.has(s.inv.id)).length;
  el.textContent = `${found} of ${spots.length} treasures found` + (lost ? ` · ${lost} soul${lost === 1 ? '' : 's'} in hell` : '');
}

function openGardenBox(spot) {
  const dialog = document.getElementById('dialog');
  const form = document.getElementById('dialogForm');
  const inv = spot.inv;
  const s = investmentSummary(inv);
  const contribs = contributionsFor(inv.id);

  const receipts = contribs.length ? contribs.map((c) => `
    <div class="receipt-line">
      <span>${fmtDate(c.date)}${c.note ? ` <span class="r-note">${esc(c.note)}</span>` : ''}</span>
      <span>${c.amount >= 0 ? '' : '−'}${fmtMoney(Math.abs(c.amount))}</span>
    </div>`).join('') : '<div class="closet-empty">No offerings recorded yet.</div>';

  const contacts = (inv.contacts || []).length ? inv.contacts.map((c) => `
    <div class="blackbook-entry"><b>${esc(c.name)}</b>${c.role ? ` — ${esc(c.role)}` : ''}
      <div class="b-meta">${[c.phone, c.email].filter(Boolean).map(esc).join(' · ')}</div>
    </div>`).join('') : '<div class="closet-empty">No mortals attached to this wonder.</div>';

  form.innerHTML = `
    <h2>${esc(inv.name)}</h2>
    <p class="tagline">${esc(spot.label)}</p>
    ${spot.stale ? `<div class="garden-damned">⚖️ This soul is trapped in hell — its last appraisal is ancient. Record a fresh valuation and it shall be redeemed into the garden${spot.homeLabel ? ` as ${esc(spot.homeLabel)}` : ''}.</div>` : ''}
    <div class="closet-section">
      <h3>The appraisal</h3>
      <div class="polaroid">
        <div class="p-value">${fmtMoney(s.value)}</div>
        <div class="p-note">${s.basis === 'cost' ? 'never appraised — carried at cost' : `as witnessed ${fmtDate(s.asOf)}`}</div>
      </div>
    </div>
    <div class="closet-section">
      <h3>The offerings — ${fmtMoney(s.contributed)} all told</h3>
      ${receipts}
    </div>
    <div class="closet-section">
      <h3>The mortals</h3>
      ${contacts}
    </div>
    <div class="closet-section">
      <h3>The legend</h3>
      <div class="blackbook-entry">${esc(spot.blurb)}</div>
    </div>
    <div class="dialog-actions">
      <button type="button" class="btn" data-close>Return to the garden</button>
    </div>`;
  dialog.classList.add('closet-dialog');
  form.querySelector('[data-close]').onclick = () => dialog.close();
  form.onsubmit = (e) => { e.preventDefault(); dialog.close(); };
  dialog.showModal();
}
