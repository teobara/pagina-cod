'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const express = require('express');
const { rateLimit } = require('express-rate-limit');

// ---------- Config ----------
const PORT = Number(process.env.PORT) || 3100;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'codes.db');
const CODE_RE = /^\d{6}$/;

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
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; frame-ancestors 'none'",
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

app.post('/api/submit', submitLimiter, (req, res) => {
  const { code, website } = req.body || {};

  // Honeypot: câmpul "website" e ascuns vizual; doar boții îl completează.
  // Răspundem cu succes ca botul să nu afle că a fost detectat, dar nu salvăm nimic.
  if (website) return res.json({ ok: true });

  const cod = typeof code === 'string' ? code.trim() : '';
  if (!CODE_RE.test(cod)) {
    return res.status(400).json({ ok: false, error: 'Codul trebuie să conțină exact 6 cifre.' });
  }

  const dataOra = new Date().toISOString();
  insertCode.run(cod, dataOra, req.ip || null, 'nou');
  console.log(`[cod] ${cod}  ${dataOra}  ip=${req.ip || '-'}`);
  res.json({ ok: true });
});

app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));

app.use((req, res) => res.status(404).send('Pagina nu a fost găsită.'));

app.listen(PORT, () => {
  console.log(`Server pornit pe http://localhost:${PORT}  (DB: ${DB_PATH})`);
});
