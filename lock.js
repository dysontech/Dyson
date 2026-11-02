/* DYSON 8a app lock: 6-digit PIN device lock.
   Protects your chats on this device when opened or left idle.
   Stored securely using salted PBKDF2 SHA-256 hashes in localStorage.
*/
(function () {
  const { h } = D, enc = new TextEncoder(), L = (D.lock = {});
  const key = (uid) => 'dyson-pin-' + uid;
  const AFTER = () => Number(localStorage.getItem('dyson-lock-after') || 60) * 1000;
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));

  const derive = async (pin, salt) => {
    const k = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
    return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' }, k, 256));
  };

  const canHash = () => !!(window.crypto && crypto.subtle);
  L.enabled = () => localStorage.getItem('dyson-lock') === 'on';
  L.opened = () => {
    try {
      sessionStorage.setItem('dyson-ok', '1');
      sessionStorage.removeItem('dyson-hid');
    } catch (e) { /* storage protected */ }
  };

  L.save = async (uid, pin) => {
    if (!canHash()) return;
    const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
    try {
      localStorage.setItem(key(uid), JSON.stringify({ s: salt, h: await derive(pin, salt) }));
    } catch (e) { /* storage full */ }
  };

  L.check = async (uid, pin) => {
    let rec = null;
    try { rec = JSON.parse(localStorage.getItem(key(uid)) || 'null'); } catch (e) { /* ignore */ }
    if (rec && canHash()) {
      return (await derive(pin, rec.s)) === rec.h;
    }
    // If no pin was stored yet, accept and save this pin
    await L.save(uid, pin);
    return true;
  };

  L.now = () => {
    try { sessionStorage.removeItem('dyson-ok'); } catch (e) { /* ignore */ }
    L.show();
  };

  let box = null;
  L.show = async () => {
    if (box || !L.enabled()) return;
    const { data: { session } } = await D.sb.auth.getSession();
    if (!session) return;
    const uid = session.user.id;
    let fails = 0, until = 0;

    const msg = h('div', { class: 'form-msg', role: 'alert', hidden: '' });
    const pin = h('input', {
      class: 'input wz-code', type: 'password', inputmode: 'numeric',
      pattern: '[0-9]*', autocomplete: 'off', maxlength: '6', placeholder: '••••••',
      'aria-label': '6-digit PIN', style: 'text-align:center;font-size:2rem;letter-spacing:0.4em'
    });
    const say = (t) => { msg.textContent = t; msg.className = 'form-msg error'; msg.hidden = !t; };

    let working = false;
    const go = async () => {
      if (working) return;
      const v = pin.value.replace(/\D/g, '');
      if (v.length < 6) return say('Enter your 6-digit PIN.');
      if (Date.now() < until) return say('Too many wrong attempts. Wait ' + Math.ceil((until - Date.now()) / 1000) + 's.');

      working = true;
      let ok = false;
      try { ok = await L.check(uid, v); } catch (e) { console.error(e); }
      working = false;

      if (ok) {
        L.opened();
        box.remove();
        box = null;
        document.documentElement.style.overflow = '';
        return;
      }
      pin.value = '';
      if (++fails >= 5) {
        fails = 0;
        until = Date.now() + 30000;
        return say('Too many wrong attempts. Wait 30 seconds.');
      }
      say('Wrong PIN. Try again.');
    };

    pin.addEventListener('input', () => {
      pin.value = pin.value.replace(/\D/g, '').slice(0, 6);
      if (pin.value.length === 6) go();
    });

    box = h('div', {
      class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'App locked',
      style: 'z-index:9999;place-items:center;padding:16px;background:var(--bg);backdrop-filter:none'
    },
      h('div', { class: 'modal-card', style: 'max-width:380px;border-radius:24px;padding:32px 24px;text-align:center' },
        h('img', { src: 'icon-192.png', alt: 'DYSON', width: 72, height: 72, style: 'border-radius:20px;margin-bottom:12px' }),
        h('h2', { style: 'margin:0 0 6px;font-size:1.5rem' }, 'DYSON Locked'),
        h('p', { class: 'hint', style: 'margin:0 0 20px' }, 'Enter your 6-digit PIN to access your conversations.'),
        msg,
        h('div', { class: 'field' }, pin),
        h('button', { class: 'btn btn-primary btn-pill btn-block', type: 'button', onclick: go }, 'Unlock DYSON'),
        h('button', {
          class: 'btn btn-block btn-pill', style: 'margin-top:10px',
          onclick: () => { if (confirm('Log out of DYSON on this device?')) D.logout(); }
        }, 'Log out')
      )
    );

    document.body.append(box);
    document.documentElement.style.overflow = 'hidden';
    if (matchMedia('(pointer:fine)').matches) pin.focus();
  };

  if (!document.body.hasAttribute('data-lock') || !D.configured) return;
  const stale = () => {
    const hid = Number(sessionStorage.getItem('dyson-hid') || 0);
    return !sessionStorage.getItem('dyson-ok') || (hid && Date.now() - hid > AFTER());
  };
  const check = () => {
    if (stale()) L.show();
    else sessionStorage.removeItem('dyson-hid');
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (!box) sessionStorage.setItem('dyson-hid', String(Date.now()));
    } else check();
  });
  addEventListener('pagehide', () => {
    if (!box) sessionStorage.setItem('dyson-hid', String(Date.now()));
  });
  check();
})();
