(function () {
  const form = document.getElementById('code-form');
  const digits = Array.from(document.querySelectorAll('.digit'));
  const btn = document.getElementById('submit-btn');
  const msg = document.getElementById('message');

  function show(text, type) {
    msg.textContent = text;
    msg.className = 'message ' + (type || '');
  }

  function clearError() {
    digits.forEach((d) => d.classList.remove('invalid'));
    if (msg.classList.contains('error')) show('');
  }

  function code() {
    return digits.map((d) => d.value).join('');
  }

  digits.forEach((input, i) => {
    // La tastare: păstrează o singură cifră și treci la caseta următoare
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(0, 1);
      clearError();
      if (input.value && i < digits.length - 1) digits[i + 1].focus();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && i > 0) {
        digits[i - 1].focus();
        digits[i - 1].value = '';
        e.preventDefault();
      } else if (e.key === 'ArrowLeft' && i > 0) {
        digits[i - 1].focus();
        e.preventDefault();
      } else if (e.key === 'ArrowRight' && i < digits.length - 1) {
        digits[i + 1].focus();
        e.preventDefault();
      }
    });

    // Lipire (paste): distribuie cifrele în casete, oriunde s-ar lipi
    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const nums = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, digits.length);
      if (!nums) return;
      nums.split('').forEach((n, k) => { if (digits[k]) digits[k].value = n; });
      clearError();
      digits[Math.min(nums.length, digits.length - 1)].focus();
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = code();

    if (!/^\d{6}$/.test(value)) {
      digits.forEach((d) => { if (!d.value) d.classList.add('invalid'); });
      show('Completează toate cele 6 cifre.', 'error');
      (digits.find((d) => !d.value) || digits[0]).focus();
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Se trimite…';
    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: value, website: document.getElementById('website').value }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        digits.forEach((d) => (d.value = ''));
        digits[0].focus();
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
