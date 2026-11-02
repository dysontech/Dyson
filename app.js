/* DYSON app.js — shell, router, shared stores, realtime hub, presence, command palette. Boots last. */
(function () {
  const { h, $, sb } = D;

  /* ---------- navigation model ---------- */
  const NAV = [
    ['home', 'home', 'Home'], ['chats', 'chat', 'Chats', 'unread'], ['status', 'status', 'Status', 'status'], ['discover', 'compass', 'Discover'],
    ['communities', 'users', 'Communities'], ['live', 'live', 'Dyson Live', 'live'], ['ai', 'spark', 'AI Assistant'], ['workspace', 'check-square', 'Workspace'],
    ['events', 'calendar', 'Events', 'events'], ['vault', 'cloud', 'Dyson Vault'], ['business', 'briefcase', 'Business'], '-',
    ['calls', 'phone', 'Calls'], ['notifications', 'bell', 'Notifications', 'notif'], ['profile', 'user', 'Profile'], ['settings', 'settings', 'Settings'],
  ];
  const TABS = [['home', 'home', 'Home'], ['chats', 'chat', 'Chats', 'unread'], ['discover', 'compass', 'Discover'], ['communities', 'users', 'Communities'], ['settings', 'settings', 'Settings']];
  D.NAV = NAV;

  /* ---------- shared store ---------- */
  const S = D.store;
  D.setBadge = (k, n) => {
    S.badges[k] = n;
    D.$$(`[data-badge="${k}"]`).forEach((b) => {
      if (b.classList.contains('live-tag')) { b.hidden = !n; return; }
      b.hidden = !n; b.textContent = n > 99 ? '99+' : String(n);
    });
    if (k === 'unread' || k === 'notif') document.title = (S.badges.unread + S.badges.notif ? `(${S.badges.unread + S.badges.notif}) ` : '') + 'DYSON';
  };

  D.nm = (c) => (!c ? 'Chat' : c.kind === 'direct' ? (D.contacts.name(c.other_id) || c.full_name || 'Dyson user') : (c.title || (c.kind === 'community' ? 'Community' : 'Group')));
  D.isOnline = (id) => !!(S.presence[id] && S.presence[id].online);
  D.chatAvatar = (c, size = 'md') => (c.kind === 'direct'
    ? D.avatar({ full_name: D.nm(c), avatar_url: c.other_avatar }, size, D.isOnline(c.other_id))
    : D.avatar({ full_name: c.title || 'G', avatar_url: c.avatar_url }, size));

  D.loadPresence = async (ids) => {
    ids = [...new Set(ids.filter(Boolean))]; if (!ids.length) return;
    const { data } = await sb.rpc('get_presence', { ids });
    (data || []).forEach((x) => { S.presence[x.user_id] = { online: x.online, last_seen: x.last_seen }; });
    D.emit('presence');
  };

  let chatsBusy = null;
  D.loadChats = async () => {
    if (chatsBusy) return chatsBusy;
    chatsBusy = (async () => {
      try {
        const { data, error } = await sb.rpc('get_chats');
        if (error) throw error;
        S.convs = data || [];
        D.setBadge('unread', S.convs.reduce((s, c) => s + (c.muted ? 0 : Number(c.unread || 0)), 0));
        D.emit('chats', S.convs);
        D.loadPresence(S.convs.filter((c) => c.kind === 'direct').map((c) => c.other_id));
      } catch (e) {
        console.warn('loadChats', e);
        if (e && /get_chats|schema cache|does not exist/i.test(e.message || '')) D.toast('Database not up to date. Run supabase_setup_dyson9.sql in Supabase.', 'error', 9000);
      } finally { chatsBusy = null; }
    })();
    return chatsBusy;
  };
  D.refreshChats = D.debounce(() => D.loadChats(), 250);

  D.openChatWith = async (userId) => {
    try {
      const { data, error } = await sb.rpc('start_direct_conversation', { other_user_id: userId });
      if (error) throw error;
      await D.loadChats();
      D.go('chats/' + data);
    } catch (e) { D.toast(D.err(e), 'error'); }
  };

  /* ---------- shared header builder ---------- */
  D.vhead = ({ title, sub, back, actions }) => h('div', { class: 'vhead' },
    back ? h('button', { class: 'icon-btn back', type: 'button', 'aria-label': 'Back', onclick: () => (typeof back === 'function' ? back() : history.length > 1 ? history.back() : D.go('home')) }, D.ic('back')) : '',
    h('div', { class: 'grow' }, h('h1', {}, title), sub ? h('p', {}, sub) : ''),
    h('div', { class: 'acts' }, actions || ''));

  D.bellBtn = () => h('button', { class: 'icon-btn ring', type: 'button', 'aria-label': 'Notifications', onclick: () => D.go('notifications') }, D.ic('bell'),
    h('span', { class: 'dot-badge', 'data-badge': 'notif', hidden: !S.badges.notif }, S.badges.notif || ''));
  D.searchBtn = () => h('button', { class: 'icon-btn ring', type: 'button', 'aria-label': 'Search', onclick: () => D.openSearch() }, D.ic('search'));

  /* ---------- shell DOM ---------- */
  let stage, listp, infop;
  function buildShell() {
    const app = $('#app');
    const navBtn = (n) => {
      if (n === '-') return h('div', { class: 'nav-sep' });
      const [v, ic, label, badge] = n;
      return h('a', { class: 'nav-i', href: '#' + v, 'data-nav': v }, D.ic(ic), h('span', {}, D.t(label)),
        badge === 'live' ? h('span', { class: 'live-tag', 'data-badge': 'live', hidden: '' }, 'LIVE') : badge ? h('span', { class: 'badge', 'data-badge': badge, hidden: '' }) : '');
    };
    const side = h('nav', { class: 'side', 'aria-label': 'Main navigation' },
      h('a', { class: 'brand', href: '#home', 'aria-label': 'DYSON home' }, h('img', { src: 'icon.png', alt: '' }), h('span', {}, h('b', {}, 'DYSON'), h('small', {}, 'Connect without limits.'))),
      h('div', { class: 'navlist' }, NAV.map(navBtn)),
      h('button', { class: 'premium-card', type: 'button', onclick: () => D.premium && D.premium() },
        h('span', { class: 'crown' }, D.ic('crown')), h('span', {}, h('b', {}, D.t('Upgrade to Dyson Premium')), h('small', {}, D.t('Unlock more features'))), D.ic('chevron-right')));
    const me = D.me;
    const top = h('header', { class: 'topbar' },
      h('button', { class: 'search-open', type: 'button', onclick: () => D.openSearch(), 'aria-label': 'Search' }, D.ic('search'), h('span', {}, 'Search messages, users, or communities…'), h('kbd', {}, 'Ctrl + K')),
      h('div', { class: 'top-r' },
        h('button', { class: 'icon-btn ring', type: 'button', 'aria-label': 'Toggle theme', id: 'themeBtn', onclick: () => { D.toggleTheme(); syncThemeIcon(); } }, D.ic('moon')),
        D.bellBtn(),
        h('button', { class: 'me-btn', type: 'button', id: 'meBtn', 'aria-label': 'Account menu', onclick: (e) => accountMenu(e.currentTarget) }, D.avatar(me, 'sm', true), D.ic('chevron-down', 'sm'))));
    listp = h('section', { class: 'listpane', id: 'listpane', 'aria-label': 'List' });
    stage = h('main', { class: 'stage', id: 'stage' });
    infop = h('aside', { class: 'infopane', id: 'infopane', 'aria-label': 'Details' });
    const tabbar = h('nav', { class: 'tabbar', 'aria-label': 'Primary' }, TABS.map(([v, ic, label, badge]) => h('a', { class: 'tb', href: '#' + v, 'data-tab': v }, D.ic(ic), h('span', {}, D.t(label)), badge ? h('span', { class: 'dot-badge', 'data-badge': badge, hidden: '' }) : '')));
    app.replaceChildren(side, top, listp, stage, infop, tabbar);
    syncThemeIcon();
  }
  function syncThemeIcon() { const b = $('#themeBtn'); if (b) b.replaceChildren(D.ic(document.documentElement.dataset.theme === 'dark' ? 'moon' : 'sun')); }
  D.on('theme', syncThemeIcon);

  function accountMenu(anchor) {
    D.popMenu([
      { icon: 'user', label: 'View profile', fn: () => D.go('profile') },
      { icon: 'settings', label: 'Settings', fn: () => D.go('settings') },
      { icon: 'lock', label: 'Lock app now', fn: () => (D.lock && D.lock.enabled() ? D.lock.now() : (D.toast('Set a PIN first in Settings › Account & Security.', 'info'), D.go('settings/account'))) },
      { sep: 1 },
      { icon: 'logout', label: 'Log out', danger: 1, fn: () => D.logout() },
    ], anchor);
  }

  /* ---------- router ---------- */
  let cur = null;
  function navigate() {
    const r = D.route();
    const name = D.views[r.view] ? r.view : 'home';
    const def = D.views[name];
    const app = $('#app');
    const ctx = {
      stage, list: listp, info: infop, route: r, app,
      setOpen: (v) => { app.dataset.open = v ? '1' : '0'; },
      setInfo: (v) => { app.dataset.info = v ? '1' : '0'; },
    };
    if (cur && cur.name === name && def.update) { def.update(ctx); markNav(name); return; }
    if (cur && cur.def.leave) { try { cur.def.leave(); } catch (e) { console.warn(e); } }
    cur = { name, def };
    app.dataset.view = name; app.dataset.layout = def.layout || 'page'; app.dataset.open = '0'; app.dataset.info = '0';
    stage.className = 'stage' + (def.fill ? ' fill' : '');
    stage.replaceChildren(); listp.replaceChildren(); infop.replaceChildren();
    stage.scrollTop = 0;
    markNav(name);
    try { def.render(ctx); } catch (e) { console.error(e); stage.replaceChildren(D.empty('alert', 'Something broke', e.message)); }
  }
  function markNav(name) {
    const m = { communities: 'communities' };
    D.$$('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === (m[name] || name)));
    D.$$('[data-tab]').forEach((a) => a.classList.toggle('on', a.dataset.tab === name));
  }
  D.on('route', navigate);

  /* ---------- realtime hub ---------- */
  function startRealtime() {
    const ch = sb.channel('dyson-hub');
    const pg = (table, event, filter, fn) => ch.on('postgres_changes', Object.assign({ event, schema: 'public', table }, filter ? { filter } : {}), fn);
    pg('messages', 'INSERT', null, (p) => {
      const m = p.new; D.emit('msg:insert', m);
      const c = S.convs.find((x) => x.conversation_id === m.conversation_id);
      if (m.sender_id !== D.uid && (!c || !c.muted) && D.prefs.data.nMsg) {
        const viewing = D.activeConv === m.conversation_id && document.hasFocus();
        if (!viewing) {
          D.beep();
          D.osNotify(c ? D.nm(c) : 'New message', m.msg_type === 'text' ? m.content : '📎 ' + (m.msg_type || 'attachment'), 'chats/' + m.conversation_id);
        }
      }
      D.refreshChats();
    });
    pg('messages', 'UPDATE', null, (p) => D.emit('msg:update', p.new));
    pg('messages', 'DELETE', null, (p) => D.emit('msg:delete', p.old));
    pg('message_reactions', '*', null, (p) => D.emit('react', p));
    pg('conversation_members', 'UPDATE', null, (p) => D.emit('member:update', p.new));
    pg('conversation_members', 'INSERT', `user_id=eq.${D.uid}`, () => D.refreshChats());
    pg('notifications', 'INSERT', `user_id=eq.${D.uid}`, (p) => {
      D.emit('notif:new', p.new);
      D.setBadge('notif', S.badges.notif + 1);
      if (D.prefs.data.nSocial) D.toast(`${p.new.title || 'New notification'}`, 'info', 4000, () => D.go('notifications'));
    });
    pg('call_logs', '*', null, (p) => D.emit('calllog', p));
    pg('live_streams', '*', null, () => D.emit('live:change'));
    pg('statuses', 'INSERT', null, () => D.emit('status:new'));
    pg('events', '*', null, () => D.emit('events:change'));
    pg('follows', '*', null, (p) => D.emit('follow', p));
    ch.subscribe();
    D.hub = ch;
  }

  /* ---------- presence ---------- */
  function startPresence() {
    const beat = (online = true) => sb.from('user_presence').upsert({ user_id: D.uid, online, last_seen: new Date().toISOString() }).then(() => {});
    beat();
    setInterval(() => { if (!document.hidden) beat(); }, 40000);
    document.addEventListener('visibilitychange', () => beat(!document.hidden));
    setInterval(() => D.loadPresence(S.convs.filter((c) => c.kind === 'direct').map((c) => c.other_id)), 60000);
  }

  /* ---------- badges that need a query ---------- */
  D.refreshBadges = async () => {
    try {
      const [n, ev, lv] = await Promise.all([
        sb.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', D.uid).eq('read', false),
        sb.rpc('list_events', { only_mine: true }),
        sb.from('live_streams').select('id', { count: 'exact', head: true }).eq('active', true),
      ]);
      D.setBadge('notif', n.count || 0);
      const week = Date.now() + 7 * 864e5;
      D.setBadge('events', ((ev.data) || []).filter((e) => +new Date(e.starts_at) < week).length);
      D.setBadge('live', lv.count || 0);
    } catch (e) { console.warn('badges', e); }
  };
  D.on('events:change', D.debounce(() => D.refreshBadges(), 500));
  D.on('live:change', D.debounce(() => D.refreshBadges(), 500));

  /* ---------- command palette (Ctrl/Cmd + K) ---------- */
  D.openSearch = (initial = '') => {
    const input = h('input', { class: 'input', type: 'search', placeholder: 'Search chats, people, communities, messages, pages…', autocomplete: 'off', 'aria-label': 'Search' });
    const out = h('div', { class: 'sr-list' });
    const mo = D.modal({ title: '', body: [h('div', { class: 'input-ic' }, D.ic('search'), input), out], cls: 'palette', wide: true });
    mo.card.querySelector('header')?.remove();
    let sel = -1, token = 0;
    const items = () => D.$$('.sr-item', out);
    const mark = () => items().forEach((x, i) => x.classList.toggle('on', i === sel));
    const row = (icon, title, sub, fn, av) => h('button', { class: 'sr-item', type: 'button', onclick: () => { mo.close(); fn(); } }, av || h('span', { class: 'sr-ic' }, D.ic(icon)), h('span', {}, h('b', {}, title), sub ? h('small', {}, sub) : ''));
    const section = (t) => h('b', { class: 'hits-h' }, t);
    const run = async () => {
      const q = input.value.trim(), my = ++token, ql = q.toLowerCase();
      out.replaceChildren(); sel = -1;
      const pages = NAV.filter((n) => n !== '-' && (!ql || n[2].toLowerCase().includes(ql)));
      const chats = S.convs.filter((c) => !ql || D.nm(c).toLowerCase().includes(ql)).slice(0, 5);
      if (chats.length) out.append(section('Chats'), ...chats.map((c) => row('chat', D.nm(c), c.last_content || '', () => D.go((c.kind === 'community' ? 'communities/' : 'chats/') + c.conversation_id), D.chatAvatar(c, 'sm'))));
      if (pages.length) out.append(section('Go to'), ...pages.slice(0, ql ? 6 : 5).map((n) => row(n[1], n[2], '', () => D.go(n[0]))));
      mark();
      if (q.length < 2) return;
      const [pp, cc, mm] = await Promise.all([sb.rpc('search_people', { q }), sb.rpc('discover_communities', { q }), sb.rpc('search_messages', { q })]);
      if (my !== token) return;
      const people = pp.data || [], comms = cc.data || [], msgs = mm.data || [];
      if (people.length) out.append(section('People'), ...people.slice(0, 5).map((u) => row('user', u.full_name, '@' + u.username, () => D.go('profile/' + u.id), D.avatar(u, 'sm'))));
      if (comms.length) out.append(section('Communities'), ...comms.slice(0, 4).map((c) => row('users', c.title, D.compact(c.member_count) + ' members', () => D.go('communities/' + c.id), D.avatar({ full_name: c.title, avatar_url: c.avatar_url }, 'sm'))));
      if (msgs.length) out.append(section('Messages'), ...msgs.slice(0, 6).map((m) => { const c = S.convs.find((x) => x.conversation_id === m.conversation_id); return row('chat', c ? D.nm(c) : 'Chat', m.content, () => D.go((c && c.kind === 'community' ? 'communities/' : 'chats/') + m.conversation_id)); }));
      if (!out.children.length) out.append(D.empty('search', 'No results', 'Try a different name or word.'));
      mark();
    };
    input.addEventListener('input', D.debounce(run, 220));
    input.addEventListener('keydown', (e) => {
      const it = items(); if (!it.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % it.length; mark(); it[sel].scrollIntoView({ block: 'nearest' }); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + it.length) % it.length; mark(); it[sel].scrollIntoView({ block: 'nearest' }); }
      else if (e.key === 'Enter') { e.preventDefault(); (it[Math.max(sel, 0)]).click(); }
    });
    input.value = initial; run(); input.focus();
  };
  document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); D.openSearch(); } });

  /* ---------- premium (waitlist: no payments are processed) ---------- */
  D.premium = () => {
    const perks = [['crown', 'Verified-style badge on your profile'], ['cloud', '10 GB Dyson Vault (encrypted)'], ['users', 'Communities up to 100K members'], ['spark', 'Priority AI assistant'], ['live', 'HD Dyson Live']];
    const btn = h('button', { class: 'btn btn-primary btn-block btn-pill', type: 'button' }, 'Join the Premium waitlist');
    const sh = D.sheet(h('div', { class: 'prem' },
      h('div', { class: 'prem-hero' }, h('span', { class: 'crown big' }, D.ic('crown', 'lg')), h('h2', {}, 'Dyson Premium'), h('p', { class: 'muted' }, 'Paid plans are not open yet. Join the waitlist and we will let you know when they launch.')),
      h('ul', { class: 'perks' }, perks.map(([i, t]) => h('li', {}, D.ic(i), h('span', {}, t)))), btn), { title: '' });
    btn.onclick = async () => {
      D.busy(btn, true, 'Joining…');
      const { error } = await sb.from('premium_waitlist').upsert({ user_id: D.uid });
      D.busy(btn, false);
      if (error) return D.toast(D.err(error), 'error');
      D.toast('You are on the Premium waitlist.', 'success'); sh.close();
    };
  };

  /* ---------- boot ---------- */
  async function boot() {
    const session = await D.requireAuth();
    if (!session) return;
    try { D.me = await D.ensureProfile(session.user); } catch (e) { console.error(e); D.me = { id: D.uid, full_name: (session.user.email || 'Me').split('@')[0], username: 'me' }; }
    await D.pullPrefs(D.uid);
    buildShell();
    await Promise.all([D.contacts.load(), D.loadChats()]);
    startRealtime(); startPresence(); D.refreshBadges();
    addEventListener('hashchange', () => D.emit('route', D.route()));
    if (D.calls) D.calls.init();
    navigate();
    D.emit('ready');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
