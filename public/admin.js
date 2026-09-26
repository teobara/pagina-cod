(function () {
  const $ = (id) => document.getElementById(id);
  const loginView = $('login-view');
  const codesView = $('codes-view');
  const loginForm = $('login-form');
  const loginMsg = $('login-message');
  const filters = $('filters');
  const tbody = $('codes-body');

  const fmt = new Intl.DateTimeFormat('ro-RO', { dateStyle: 'short', timeStyle: 'medium' });

  function showLogin() {
    codesView.classList.add('hidden');
    loginView.classList.remove('hidden');
    $('user').focus();
  }

  function showCodes() {
    loginView.classList.add('hidden');
    codesView.classList.remove('hidden');
    loadCodes();
  }

  function filterQuery() {
    const params = new URLSearchParams();
    for (const [k, v] of new FormData(filters)) if (v) params.set(k, v);
    return params.toString();
  }

  function cell(text, cls) {
    const td = document.createElement('td');
    td.textContent = text;
    if (cls) td.className = cls;
    return td;
  }

  function render(codes) {
    tbody.replaceChildren();
    $('empty').classList.toggle('hidden', codes.length > 0);
    $('count').textContent = `${codes.length} ${codes.length === 1 ? 'cod' : 'coduri'}`;

    for (const c of codes) {
      const tr = document.createElement('tr');
      tr.append(cell(c.id), cell(c.cod, 'code'), cell(fmt.format(new Date(c.data_ora))), cell(c.ip || '—'));

      const statusTd = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = 'badge ' + c.status;
      badge.textContent = c.status;
      statusTd.append(badge);
      tr.append(statusTd);

      const actionTd = document.createElement('td');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-secondary btn-small';
      const next = c.status === 'nou' ? 'verificat' : 'nou';
      btn.textContent = c.status === 'nou' ? 'Marchează verificat' : 'Marchează nou';
      btn.addEventListener('click', () => setStatus(c.id, next, btn));
      actionTd.append(btn);
      tr.append(actionTd);

      tbody.append(tr);
    }
  }

  async function loadCodes() {
    const res = await fetch('/api/codes?' + filterQuery());
    if (res.status === 401) return showLogin();
    const data = await res.json();
    render(data.codes || []);
  }

  async function setStatus(id, status, btn) {
    btn.disabled = true;
    const res = await fetch('/api/codes/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.status === 401) return showLogin();
    loadCodes();
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    $('login-btn').disabled = true;
    loginMsg.textContent = '';
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: $('user').value, password: $('password').value }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        loginForm.reset();
        showCodes();
      } else {
        loginMsg.className = 'message error';
        loginMsg.textContent = data.error || 'Autentificare eșuată.';
      }
    } finally {
      $('login-btn').disabled = false;
    }
  });

  $('logout-btn').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    showLogin();
  });

  $('refresh-btn').addEventListener('click', loadCodes);
  filters.addEventListener('submit', (e) => { e.preventDefault(); loadCodes(); });
  $('clear-btn').addEventListener('click', () => { filters.reset(); loadCodes(); });
  $('csv-btn').addEventListener('click', () => { window.location.href = '/api/codes.csv?' + filterQuery(); });

  fetch('/api/me')
    .then((r) => r.json())
    .then((d) => (d.authenticated ? showCodes() : showLogin()))
    .catch(showLogin);
})();
