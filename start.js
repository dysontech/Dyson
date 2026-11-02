/* DYSON start.js — Sign up / Sign in (email, phone + password, Google), password reset. */
(function () {
  const { h, $ } = D;
  const root = $('#authRoot');
  const q = new URLSearchParams(location.search);
  let mode = q.get('mode') === 'signup' ? 'signup' : 'signin', method = 'email';

  const say = (box, text, type = 'error') => { box.textContent = text; box.className = 'form-msg ' + type; box.hidden = !text; };

  async function boot() {
    if (!D.configured) { D.banner(); root.replaceChildren(D.empty('alert', 'Not configured', 'Add your Supabase URL and anon key to config.js.')); return; }
    D.sb.auth.onAuthStateChange((ev) => { if (ev === 'PASSWORD_RECOVERY') renderNewPassword(); });
    const { data: { session } } = await D.sb.auth.getSession();
    if (q.get('reset') === '1' && session) return renderNewPassword();
    if (session) return location.replace('app.html');
    if (q.get('expired')) D.toast('You were signed out. Please sign in again.', 'info');
    render();
  }

  function field(icon, input, extra) { return h('div', { class: 'field' }, h('div', { class: 'input-ic' }, D.ic(icon), input, extra || '')); }
  function eye(input) {
    const b = h('button', { class: 'icon-btn eye', type: 'button', 'aria-label': 'Show password', onclick: () => { const s = input.type === 'password'; input.type = s ? 'text' : 'password'; b.replaceChildren(D.ic(s ? 'eye-off' : 'eye', 'sm')); } }, D.ic('eye', 'sm'));
    return b;
  }

  function render() {
    const signup = mode === 'signup';
    const msg = h('div', { class: 'form-msg', role: 'alert', hidden: '' });
    const f = {
      name: h('input', { class: 'input', placeholder: 'Full name', autocomplete: 'name', maxlength: 50 }),
      user: h('input', { class: 'input', placeholder: 'Username', autocomplete: 'username', maxlength: 20, autocapitalize: 'off' }),
      email: h('input', { class: 'input', type: 'email', placeholder: 'Email address', autocomplete: 'email' }),
      phone: h('input', { class: 'input', type: 'tel', placeholder: 'Phone number with country code, e.g. +256…', autocomplete: 'tel' }),
      pass: h('input', { class: 'input', type: 'password', placeholder: 'Password', autocomplete: signup ? 'new-password' : 'current-password' }),
      pass2: h('input', { class: 'input', type: 'password', placeholder: 'Confirm password', autocomplete: 'new-password' }),
    };
    const terms = h('input', { type: 'checkbox' }), remember = h('input', { type: 'checkbox' }); remember.checked = localStorage.getItem('dyson-remember') !== '0';
    const submit = h('button', { class: 'btn btn-primary btn-block btn-pill', type: 'submit' }, signup ? 'Create Account' : 'Sign In', D.ic('chevron-right', 'sm'));
    const google = h('button', { class: 'btn btn-block btn-pill google', type: 'button', onclick: googleGo }, h('span', { class: 'g' }, D.ic('google')), 'Continue with Google');
    const tabs = h('div', { class: 'auth-tabs', role: 'tablist' }, [['email', 'Email'], ['phone', 'Phone'], ['google', 'Google']].map(([k, l]) => h('button', { type: 'button', role: 'tab', class: method === k ? 'on' : '', 'aria-selected': String(method === k), onclick: () => { method = k; render(); } }, l)));

    async function googleGo() {
      try { const { error } = await D.sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: new URL('start.html', location.href).href } }); if (error) throw error; }
      catch (e) { say(msg, D.err(e)); }
    }

    const body = [];
    if (method === 'google') {
      body.push(h('p', { class: 'muted center' }, signup ? 'Use your Google account to create your Dyson profile in one tap.' : 'Sign in with the Google account you used before.'), google);
    } else {
      body.push(google, h('div', { class: 'or' }, h('span', {}, 'or')));
      const form = h('form', { class: 'auth-form', novalidate: '', onsubmit: onSubmit },
        msg, signup ? field('user', f.name) : '', signup ? field('at', f.user) : '', method === 'email' ? field('mail', f.email) : field('smartphone', f.phone),
        field('lock', f.pass, eye(f.pass)), signup ? field('lock', f.pass2, eye(f.pass2)) : '',
        method === 'phone' ? h('p', { class: 'hint' }, 'Phone sign-in uses your number and a password. No SMS code is sent.') : '',
        signup ? h('label', { class: 'check terms' }, terms, h('span', {}, 'I agree to the ', h('a', { href: 'terms.html', target: '_blank' }, 'Terms'), ' & ', h('a', { href: 'privacy.html', target: '_blank' }, 'Privacy Policy'))) : h('div', { class: 'row-between' }, h('label', { class: 'check' }, remember, 'Remember me'), h('a', { href: '#', onclick: (e) => { e.preventDefault(); forgot(); } }, 'Forgot password?')),
        submit);
      body.push(form);
    }

    async function onSubmit(e) {
      e.preventDefault(); say(msg, '');
      const id = method === 'email' ? f.email.value.trim() : f.phone.value.trim();
      if (method === 'email' && !D.isEmail(id)) return say(msg, 'Enter a valid email address.');
      if (method === 'phone' && id.replace(/\D/g, '').length < 7) return say(msg, 'Enter a valid phone number with country code.');
      if (!f.pass.value) return say(msg, 'Enter your password.');
      const email = D.authEmail(id);
      D.busy(submit, true, signup ? 'Creating account…' : 'Signing in…');
      try {
        if (!signup) {
          const keep = remember.checked; localStorage.setItem('dyson-remember', keep ? '1' : '0'); D.sb = D.makeClient(keep);
          const { data, error } = await D.sb.auth.signInWithPassword({ email, password: f.pass.value }); if (error) throw error;
          D.uid = data.user.id; await D.ensureProfile(data.user); return location.replace('app.html');
        }
        const name = f.name.value.trim(), uname = f.user.value.trim().toLowerCase().replace(/^@/, '');
        if (name.length < 2) throw new Error('Enter your full name.');
        if (!/^[a-z0-9_]{3,20}$/.test(uname)) throw new Error('Username: 3–20 letters, numbers or underscores.');
        if (f.pass.value.length < 6) throw new Error('Choose a password of at least 6 characters.');
        if (f.pass.value !== f.pass2.value) throw new Error('Passwords do not match.');
        if (!terms.checked) throw new Error('Please accept the Terms and Privacy Policy.');
        const { data: free } = await D.sb.rpc('username_available', { uname }); if (free === false) throw new Error('That username is taken. Try another.');
        localStorage.setItem('dyson-remember', '1'); D.sb = D.makeClient(true);
        const { data, error } = await D.sb.auth.signUp({ email, password: f.pass.value, options: { data: { full_name: name, username: uname }, emailRedirectTo: new URL('start.html', location.href).href } });
        if (error) throw error;
        if (!data.session) { render(); const m2 = $('.form-msg', root); if (m2) say(m2, 'Account created! Check your inbox to confirm your email, then sign in.', 'success'); return; }
        D.uid = data.user.id;
        await D.sb.from('profiles').upsert({ id: data.user.id, full_name: name, username: uname, onboarded: true });
        if (method === 'phone') await D.sb.from('user_private').upsert({ user_id: data.user.id, phone: id.replace(/\D/g, '') ? id.replace(/\s/g, '') : id }).then(() => {}, () => {});
        location.replace('app.html');
      } catch (er) { say(msg, D.err(er)); D.busy(submit, false); }
    }

    root.replaceChildren(
      h('a', { class: 'auth-back', href: 'index.html', 'aria-label': 'Back' }, D.ic('back')),
      h('div', { class: 'auth-head' }, h('img', { src: 'icon.png', alt: '', width: 56, height: 56 }), h('h1', {}, signup ? 'Create Account' : 'Welcome back'), h('p', { class: 'muted' }, signup ? 'Join DYSON today' : 'Sign in to continue')),
      tabs, ...body,
      h('p', { class: 'auth-switch' }, signup ? 'Already have an account? ' : 'New to Dyson? ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); mode = signup ? 'signin' : 'signup'; render(); } }, signup ? 'Sign In' : 'Create account')));
  }

  function forgot() {
    const em = h('input', { class: 'input', type: 'email', placeholder: 'Your account email' }), msg = h('div', { class: 'form-msg', hidden: '' });
    const go = h('button', { class: 'btn btn-primary', type: 'button' }, 'Send reset link');
    const mo = D.modal({ title: 'Reset password', body: [msg, h('p', { class: 'muted' }, 'We will email you a link to choose a new password.'), em], actions: [h('button', { class: 'btn', type: 'button', onclick: () => mo.close() }, 'Cancel'), go] });
    go.onclick = async () => {
      if (!D.isEmail(em.value)) return say(msg, 'Enter a valid email.'); D.busy(go, true, 'Sending…');
      const { error } = await D.sb.auth.resetPasswordForEmail(em.value.trim(), { redirectTo: new URL('start.html?reset=1', location.href).href });
      D.busy(go, false); if (error) return say(msg, D.err(error)); say(msg, 'If that email exists, a reset link is on its way.', 'success');
    };
  }

  function renderNewPassword() {
    const msg = h('div', { class: 'form-msg', hidden: '' }), a = h('input', { class: 'input', type: 'password', placeholder: 'New password', autocomplete: 'new-password' }), b = h('input', { class: 'input', type: 'password', placeholder: 'Repeat password', autocomplete: 'new-password' });
    const go = h('button', { class: 'btn btn-primary btn-block btn-pill', type: 'submit' }, 'Save new password');
    root.replaceChildren(h('div', { class: 'auth-head' }, h('img', { src: 'icon.png', alt: '', width: 56, height: 56 }), h('h1', {}, 'Choose a new password')),
      h('form', { class: 'auth-form', onsubmit: async (e) => { e.preventDefault(); if (a.value.length < 6) return say(msg, 'Use at least 6 characters.'); if (a.value !== b.value) return say(msg, 'Passwords do not match.'); D.busy(go, true, 'Saving…'); const { error } = await D.sb.auth.updateUser({ password: a.value }); if (error) { D.busy(go, false); return say(msg, D.err(error)); } location.replace('app.html'); } }, msg, field('lock', a), field('lock', b), go));
  }
  boot();
})();
