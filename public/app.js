(function () {
  const form = document.getElementById('code-form');
  const input = document.getElementById('code');
  const btn = document.getElementById('submit-btn');
  const msg = document.getElementById('message');

  function show(text, type) {
    msg.textContent = text;
    msg.className = 'message ' + (type || '');
  }

  // Păstrăm doar cifre, maxim 6 (inclusiv la paste)
  input.addEventListener('input', () => {
    const clean = input.value.replace(/\D/g, '').slice(0, 6);
    if (clean !== input.value) input.value = clean;
    input.classList.remove('invalid');
    if (msg.classList.contains('error')) show('');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = input.value.trim();

    if (!/^\d{6}$/.test(code)) {
      input.classList.add('invalid');
      show('Codul trebuie să conțină exact 6 cifre.', 'error');
      input.focus();
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Se trimite…';
    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, website: document.getElementById('website').value }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        form.reset();
        show('Codul a fost trimis cu succes.', 'success');
      } else {
        show(data.error || 'A apărut o eroare. Încearcă din nou.', 'error');
      }
    } catch {
      show('Nu s-a putut contacta serverul. Verifică conexiunea și încearcă din nou.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Trimite';
    }
  });
})();
