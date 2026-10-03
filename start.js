/* DYSON start: step-by-step sign-up / sign-in with an email code (Supabase Auth email OTP).
   1 Agree and Continue -> 2 Country + email (confirm it) -> 3 Enter the code -> 4 Name, photo, privacy -> 5 Allow contacts, open DYSON */
(function () {
  const { h, $ } = D, root = $('#wz'), OTP_LEN = 6; // OTP_LEN must match Supabase > Authentication > Email > "Email OTP length"
  const S = { step: 1, iso: '', dial: '', email: '', first: '', surname: '', photo: null, uid: null, ls: 'contacts', online: 'everyone', byEmail: true, byUser: true, timer: 0 };
  const C = window.DYSON_COUNTRIES || [['UG', 'Uganda', '+256']];
  const NAMES = ['Welcome', 'Your email', 'Verify', 'Profile', 'Finish'];
  if (!D.configured) { D.banner(); return; }
  const url = (f) => new URL(f, location.href).href, valid = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  const guess = () => { const r = ((navigator.language || '').split('-')[1] || '').toUpperCase(); return localStorage.getItem('dyson-country') || (C.some((c) => c[0] === r) ? r : 'UG'); };
  const say = (box, t, type = 'error') => { box.textContent = t; box.className = 'form-msg ' + type; box.hidden = !t; };
  const busy = (b, on, label) => { b.dataset.l = b.dataset.l || b.textContent; b.disabled = on; b.replaceChildren(...(on ? [h('span', { class: 'spinner sm' }), ' ' + label] : [b.dataset.l])); };
  const friendly = (e) => { const t = (e && e.message || '').toLowerCase(); if (/rate|seconds|too many/.test(t)) return 'Too many attempts. Wait a minute, then try again.'; if (/signups not allowed|not allowed/.test(t)) return 'New sign-ups are switched off for this project. Turn on "Allow new users to sign up" in Supabase Auth.'; if (/expired|invalid|token/.test(t)) return 'That code is wrong or has expired. Check it, or tap Resend.'; return D.err(e); };

  const bar = () => h('ol', { class: 'wz-steps', 'aria-label': 'Progress' }, ...NAMES.map((n, i) => h('li', { class: i + 1 < S.step ? 'done' : i + 1 === S.step ? 'on' : '', 'aria-current': i + 1 === S.step ? 'step' : null }, h('i', {}, i + 1 < S.step ? '✓' : String(i + 1)), h('span', {}, n))));
  const view = (title, sub, ...kids) => { root.replaceChildren(h('a', { href: 'index.html', class: 'link wz-home' }, '← Home'), bar(), h('h1', { class: 'wz-h' }, title), sub ? h('p', { class: 'wz-sub' }, sub) : '', ...kids); const f = root.querySelector('input,select,button.btn-primary'); if (f && matchMedia('(pointer:fine)').matches) f.focus(); };
  const go = (n) => { S.step = n; ({ 1: step1, 2: step2, 3: step3, 4: step4, 5: step5 })[n](); window.scrollTo(0, 0); };

  // ---- Step 1: Agree and Continue
  function step1() {
    view('Welcome to DYSON', 'Fast, private messaging with your friends and family.',
      h('div', { class: 'wz-art' }, h('img', { src: 'icon-192.png', alt: '', width: 96, height: 96 })),
      h('p', { class: 'hint', style: 'text-align:center' }, 'Tap Agree and Continue to accept our ', h('a', { href: 'terms.html', target: '_blank', rel: 'noopener' }, 'Terms'), ' and ', h('a', { href: 'privacy.html', target: '_blank', rel: 'noopener' }, 'Privacy Policy'), '.'),
      h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: () => { try { localStorage.setItem('dyson-terms', new Date().toISOString()); } catch (e) { /* private mode */ } go(2); } }, 'Agree and Continue'),
      h('p', { class: 'hint', style: 'text-align:center;margin-top:14px' }, 'Prefer a password? ', h('a', { href: 'login.html' }, 'Sign in with a password')));
  }

  // ---- Step 2: country + email, then confirm
  function step2() {
    S.iso = S.iso || guess(); const msg = h('div', { class: 'form-msg', role: 'alert', hidden: '' });
    const sel = h('select', { class: 'input', id: 'wz-country', 'aria-label': 'Country' }, ...C.map(([i, n, d]) => { const o = h('option', { value: i }, `${n} (${d})`); if (i === S.iso) o.selected = true; return o; }));
    const em = h('input', { class: 'input', id: 'wz-email', type: 'email', inputmode: 'email', autocomplete: 'email', autocapitalize: 'none', spellcheck: 'false', placeholder: 'name@gmail.com', value: S.email });
    const next = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Next');
    const f = h('form', { novalidate: '', onsubmit: (e) => { e.preventDefault(); say(msg, ''); const v = em.value.trim().toLowerCase(); if (!valid(v)) return say(msg, 'Enter your email address correctly, for example name@gmail.com.'); S.email = v; S.iso = sel.value; S.dial = (C.find((c) => c[0] === S.iso) || [])[2] || '+256'; try { localStorage.setItem('dyson-country', S.iso); localStorage.setItem('dyson-dial', S.dial); } catch (x) { /* private mode */ } confirmEmail(next, msg); } },
      msg, h('div', { class: 'field' }, h('label', { for: 'wz-country' }, 'Country'), sel), h('div', { class: 'field' }, h('label', { for: 'wz-email' }, 'Your Gmail address'), em), next,
      h('button', { class: 'btn btn-block', type: 'button', style: 'margin-top:8px', onclick: () => go(1) }, 'Back'));
    view('Enter your email', 'Pick your country and type your Gmail address. We will send you a verification code.', f);
  }
  function confirmEmail(next, msg) {
    const m = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Confirm email', style: 'place-items:center' }, h('div', { class: 'modal-card', style: 'max-width:380px' }, h('div', { class: 'body', style: 'text-align:center;padding:24px 20px' },
      h('p', { class: 'hint', style: 'margin:0 0 6px' }, 'Is this email correct?'), h('p', { style: 'font-size:1.15rem;font-weight:700;word-break:break-all;margin:0 0 6px' }, S.email), h('p', { class: 'hint' }, 'We will send a verification code to this address.'),
      h('div', { style: 'display:flex;gap:8px;margin-top:14px' }, h('button', { class: 'btn', style: 'flex:1', type: 'button', onclick: () => m.remove() }, 'Edit'), h('button', { class: 'btn btn-primary', style: 'flex:1', type: 'button', id: 'wz-ok', onclick: async (e) => { const b = e.currentTarget; busy(b, true, 'Sending…'); const ok = await sendCode(msg); m.remove(); if (ok) go(3); } }, 'OK')))));
    document.body.append(m); $('#wz-ok').focus();
  }
  async function sendCode(msg) {
    try { localStorage.setItem('dyson-remember', '1'); D.sb = D.makeClient(true); } catch (e) { /* keep default client */ }
    const { error } = await D.sb.auth.signInWithOtp({ email: S.email, options: { shouldCreateUser: true, emailRedirectTo: url('start.html') } });
    if (error) { say(msg, friendly(error)); return false; }
    S.timer = Date.now() + 60000; return true;
  }

  // ---- Step 3: the code
  function step3() {
    const msg = h('div', { class: 'form-msg', role: 'alert', hidden: '' }), code = h('input', { class: 'input wz-code', id: 'wz-code', inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'one-time-code', maxlength: String(OTP_LEN + 2), placeholder: '•'.repeat(OTP_LEN), 'aria-label': 'Verification code' });
    const ver = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Verify'), resend = h('button', { class: 'btn btn-block', type: 'button', style: 'margin-top:8px' }, 'Resend code');
    let tick; const upd = () => { const s = Math.max(0, Math.ceil((S.timer - Date.now()) / 1000)); resend.disabled = s > 0; resend.textContent = s > 0 ? `Resend code in ${s}s` : 'Resend code'; if (!s) clearInterval(tick); };
    tick = setInterval(() => { if (!document.body.contains(resend)) return clearInterval(tick); upd(); }, 1000); upd();
    let verifying = false;
    const verify = async () => {
      if (verifying) return; const t = code.value.replace(/\D/g, ''); say(msg, ''); if (t.length < OTP_LEN) return say(msg, `Enter the ${OTP_LEN}-digit code from your email.`);
      verifying = true; busy(ver, true, 'Verifying…');
      const { data, error } = await D.sb.auth.verifyOtp({ email: S.email, token: t, type: 'email' });
      verifying = false; busy(ver, false);
      if (error || !data.session) { code.select(); return say(msg, friendly(error || { message: 'invalid' })); }
      S.uid = data.session.user.id; await afterLogin();
    };
    code.addEventListener('input', () => { code.value = code.value.replace(/\D/g, '').slice(0, OTP_LEN + 2); if (code.value.length === OTP_LEN) verify(); }); // auto-verify when the code is complete / auto-filled
    resend.onclick = async () => { resend.disabled = true; say(msg, ''); if (await sendCode(msg)) { say(msg, 'A new code was sent.', 'success'); tick = setInterval(upd, 1000); upd(); } else upd(); };
    view('Verify your email', null, h('p', { class: 'wz-sub' }, 'We sent a verification code to ', h('b', {}, S.email), '. Enter it below. On some phones it is filled in for you.'),
      h('form', { novalidate: '', onsubmit: (e) => { e.preventDefault(); verify(); } }, msg, h('div', { class: 'field' }, h('label', { for: 'wz-code' }, 'Verification code'), code), ver, resend,
        h('button', { class: 'btn btn-block', type: 'button', style: 'margin-top:8px', onclick: () => { clearInterval(tick); go(2); } }, 'Wrong email? Edit')),
      h('p', { class: 'hint' }, 'Nothing yet? Check Spam. If the email has a link instead of a code, open it on this phone and you will be signed in.'));
  }
  async function afterLogin() {
    const { data, error } = await D.sb.rpc('ensure_my_account');
    if (error) { D.toast('Signed in, but account setup needs the V8 SQL (supabase_additions_v8_onboarding.sql).', 'error', 7000); return go(4); }
    if (data && data.onboarded) return location.replace('app.html'); // returning user: straight in
    S.first = (data && data.full_name && !/^[a-z0-9_.-]+$/i.test(data.full_name) ? data.full_name.split(' ')[0] : '') || ''; go(4);
  }

  // ---- Step 4: name, photo, privacy
  function step4() {
    const msg = h('div', { class: 'form-msg', role: 'alert', hidden: '' }), box = h('span'), pic = () => box.replaceChildren(D.avatar({ full_name: (S.first || '?'), avatar_url: S.photo ? URL.createObjectURL(S.photo) : null }, 'lg')); pic();
    const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', class: 'sr', id: 'wz-photo', 'aria-label': 'Choose profile photo' });
    file.onchange = async () => { const f = file.files[0], e = D.checkImage(f); file.value = ''; if (e) return say(msg, e); if (!f) return; const c = await D.crop(f); if (c) { S.photo = c; pic(); } };
    const fn = h('input', { class: 'input', id: 'wz-fn', autocomplete: 'given-name', maxlength: '40', placeholder: 'First name', value: S.first }), sn = h('input', { class: 'input', id: 'wz-sn', autocomplete: 'family-name', maxlength: '40', placeholder: 'Surname', value: S.surname });
    const who = (id, val) => h('select', { class: 'input', id, style: 'width:auto' }, ...[['everyone', 'Everyone'], ['contacts', 'My contacts'], ['nobody', 'Nobody']].map(([v, n]) => { const o = h('option', { value: v }, n); if (v === val) o.selected = true; return o; }));
    const ls = who('wz-ls', S.ls), on = who('wz-on', S.online);
    const tg = (id, on_) => { const i = h('input', { type: 'checkbox', id, role: 'switch' }); i.checked = on_; return i; };
    const be = tg('wz-be', S.byEmail), bu = tg('wz-bu', S.byUser);
    const row = (title, sub, ctl) => h('div', { class: 'set-row' }, h('div', {}, h('b', {}, title), h('small', {}, sub)), ctl);
    const fin = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Finish setup');
    const f = h('form', { novalidate: '', onsubmit: async (e) => {
      e.preventDefault(); say(msg, ''); S.first = fn.value.trim(); S.surname = sn.value.trim(); S.ls = ls.value; S.online = on.value; S.byEmail = be.checked; S.byUser = bu.checked;
      if (!S.first) return say(msg, 'Enter your first name.');
      busy(fin, true, 'Saving…');
      try {
        if (S.photo) { try { const u = await D.uploadAvatar(S.photo, S.uid); await D.sb.from('profiles').update({ avatar_url: u }).eq('id', S.uid); } catch (x) { D.toast('Your photo could not be uploaded. You can add it later in Profile.', 'error', 5000); } }
        const { error } = await D.sb.rpc('complete_onboarding', { p_first: S.first, p_surname: S.surname, p_country: S.iso || guess(), p_dial: S.dial || localStorage.getItem('dyson-dial') || '+256', p_last_seen: S.ls, p_online: S.online, p_discover_email: S.byEmail, p_discover_phone: false, p_discover_username: S.byUser, p_terms: true });
        if (error) throw error; go(5);
      } catch (x) { say(msg, /function|schema cache|does not exist/i.test(x.message || '') ? 'Setup is missing on the server. Run supabase_additions_v8_onboarding.sql once in Supabase.' : D.err(x)); }
      finally { busy(fin, false); }
    } },
      msg, h('div', { class: 'avatar-pick' }, h('label', { class: 'avatar-edit', for: 'wz-photo', title: 'Add a profile photo' }, box, h('span', { class: 'cam', 'aria-hidden': 'true' }, D.ic('camera', 'sm'))), h('div', { style: 'flex:1' }, h('b', { style: 'font-size:14px' }, 'Profile photo (optional)'), h('small', { class: 'hint', style: 'display:block' }, 'Tap the photo, then crop it to a circle.')), file),
      h('div', { class: 'field' }, h('label', { for: 'wz-fn' }, 'First name'), fn), h('div', { class: 'field' }, h('label', { for: 'wz-sn' }, 'Surname (optional)'), sn),
      h('h2', { class: 'wz-h2' }, 'Privacy'), row('Last seen', 'Who can see when you were last active', ls), row('Online status', 'Who can see when you are online', on),
      row('Find me by email', 'Lets friends add you with your Gmail address', be), row('Find me by username', 'Lets people search for your @username', bu),
      h('p', { class: 'hint' }, 'You can change all of this later in Settings > Privacy.'), fin);
    fn.addEventListener('input', () => { S.first = fn.value.trim(); if (!S.photo) pic(); });
    view('Set up your profile', 'Add your name and choose your privacy settings.', f);
  }

  // ---- Step 5: allow contacts, open DYSON
  const phoneOf = (p) => { let t = String(p || '').replace(/[^\d+]/g, ''); if (!t) return null; if (t.startsWith('00')) t = '+' + t.slice(2); if (!t.startsWith('+')) t = (S.dial || localStorage.getItem('dyson-dial') || '+256') + t.replace(/^0+/, ''); return /^\+[1-9]\d{7,14}$/.test(t) ? t : null; };
  function step5() {
    const msg = h('div', { class: 'form-msg', role: 'status', hidden: '' }), supported = 'contacts' in navigator && 'ContactsManager' in window;
    const perm = (s) => D.sb.rpc('set_contacts_permission', { p_state: s });
    const allow = h('button', { class: 'btn btn-block', type: 'button' }, D.ic('users', 'sm'), ' Allow access to my contacts');
    allow.onclick = async () => {
      try {
        const sel = await navigator.contacts.select(['name', 'tel', 'email'], { multiple: true }); if (!sel.length) return;
        const items = sel.map((c) => ({ name: (c.name && c.name[0]) || (c.email && c.email[0]) || (c.tel && c.tel[0]) || 'Contact', phone: phoneOf(c.tel && c.tel[0]), email: (c.email && c.email[0] || '').toLowerCase() || null })).filter((x) => x.phone || x.email).slice(0, 500);
        busy(allow, true, 'Checking contacts…'); const { data, error } = await D.sb.rpc('add_contacts_bulk', { items }); busy(allow, false);
        if (error) return say(msg, D.err(error)); perm('granted'); say(msg, `${data || 0} of your ${items.length} contacts are already on DYSON and were added. Others can be invited from New chat.`, 'success');
      } catch (e) { if (e && e.name !== 'AbortError') say(msg, 'Could not read contacts: ' + (e.message || e), 'error'); }
    };
    if (!supported) perm('unsupported');
    view(`You're all set, ${S.first || 'welcome'}!`, 'Your account is ready. Let DYSON find friends who are already here.',
      msg, supported ? allow : h('p', { class: 'hint' }, 'This browser cannot read your phone contacts directly. In DYSON, tap New contact to add people by name and email, or use Import to bring in a Google/phone contacts file.'),
      h('button', { class: 'btn btn-primary btn-block', type: 'button', style: 'margin-top:10px', onclick: () => { if (supported) perm('skipped'); location.replace('app.html?firstrun=1'); } }, 'Open DYSON'),
      h('p', { class: 'hint', style: 'text-align:center;margin-top:10px' }, 'Next: check your contacts and start a new chat with the + button.'));
  }

  // ---- boot: continue where you left off (signed in but not finished) or start at step 1
  (async () => {
    root.replaceChildren(h('div', { class: 'loading' }, h('span', { class: 'spinner', role: 'status', 'aria-label': 'Loading' })));
    try { const { data } = await D.sb.auth.getSession(); if (data.session) { S.uid = data.session.user.id; S.email = data.session.user.email || ''; return afterLogin(); } } catch (e) { /* not signed in */ }
    go(1);
  })();
})();
