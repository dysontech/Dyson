/* DYSON home.js — dashboard: feature tiles (every one is a working screen), stories, next events, recent chats. */
(function () {
  const { h, $, sb } = D;
  const TILES = [['chats', 'chat', 'Chat'], ['status', 'status', 'Status'], ['communities', 'users', 'Communities'], ['live', 'live', 'Live'], ['ai', 'spark', 'AI Assistant'], ['business', 'briefcase', 'Business'], ['events', 'calendar', 'Events'], ['vault', 'cloud', 'Vault'],
    ['calls', 'phone', 'Calls'], ['workspace', 'check-square', 'Workspace'], ['discover', 'compass', 'Discover'], ['notifications', 'bell', 'Alerts']];

  D.register('home', {
    layout: 'page',
    render(ctx) {
      const first = (D.me.full_name || 'there').split(' ')[0], hr = new Date().getHours();
      const greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
      const grid = h('div', { class: 'tiles' }, TILES.map(([v, ic, l]) => h('a', { class: 'tile', href: '#' + v }, h('span', { class: 'tile-ic' }, D.ic(ic), v === 'chats' || v === 'notifications' || v === 'status' ? h('i', { class: 'dot-badge', 'data-badge': v === 'chats' ? 'unread' : v === 'notifications' ? 'notif' : 'status', hidden: '' }) : v === 'live' ? h('i', { class: 'live-tag sm', 'data-badge': 'live', hidden: '' }, 'LIVE') : ''), h('span', {}, D.t(l)))));
      const strip = D.status.strip();
      const recent = h('div', { class: 'rows' }), next = h('div', { class: 'rows' });
      const paintRecent = () => {
        const rows = D.store.convs.slice(0, 4);
        recent.replaceChildren(...(rows.length ? rows.map((c) => h('button', { class: 'row', type: 'button', onclick: () => D.go((c.kind === 'community' ? 'communities/' : 'chats/') + c.conversation_id) }, D.chatAvatar(c, 'md'), h('div', { class: 'row-b' }, h('b', {}, D.nm(c)), h('small', {}, c.last_content || 'No messages yet')), Number(c.unread) ? h('span', { class: 'badge' }, c.unread) : h('small', { class: 'hint' }, c.last_at ? D.fmtList(c.last_at) : ''))) : [h('div', { class: 'cta-row' }, h('p', { class: 'muted' }, 'No chats yet.'), h('button', { class: 'btn btn-primary btn-pill btn-sm', type: 'button', onclick: D.openNewChat }, 'Start one'))]));
      };
      const ai = h('button', { class: 'ai-promo', type: 'button', onclick: () => D.go('ai') }, h('span', { class: 'avatar-ai', style: { width: '44px', height: '44px' } }, D.ic('spark')), h('span', {}, h('b', {}, 'Ask Dyson Assistant'), h('small', {}, 'Summarise a chat · Draft · Translate · Find')), D.ic('chevron-right', 'sm'));
      ctx.stage.replaceChildren(h('div', { class: 'page home' },
        h('div', { class: 'vhead' }, h('div', { class: 'grow' }, h('p', { class: 'muted' }, greet), h('h1', {}, `${first} 👋`)), h('div', { class: 'acts' }, D.searchBtn(), D.bellBtn())),
        h('section', { class: 'hero-card' }, h('div', {}, h('img', { src: 'icon.png', alt: '', width: 48, height: 48 }), h('h2', {}, 'Connect without limits.'), h('p', {}, 'Message · Connect · Share · Grow')), h('div', { class: 'two' }, h('button', { class: 'btn btn-primary btn-pill', type: 'button', onclick: D.openNewChat }, D.ic('edit', 'sm'), 'New chat'), h('button', { class: 'btn btn-pill', type: 'button', onclick: () => D.calls.pick() }, D.ic('phone', 'sm'), 'Call'))),
        grid, h('h3', { class: 'sec-h' }, 'Recent updates'), strip, ai,
        h('h3', { class: 'sec-h' }, h('span', {}, 'Recent chats'), h('a', { href: '#chats' }, 'See all')), recent,
        h('h3', { class: 'sec-h' }, h('span', {}, 'Coming up'), h('a', { href: '#events' }, 'All events')), next));
      ['unread', 'notif', 'status', 'live'].forEach((k) => D.setBadge(k, D.store.badges[k]));
      paintRecent(); D.status.load();
      sb.rpc('list_events', { only_mine: true }).then(({ data }) => { const rows = (data || []).slice(0, 3); next.replaceChildren(...(rows.length ? rows.map((e) => h('button', { class: 'row', type: 'button', onclick: () => D.go('events') }, h('span', { class: 'edate sm' }, h('b', {}, new Date(e.starts_at).getDate()), h('small', {}, new Date(e.starts_at).toLocaleDateString(undefined, { month: 'short' }).toUpperCase())), h('div', { class: 'row-b' }, h('b', {}, e.title), h('small', {}, new Date(e.starts_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + (e.location ? ' · ' + e.location : ''))))) : [h('div', { class: 'cta-row' }, h('p', { class: 'muted' }, 'Nothing planned.'), h('button', { class: 'btn btn-sm btn-pill', type: 'button', onclick: () => D.events.openCreate({}) }, 'Create an event'))])); });
      this._o = [D.on('chats', paintRecent)];
    },
    leave() { (this._o || []).forEach((f) => f && f()); },
  });
})();
