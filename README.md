# Pagină cod (6 cifre) + admin

- `/` — pagina publică: logo, text, câmp pentru cod (exact 6 cifre).
- `/admin` — login + tabel cu codurile primite (cele mai noi primele), filtrare după dată/cod, status nou/verificat, export CSV.

Stack: Node.js (>= 22.13) + Express + SQLite (modulul încorporat `node:sqlite`, fără dependențe native).

## Rulare locală

```bash
npm install
cp .env.example .env   # apoi editează ADMIN_USER / ADMIN_PASSWORD
npm run dev            # http://localhost:3100
```

## Personalizare

- **Logo**: înlocuiește `public/logo.svg` (sau pune `logo.png` și schimbă `src` în `public/index.html`).
- **Text**: titlul și descrierea sunt în `public/index.html` (marcate cu comentariul `TEXT`).

## Deploy pe Railway

1. Urcă proiectul într-un repo Git (**privat** de preferat). `.env` și baza de date sunt deja în `.gitignore`.
2. Railway → *New Project* → *Deploy from GitHub repo* → alege repo-ul.
3. *Variables*: setează `ADMIN_USER`, `ADMIN_PASSWORD`, `SESSION_SECRET` (șir aleator lung) și `DB_PATH=/data/codes.db`.
4. *Settings → Volumes*: adaugă un volum montat la `/data` (altfel codurile se pierd la fiecare redeploy).
5. *Settings → Networking*: *Generate Domain*.

`PORT` e setat automat de Railway.

## Protecții incluse

- Validare 6 cifre atât în browser, cât și pe server.
- Rate limiting: 5 trimiteri/minut/IP; 10 încercări de login / 15 min / IP.
- Honeypot anti-bot (câmp ascuns `website`).
- Sesiune admin în cookie semnat HMAC, `HttpOnly`, `SameSite=Strict`, `Secure` în producție; expiră după 8 ore.
- Header-e de securitate (CSP, `X-Frame-Options`, etc.).
