'use strict';

const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const express = require('express');
const { rateLimit } = require('express-rate-limit');

// ---------- Config ----------
const PORT = Number(process.env.PORT) || 3100;
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'codes.db');
// Dacă SESSION_SECRET lipsește, sesiunile expiră la fiecare restart (acceptabil pentru un singur admin).
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 ore
const IS_PROD = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT;
const CODE_RE = /^\d{6}$/;
const STATUSES = ['nou', 'verificat'];

if (!ADMIN_USER || !ADMIN_PASSWORD) {
  console.error('Lipsesc variabilele de mediu ADMIN_USER și/sau ADMIN_PASSWORD. Vezi .env.example.');
  process.exit(1);
}

// ---------- Bază de date ----------
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS codes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    cod        TEXT    NOT NULL,
    data_ora   TEXT    NOT NULL,
    ip         TEXT,
    status     TEXT    NOT NULL DEFAULT 'nou'
  );
  CREATE INDEX IF NOT EXISTS idx_codes_data_ora ON codes (data_ora);
`);

const insertCode = db.prepare('INSERT INTO codes (cod, data_ora, ip, status) VALUES (?, ?, ?, ?)');
const updateStatus = db.prepare('UPDATE codes SET status = ? WHERE id = ?');

function listCodes({ from, to, q }) {
  const where = [];
  const params = [];
  if (from) { where.push('data_ora >= ?'); params.push(from); }
  if (to) { where.push('data_ora < ?'); params.push(to); }
  if (q) { where.push('cod LIKE ?'); params.push(`%${q}%`); }
  const sql = `SELECT id, cod, data_ora, ip, status FROM codes
               ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY data_ora DESC, id DESC LIMIT 5000`;
  return db.prepare(sql).all(...params);
}

// ---------- Sesiune admin (cookie semnat HMAC) ----------
const COOKIE = 'admin_session';

function sign(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('base64url');
}

function createSession(user) {
  const payload = Buffer.from(JSON.stringify({ u: user, exp: Date.now() + SESSION_TTL_MS })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function readSession(req) {
  const raw = (req.headers.cookie || '')
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(COOKIE + '='));
  if (!raw) return null;
  const [payload, sig] = raw.slice(COOKIE.length + 1).split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

function safeEqual(a, b) {
  // Comparăm hash-uri ca lungimea să fie mereu egală (timingSafeEqual cere asta).
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function cookieAttrs(maxAgeSec) {
  return `Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${IS_PROD ? '; Secure' : ''}`;
}

function requireAdmin(req, res, next) {
  if (readSession(req)) return next();
  res.status(401).json({ ok: false, error: 'Neautentificat.' });
}

// ---------- App ----------
const app = express();
app.set('trust proxy', 1); // Railway rulează în spatele unui proxy — necesar pentru IP-ul real
app.disable('x-powered-by');
app.use(express.json({ limit: '2kb' }));

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'",
  });
  next();
});

const submitLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { ok: false, error: 'Prea multe încercări. Încearcă din nou peste un minut.' },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { ok: false, error: 'Prea multe încercări de autentificare. Încearcă mai târziu.' },
});

// --- Public ---
app.post('/api/submit', submitLimiter, (req, res) => {
  const { code, website } = req.body || {};

  // Honeypot: câmpul "website" e ascuns vizual; doar boții îl completează.
  // Răspundem cu succes ca botul să nu afle că a fost detectat, dar nu salvăm nimic.
  if (website) return res.json({ ok: true });

  const cod = typeof code === 'string' ? code.trim() : '';
  if (!CODE_RE.test(cod)) {
    return res.status(400).json({ ok: false, error: 'Codul trebuie să conțină exact 6 cifre.' });
  }

  insertCode.run(cod, new Date().toISOString(), req.ip || null, 'nou');
  res.json({ ok: true });
});

// --- Admin API ---
app.post('/api/login', loginLimiter, (req, res) => {
  const { user, password } = req.body || {};
  const okUser = safeEqual(user ?? '', ADMIN_USER);
  const okPass = safeEqual(password ?? '', ADMIN_PASSWORD);
  if (!(okUser && okPass)) {
    return res.status(401).json({ ok: false, error: 'Utilizator sau parolă greșite.' });
  }
  res.set('Set-Cookie', `${COOKIE}=${createSession(ADMIN_USER)}; ${cookieAttrs(SESSION_TTL_MS / 1000)}`);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.set('Set-Cookie', `${COOKIE}=; ${cookieAttrs(0)}`);
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  const s = readSession(req);
  res.json({ authenticated: !!s, user: s ? s.u : null });
});

function filtersFrom(query) {
  // from/to vin ca YYYY-MM-DD; "to" e inclusiv, deci adăugăm o zi.
  const isDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
  const from = isDate(query.from) ? new Date(query.from + 'T00:00:00').toISOString() : null;
  let to = null;
  if (isDate(query.to)) {
    const d = new Date(query.to + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    to = d.toISOString();
  }
  const q = typeof query.q === 'string' && /^\d{1,6}$/.test(query.q) ? query.q : null;
  return { from, to, q };
}

app.get('/api/codes', requireAdmin, (req, res) => {
  res.json({ ok: true, codes: listCodes(filtersFrom(req.query)) });
});

app.get('/api/codes.csv', requireAdmin, (req, res) => {
  const rows = listCodes(filtersFrom(req.query));
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['id', 'cod', 'data_ora', 'ip', 'status'].join(',')]
    .concat(rows.map((r) => [r.id, r.cod, r.data_ora, r.ip, r.status].map(esc).join(',')));
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="coduri-${new Date().toISOString().slice(0, 10)}.csv"`,
  });
  res.send('﻿' + lines.join('\r\n')); // BOM ca Excel să afișeze corect diacriticele
});

app.patch('/api/codes/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body || {};
  if (!Number.isInteger(id) || !STATUSES.includes(status)) {
    return res.status(400).json({ ok: false, error: 'Date invalide.' });
  }
  const r = updateStatus.run(status, id);
  if (r.changes === 0) return res.status(404).json({ ok: false, error: 'Codul nu există.' });
  res.json({ ok: true });
});

// --- Pagini ---
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));

app.use((req, res) => res.status(404).send('Pagina nu a fost găsită.'));

app.listen(PORT, () => {
  console.log(`Server pornit pe http://localhost:${PORT}  (admin: /admin, DB: ${DB_PATH})`);
});
