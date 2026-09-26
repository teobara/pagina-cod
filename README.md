# Pagină cod (6 cifre)

Pagină publică: logo, text, câmp pentru cod (exact 6 cifre). Codurile trimise se salvează în SQLite (tabelul `codes`) și apar și în log-urile serverului, pe linii de forma `[cod] 123456 ...`.

Stack: Node.js (>= 22.13) + Express + SQLite (modulul încorporat `node:sqlite`, fără dependențe native).

## Rulare locală

```bash
npm install
npm run dev            # http://localhost:3100
```

## Personalizare

- **Logo**: înlocuiește `public/logo.svg` (sau pune `logo.png` și schimbă `src` în `public/index.html`).
- **Text**: titlul și descrierea sunt în `public/index.html` (marcate cu comentariul `TEXT`).

## Deploy pe Railway

1. *New Project* → *Deploy from GitHub repo* → alege repo-ul.
2. (Recomandat) *Variables*: `DB_PATH=/data/codes.db` + un volum montat la `/data`, altfel baza de date se pierde la fiecare redeploy.
3. *Settings → Networking*: *Generate Domain*.

`PORT` e setat automat de Railway.

## Protecții incluse

- Validare 6 cifre atât în browser, cât și pe server.
- Rate limiting: 5 trimiteri/minut/IP.
- Honeypot anti-bot (câmp ascuns `website`).
- Header-e de securitate (CSP, `X-Frame-Options`, etc.).
