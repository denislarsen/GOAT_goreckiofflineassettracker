#!/usr/bin/env node
// GOAT — Gorecki Offline Asset Tracker
// Zero-dependency Node server: static frontend + JSON data API.
// Runs anywhere Node >= 18 exists (NAS, Docker, laptop): `node server.js`

const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const PORT = parseInt(process.env.PORT || '8420', 10);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'goat-data.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const MAX_BACKUPS = 30;
const MAX_BODY_BYTES = 10 * 1024 * 1024;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const EMPTY_STATE = {
  rev: 0,
  settings: { currency: 'DKK' },
  groups: [],
  investments: [],
  contributions: [],
  valuations: [],
};

function ensureDataDirs() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(EMPTY_STATE, null, 2));
  }
}

async function readState() {
  const raw = await fsp.readFile(DATA_FILE, 'utf8');
  return JSON.parse(raw);
}

// Write via temp file + rename so a crash mid-write can't corrupt the data file.
async function writeState(state) {
  const tmp = DATA_FILE + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(state, null, 2));
  await fsp.rename(tmp, DATA_FILE);
}

async function backupCurrent() {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await fsp.copyFile(DATA_FILE, path.join(BACKUP_DIR, `goat-data-${stamp}.json`));
    const files = (await fsp.readdir(BACKUP_DIR)).filter((f) => f.endsWith('.json')).sort();
    while (files.length > MAX_BACKUPS) {
      await fsp.unlink(path.join(BACKUP_DIR, files.shift()));
    }
  } catch (err) {
    console.error('backup failed (continuing):', err.message);
  }
}

function validateState(state) {
  if (typeof state !== 'object' || state === null) return 'state must be an object';
  if (!Number.isInteger(state.rev)) return 'rev must be an integer';
  for (const key of ['groups', 'investments', 'contributions', 'valuations']) {
    if (!Array.isArray(state[key])) return `${key} must be an array`;
  }
  if (typeof state.settings !== 'object' || state.settings === null) return 'settings must be an object';
  const invIds = new Set(state.investments.map((i) => i.id));
  for (const c of state.contributions) {
    if (!invIds.has(c.investmentId)) return `contribution ${c.id} references unknown investment`;
    if (typeof c.amount !== 'number' || !isFinite(c.amount)) return `contribution ${c.id} has invalid amount`;
  }
  for (const v of state.valuations) {
    if (!invIds.has(v.investmentId)) return `valuation ${v.id} references unknown investment`;
    if (typeof v.value !== 'number' || !isFinite(v.value)) return `valuation ${v.id} has invalid value`;
  }
  return null;
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// Serialize writes so two overlapping saves can't interleave.
let writeChain = Promise.resolve();

async function handleApi(req, res, url) {
  if (url.pathname === '/api/data' && req.method === 'GET') {
    const state = await readState();
    return sendJson(res, 200, state);
  }

  if (url.pathname === '/api/data' && req.method === 'PUT') {
    let incoming;
    try {
      incoming = JSON.parse(await readBody(req));
    } catch (err) {
      return sendJson(res, 400, { error: 'invalid JSON: ' + err.message });
    }
    const problem = validateState(incoming);
    if (problem) return sendJson(res, 400, { error: problem });

    const result = await (writeChain = writeChain.then(async () => {
      const current = await readState();
      // Optimistic concurrency: client must submit the rev it loaded.
      if (incoming.rev !== current.rev) {
        return { status: 409, body: { error: 'conflict', serverRev: current.rev } };
      }
      incoming.rev = current.rev + 1;
      await backupCurrent();
      await writeState(incoming);
      return { status: 200, body: { ok: true, rev: incoming.rev } };
    }).catch((err) => ({ status: 500, body: { error: err.message } })));

    return sendJson(res, result.status, result.body);
  }

  return sendJson(res, 404, { error: 'not found' });
}

async function serveStatic(req, res, url) {
  let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, '');
  const abs = path.join(PUBLIC_DIR, filePath);
  if (!abs.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('forbidden');
  }
  try {
    const content = await fsp.readFile(abs);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(abs)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
    } else {
      await serveStatic(req, res, url);
    }
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: 'internal error' });
  }
});

ensureDataDirs();
server.listen(PORT, HOST, () => {
  console.log(`GOAT running at http://${HOST}:${PORT}  (data: ${DATA_FILE})`);
});
