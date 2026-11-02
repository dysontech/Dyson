/* DYSON core: Supabase client, DOM helpers, preferences + theme, dialogs, sheets, menus, media URLs, i18n. */
(function () {
  const cfg = window.DYSON_CONFIG || {};
  const D = (window.D = {});
  D.cfg = cfg;
  D.version = cfg.VERSION || '9.0';
  D.build = '2026.11.01';
  D.configured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && !/YOUR_/.test(cfg.SUPABASE_URL + cfg.SUPABASE_ANON_KEY));
  D.$ = (s, r = document) => r.querySelector(s);
  D.$$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ---------- safe DOM builder: text always goes through text nodes ---------- */
  D.h = (tag, attrs, ...kids) => {
    attrs = attrs || {};
    const e = document.createElement(tag);
    for (const k in attrs) {
      const v = attrs[k];
      if (v === false || v == null) continue;
      if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'class') e.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k === 'html') throw new Error('html attribute is not allowed');
      else if (k === 'value') e.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'selected') e.setAttribute(k, '');
      else e.setAttribute(k, v === true ? '' : v);
    }
    kids.flat(Infinity).forEach((x) => { if (x === false || x == null) return; e.append(x.nodeType ? x : document.createTextNode(String(x))); });
    return e;
  };
  const h = D.h;

  D.ic = (n, c = '') => {
    const NS = 'http://www.w3.org/2000/svg', v = document.createElementNS(NS, 'svg'), u = document.createElementNS(NS, 'use');
    v.setAttribute('class', 'ic ' + c); v.setAttribute('aria-hidden', 'true');
    u.setAttribute('href', 'icons.svg#i-' + n); v.append(u);
    return v;
  };

  D.esc = (s) => String(s == null ? '' : s);
  D.debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  D.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  D.uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'x' + Date.now() + Math.random().toString(16).slice(2));
  D.bytes = (n) => { n = Number(n) || 0; const u = ['B', 'KB', 'MB', 'GB']; let i = 0; while (n >= 1024 && i < 3) { n /= 1024; i++; } return (i ? n.toFixed(n < 10 ? 1 : 0) : n) + ' ' + u[i]; };
  D.compact = (n) => { n = Number(n) || 0; return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace('.0', '') + 'K' : String(n); };
  D.copy = async (text, msg = 'Copied') => {
    try { await navigator.clipboard.writeText(text); } catch (e) {
      const t = h('textarea', { style: { position: 'fixed', opacity: 0 } }); t.value = text; document.body.append(t); t.select(); try { document.execCommand('copy'); } catch (x) { /* ignore */ } t.remove();
    }
    D.toast(msg, 'success', 1600);
  };
  D.download = (name, blob) => { const a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };

  /* ---------- i18n (compact dictionary in i18n.js) ---------- */
  D.t = (s) => { const L = (D.prefs && D.prefs.data.lang) || 'en'; const d = window.DYSON_I18N && window.DYSON_I18N[L]; return (d && d[s]) || s; };

  /* ---------- preferences: local first, synced to Supabase user_preferences ---------- */
  const PREF_KEY = 'dyson-prefs';
  const DEFAULTS = {
    theme: 'dark', accent: 'blue', fontSize: 'm', wall: 'aurora', lang: 'en',
    enter: true, notify: true, sound: true, previews: true, nMsg: true, nCall: true, nSocial: true,
    dlPhotos: true, dlVideos: false, dataSaver: false, smartReplies: true,
    ringtone: true, callVideo: true, mirror: true, echo: true, noise: true, facing: 'user', micId: '', camId: '',
    aiOn: true, aiLang: 'en', aiHistory: true, readReceipts: true,
  };
  let saveT;
  D.prefs = {
    data: Object.assign({}, DEFAULTS, (() => { try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch (e) { return {}; } })()),
    get(k) { return this.data[k]; },
    set(k, v) {
      this.data[k] = v;
      try { localStorage.setItem(PREF_KEY, JSON.stringify(this.data)); } catch (e) { /* storage blocked */ }
      if (['theme', 'accent', 'fontSize', 'wall', 'lang'].includes(k)) D.applyTheme();
      clearTimeout(saveT);
      saveT = setTimeout(D.pushPrefs, 700);
    },
  };
  D.pushPrefs = async () => {
    if (!D.uid || !D.sb) return;
    const p = D.prefs.data;
    const { error } = await D.sb.from('user_preferences').upsert({ user_id: D.uid, theme: p.theme, extra: p, updated_at: new Date().toISOString() });
    if (error) console.warn('Preference sync:', error.message);
  };
  D.pullPrefs = async (uid) => {
    try {
      const { data } = await D.sb.from('user_preferences').select('theme,extra').eq('user_id', uid).maybeSingle();
      if (data && data.extra && Object.keys(data.extra).length) {
        Object.assign(D.prefs.data, data.extra);
        localStorage.setItem(PREF_KEY, JSON.stringify(D.prefs.data));
      }
      D.applyTheme();
    } catch (e) { console.warn(e); }
  };

  const mq = matchMedia('(prefers-color-scheme: dark)');
  D.applyTheme = () => {
    const p = D.prefs.data, r = document.documentElement;
    let t = p.theme === 'auto' ? (mq.matches ? 'dark' : 'light') : p.theme;
    if (t !== 'light') t = 'dark';
    r.dataset.theme = t; r.dataset.accent = p.accent; r.dataset.font = p.fontSize; r.dataset.wall = p.wall;
    r.lang = p.lang || 'en';
    const m = document.querySelector('meta[name=theme-color]');
    if (m) m.content = t === 'dark' ? '#050b1f' : '#eef3ff';
    if (D.emit) D.emit('theme');
  };
  D.applyTheme();
  mq.addEventListener('change', D.applyTheme);
  D.toggleTheme = () => D.prefs.set('theme', document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');

  /* ---------- Supabase client ---------- */
  D.makeClient = (remember) => window.supabase.createClient(cfg.SUPABASE_URL || 'https://placeholder.supabase.co', cfg.SUPABASE_ANON_KEY || 'placeholder', {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: remember ? localStorage : sessionStorage, flowType: 'pkce' },
    realtime: { params: { eventsPerSecond: 20 } },
  });
  D.sb = D.makeClient(localStorage.getItem('dyson-remember') !== '0');

  D.banner = () => document.body.append(h('div', { class: 'cfg-banner', role: 'alert' }, 'DYSON needs configuration. Add your Supabase URL and anon key to config.js.'));

  /* ---------- toasts ---------- */
  D.toast = (msg, type = 'info', ms = 3800, onclick) => {
    let box = document.getElementById('toasts');
    if (!box) { box = h('div', { id: 'toasts', 'aria-live': 'polite' }); document.body.append(box); }
    const t = h('div', { class: 'toast ' + type, role: type === 'error' ? 'alert' : 'status' }, msg);
    if (onclick) { t.style.cursor = 'pointer'; t.addEventListener('click', () => { onclick(); t.remove(); }); }
    box.append(t);
    setTimeout(() => t.remove(), ms);
  };

  D.err = (e) => {
    console.error(e);
    const m = ((e && e.message) || '').toLowerCase();
    if (!navigator.onLine || m.includes('failed to fetch') || m.includes('network')) return 'Network problem. Check your internet connection.';
    if (m.includes('invalid login')) return 'Incorrect email or password.';
    if (m.includes('already registered') || m.includes('already exists')) return 'That email is already registered. Try signing in.';
    if (m.includes('email not confirmed')) return 'Please confirm your email first (check your inbox).';
    if (m.includes('rate') || m.includes('too many') || m.includes('security purposes')) return 'Too many attempts. Wait a minute and try again.';
    if (m.includes('weak password') || m.includes('should be at least')) return 'Choose a password of at least 6 characters.';
    if (m.includes('provider is not enabled') || m.includes('unsupported provider')) return 'Google sign-in is not enabled in Supabase yet.';
    if (m.includes('contacts')) return e.message;
    if (m.includes('jwt') || m.includes('expired')) return 'Your session expired. Please sign in again.';
    if (e && (e.code === '42501' || m.includes('row-level security'))) return 'Not allowed by security policy.';
    if (e && e.code === '23505') return 'That value is already taken.';
    if (e && (e.code === '42P01' || m.includes('does not exist') || m.includes('schema cache'))) return 'Database not up to date. Run supabase_setup_dyson9.sql in Supabase.';
    return (e && e.message) || 'Something went wrong. Please try again.';
  };

  /* ---------- auth helpers ---------- */
  D.isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
  D.authEmail = (v) => { const s = String(v || '').trim(); return s.includes('@') ? s.toLowerCase() : 'p' + s.replace(/\D/g, '') + '@' + (cfg.AUTH_DOMAIN || 'gmail.com'); };

  D.ensureProfile = async (user) => {
    const { data: existing } = await D.sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (existing) return existing;
    const meta = user.user_metadata || {}, base = (user.email || 'user').split('@')[0];
    let username = (meta.username || meta.user_name || base).toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
    if (username.length < 3) username += Math.floor(Math.random() * 899 + 100);
    const row = { id: user.id, full_name: meta.full_name || meta.name || base, username, avatar_url: meta.avatar_url || meta.picture || null, onboarded: true };
    let { data, error } = await D.sb.from('profiles').upsert(row).select().single();
    if (error && error.code === '23505') { row.username += Math.floor(Math.random() * 899 + 100); ({ data, error } = await D.sb.from('profiles').upsert(row).select().single()); }
    return data || row;
  };

  D.requireAuth = async () => {
    if (!D.configured) { D.banner(); return null; }
    const { data: { session } } = await D.sb.auth.getSession();
    if (!session) { location.replace('start.html'); return null; }
    D.uid = session.user.id; D.user = session.user;
    D.sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') location.replace('start.html?expired=1'); });
    return session;
  };

  D.logout = async (scope) => {
    try { if (D.uid) await D.sb.from('user_presence').upsert({ user_id: D.uid, online: false, last_seen: new Date().toISOString() }); } catch (e) { /* offline */ }
    try { await D.sb.auth.signOut(scope ? { scope } : undefined); } catch (e) { console.error(e); }
    try { sessionStorage.removeItem('dyson-ok'); } catch (e) { /* ignore */ }
    location.replace('start.html');
  };

  /* ---------- avatars ---------- */
  D.hue = (s) => { let x = 0; for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) % 360; return x; };
  D.avatar = (p, size = 'md', online = false) => {
    const name = (p && (p.saved_name || p.full_name || p.title || p.name)) || '?';
    const w = h('span', { class: `avatar ${size}` + (online ? ' online' : '') });
    const initials = () => { w.style.background = `linear-gradient(135deg,hsl(${D.hue(name)} 75% 52%),hsl(${(D.hue(name) + 40) % 360} 70% 38%))`; w.textContent = name.trim().split(/\s+/).slice(0, 2).map((s) => s[0]).join('').toUpperCase() || '?'; };
    const url = p && (p.avatar_url || p.other_avatar);
    if (url && /^https?:\/\//.test(url)) { const i = h('img', { alt: '', loading: 'lazy', src: url }); i.onerror = () => { i.remove(); initials(); }; w.append(i); } else initials();
    return w;
  };
  D.verified = (p) => (p && p.verified ? h('span', { class: 'vbadge', title: 'Verified' }, D.ic('check')) : '');

  /* ---------- dates ---------- */
  const same = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
  const loc = () => (D.prefs.data.lang === 'sw' ? 'sw' : D.prefs.data.lang || undefined);
  D.fmtTime = (d) => new Date(d).toLocaleTimeString(loc(), { hour: 'numeric', minute: '2-digit' });
  D.fmtDay = (d) => same(d, Date.now()) ? 'Today' : same(d, Date.now() - 864e5) ? 'Yesterday' : new Date(d).toLocaleDateString(loc(), { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  D.fmtList = (d) => same(d, Date.now()) ? D.fmtTime(d) : same(d, Date.now() - 864e5) ? 'Yesterday' : new Date(d).toLocaleDateString(loc(), { month: 'short', day: 'numeric' });
  D.fmtSeen = (d) => d ? 'Last seen ' + (same(d, Date.now()) ? 'today at ' + D.fmtTime(d) : D.fmtList(d)) : 'Offline';
  D.ago = (d) => { const s = (Date.now() - new Date(d)) / 1000; return s < 60 ? 'now' : s < 3600 ? Math.floor(s / 60) + 'm' : s < 86400 ? Math.floor(s / 3600) + 'h' : Math.floor(s / 86400) + 'd'; };
  D.dur = (s) => { s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60); return m >= 60 ? Math.floor(m / 60) + ' hr ' + (m % 60) + ' min' : m ? m + ' min' : s + ' sec'; };
  D.clock = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0');

  /* ---------- sound ---------- */
  let actx;
  D.tone = (freq = 880, ms = 120, vol = 0.05) => {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = freq; g.gain.value = vol; o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + ms / 1000);
    } catch (e) { /* audio blocked */ }
  };
  D.beep = () => { if (D.prefs.data.sound) D.tone(880, 110); };

  /* ---------- storage URLs (private buckets use signed URLs) ---------- */
  const urlCache = new Map();
  D.mediaUrl = async (bucket, path) => {
    if (!path) return '';
    if (/^https?:\/\//.test(path)) return path;
    const k = bucket + '/' + path, c = urlCache.get(k);
    if (c && c.exp > Date.now()) return c.url;
    const { data, error } = await D.sb.storage.from(bucket).createSignedUrl(path, 3600);
    if (error || !data) return '';
    urlCache.set(k, { url: data.signedUrl, exp: Date.now() + 3300e3 });
    return data.signedUrl;
  };
  D.publicUrl = (bucket, path) => (/^https?:\/\//.test(path || '') ? path : D.sb.storage.from(bucket).getPublicUrl(path).data.publicUrl);
  D.upload = async (bucket, path, file, opts = {}) => {
    const { error } = await D.sb.storage.from(bucket).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: !!opts.upsert });
    if (error) throw error;
    return path;
  };
  D.checkImage = (f) => { if (!f) return 'No file'; if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) return 'Use a PNG, JPG, WebP or GIF image.'; if (f.size > 4 * 1024 * 1024) return 'Image must be 4 MB or smaller.'; return ''; };
  D.pickFile = (accept, multiple = false, capture) => new Promise((res) => {
    const i = h('input', { type: 'file', accept, style: { display: 'none' } });
    if (multiple) i.multiple = true; if (capture) i.setAttribute('capture', capture);
    i.onchange = () => { res([...i.files]); i.remove(); };
    i.addEventListener('cancel', () => { res([]); i.remove(); });
    document.body.append(i); i.click();
  });

  /* ---------- dialogs ---------- */
  D.modal = ({ title, body, actions, wide, onClose, cls = '' }) => {
    const close = () => { m.remove(); document.removeEventListener('keydown', esc); if (onClose) onClose(); };
    const esc = (e) => { if (e.key === 'Escape') close(); };
    const card = h('div', { class: 'modal-card ' + cls + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Dialog' },
      title ? h('header', {}, h('h2', {}, title), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: close }, D.ic('x'))) : '',
      h('div', { class: 'body' }, body),
      actions ? h('footer', {}, actions) : '');
    const m = h('div', { class: 'modal', onmousedown: (e) => { if (e.target === m) close(); } }, card);
    document.body.append(m); document.addEventListener('keydown', esc);
    const f = card.querySelector('input,textarea,select'); if (f && matchMedia('(pointer:fine)').matches) f.focus();
    return { el: m, card, close };
  };
  D.confirm = (title, text, okLabel = 'Confirm', danger = false) => new Promise((res) => {
    let done = false; const fin = (v) => { if (!done) { done = true; res(v); } };
    const mo = D.modal({ title, body: h('p', { class: 'muted' }, text), onClose: () => fin(false),
      actions: [h('button', { class: 'btn', type: 'button', onclick: () => { fin(false); mo.close(); } }, 'Cancel'),
        h('button', { class: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'), type: 'button', onclick: () => { fin(true); mo.close(); } }, okLabel)] });
  });
  D.ask = (title, { label = '', value = '', placeholder = '', ok = 'Save', multiline = false, type = 'text' } = {}) => new Promise((res) => {
    let done = false; const fin = (v) => { if (!done) { done = true; res(v); } };
    const inp = multiline ? h('textarea', { class: 'input', rows: 4, placeholder }) : h('input', { class: 'input', type, placeholder });
    inp.value = value;
    const go = () => { fin(inp.value.trim()); mo.close(); };
    if (!multiline) inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    const mo = D.modal({ title, body: [label ? h('label', { class: 'lbl' }, label) : '', inp], onClose: () => fin(null),
      actions: [h('button', { class: 'btn', type: 'button', onclick: () => { fin(null); mo.close(); } }, 'Cancel'), h('button', { class: 'btn btn-primary', type: 'button', onclick: go }, ok)] });
  });
  D.sheet = (content, { title, onClose, cls = '' } = {}) => {
    const close = () => { m.remove(); if (onClose) onClose(); };
    const m = h('div', { class: 'sheet', onmousedown: (e) => { if (e.target === m) close(); } },
      h('div', { class: 'sheet-card ' + cls }, h('div', { class: 'sheet-grip' }), title ? h('h3', { class: 'sheet-title' }, title) : '', content));
    document.body.append(m);
    return { el: m, close };
  };

  /* ---------- popup menu ---------- */
  D.popMenu = (items, anchor) => {
    D.$$('.popmenu').forEach((x) => x.remove());
    const m = h('div', { class: 'popmenu', role: 'menu' });
    const close = () => { m.remove(); document.removeEventListener('mousedown', out, true); document.removeEventListener('keydown', key); };
    const out = (e) => { if (!m.contains(e.target)) close(); };
    const key = (e) => { if (e.key === 'Escape') close(); };
    items.filter(Boolean).forEach((it) => {
      if (it.sep) return m.append(h('hr'));
      m.append(h('button', { type: 'button', role: 'menuitem', class: it.danger ? 'danger' : '', onclick: () => { close(); it.fn && it.fn(); } }, it.icon ? D.ic(it.icon) : '', h('span', {}, it.label)));
    });
    document.body.append(m);
    const r = anchor.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
    m.style.left = Math.max(8, Math.min(innerWidth - mw - 8, r.right - mw)) + 'px';
    m.style.top = (r.bottom + mh + 12 > innerHeight ? Math.max(8, r.top - mh - 6) : r.bottom + 6) + 'px';
    setTimeout(() => { document.addEventListener('mousedown', out, true); document.addEventListener('keydown', key); }, 0);
    return close;
  };

  /* ---------- misc ui helpers ---------- */
  D.empty = (icon, title, text, action) => h('div', { class: 'empty' }, h('div', { class: 'empty-ic' }, D.ic(icon)), h('strong', {}, title), text ? h('p', {}, text) : '', action || '');
  D.spinner = () => h('div', { class: 'loading' }, h('span', { class: 'spinner' }));
  D.busy = (btn, on, label) => {
    if (!btn) return; btn.disabled = on;
    if (on) { btn._l = btn._l || [...btn.childNodes]; btn.replaceChildren(h('span', { class: 'spinner sm' }), ' ' + (label || 'Working…')); }
    else if (btn._l) { btn.replaceChildren(...btn._l); btn._l = null; }
  };
  D.field = (label, input, hint) => h('div', { class: 'field' }, label ? h('label', { class: 'lbl' }, label) : '', input, hint ? h('small', { class: 'hint' }, hint) : '');
  D.toggle = (checked, onchange, label) => {
    const i = h('input', { type: 'checkbox', class: 'sw-in', 'aria-label': label || 'Toggle' }); i.checked = !!checked;
    i.addEventListener('change', () => onchange(i.checked));
    return h('label', { class: 'sw' }, i, h('span', { class: 'sw-ui' }));
  };
  D.seg = (options, value, onchange) => {
    const box = h('div', { class: 'seg', role: 'tablist' });
    options.forEach(([v, l]) => box.append(h('button', { type: 'button', role: 'tab', 'aria-selected': String(v === value), onclick: () => { D.$$('button', box).forEach((b) => b.setAttribute('aria-selected', 'false')); box.querySelector(`[data-v="${v}"]`).setAttribute('aria-selected', 'true'); onchange(v); }, 'data-v': v }, l)));
    return box;
  };
  D.chip = (txt, cls = '') => h('span', { class: 'chip ' + cls }, txt);

  D.linkify = (text) => {
    const frag = document.createDocumentFragment(), re = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;
    String(text).split(re).forEach((part, i) => { if (i % 2) frag.append(h('a', { href: part, target: '_blank', rel: 'noopener noreferrer' }, part)); else if (part) frag.append(document.createTextNode(part)); });
    return frag;
  };

  /* ---------- view registry + shared store (modules load before app.js boots) ---------- */
  D.views = {};
  D.register = (name, def) => { D.views[name] = def; };
  D.store = { convs: [], presence: {}, badges: { unread: 0, status: 0, events: 0, notif: 0, live: 0 } };

  /* ---------- tiny event bus + hash router ---------- */
  const bus = document.createElement('i');
  D.on = (n, f) => { const fn = (e) => f(e.detail); bus.addEventListener(n, fn); return () => bus.removeEventListener(n, fn); };
  D.emit = (n, d) => bus.dispatchEvent(new CustomEvent(n, { detail: d }));
  D.go = (path) => { const t = '#' + path.replace(/^#/, ''); if (location.hash === t) D.emit('route', D.route()); else location.hash = t; };
  D.route = () => { const p = location.hash.replace(/^#\/?/, '').split('/'); return { view: p[0] || 'home', a: p[1] ? decodeURIComponent(p[1]) : '', b: p[2] ? decodeURIComponent(p[2]) : '', raw: location.hash }; };

  /* ---------- service worker + install ---------- */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').then((r) => { D.swReg = r; }).catch(console.warn));
  }
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); D.installEv = e; D.emit('installable'); });

  /* ---------- OS notifications ---------- */
  D.osNotify = (title, body, link) => {
    const p = D.prefs.data;
    if (!p.notify || !('Notification' in window) || Notification.permission !== 'granted' || document.hasFocus()) return;
    try { const n = new Notification(title, { body: p.previews ? body : 'New activity', icon: 'icon-192.png', tag: link || title }); n.onclick = () => { focus(); if (link) D.go(link); n.close(); }; } catch (e) { /* unsupported */ }
  };

  document.addEventListener('DOMContentLoaded', () => D.$$('[data-theme-toggle]').forEach((b) => b.addEventListener('click', D.toggleTheme)));
})();
