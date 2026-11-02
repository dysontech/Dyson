/* DYSON discover.js — find people, communities, businesses and live streams. */
(function () {
  const { h, $, sb } = D;

  D.register('discover', {
    layout: 'page',
    render(ctx) {
      let tab = 'all', q = '', token = 0;
      const out = h('div', { class: 'disc-out' });
      const search = h('input', { class: 'input', type: 'search', placeholder: 'Search people, communities, businesses…', 'aria-label': 'Search Discover' });
      const tabs = h('div', { class: 'filters' });
      const paintTabs = () => tabs.replaceChildren(...[['all', 'All'], ['people', 'People'], ['communities', 'Communities'], ['business', 'Business']].map(([k, l]) => h('button', { class: 'filter' + (tab === k ? ' on' : ''), type: 'button', onclick: () => { tab = k; paintTabs(); run(); } }, l)));
      const personCard = (u) => {
        const fol = h('button', { class: 'btn btn-sm ' + (u.i_follow ? 'btn-outline' : 'btn-primary'), type: 'button' }, u.i_follow ? 'Following' : 'Follow');
        fol.onclick = async (e) => { e.stopPropagation(); D.busy(fol, true, '…'); const { error } = await (u.i_follow ? sb.from('follows').delete().match({ follower_id: D.uid, followee_id: u.id }) : sb.from('follows').insert({ follower_id: D.uid, followee_id: u.id })); if (error) { D.busy(fol, false); return D.toast(D.err(error), 'error'); } u.i_follow = !u.i_follow; u.followers += u.i_follow ? 1 : -1; fol.textContent = u.i_follow ? 'Following' : 'Follow'; fol.className = 'btn btn-sm ' + (u.i_follow ? 'btn-outline' : 'btn-primary'); fol.disabled = false; fol._l = null; };
        return h('div', { class: 'dcard', onclick: () => D.go('profile/' + u.id), role: 'link', tabindex: 0 }, D.avatar(u, 'lg'), h('b', {}, u.full_name, D.verified(u)), h('small', {}, '@' + u.username), h('small', { class: 'dc-sub' }, D.compact(u.followers) + ' followers'), h('div', { class: 'dc-act' }, fol, h('button', { class: 'icon-btn ring', type: 'button', 'aria-label': 'Message', onclick: (e) => { e.stopPropagation(); D.openChatWith(u.id); } }, D.ic('chat', 'sm'))));
      };
      const commCard = (c) => {
        const btn = h('button', { class: 'btn btn-sm ' + (c.joined ? 'btn-outline' : 'btn-primary'), type: 'button' }, c.joined ? 'Open' : 'Join');
        btn.onclick = async (e) => { e.stopPropagation(); if (c.joined) return D.go('communities/' + c.id); D.busy(btn, true, '…'); const { error } = await sb.rpc('join_community', { cid: c.id }); if (error) { D.busy(btn, false); return D.toast(D.err(error), 'error'); } await D.loadChats(); D.go('communities/' + c.id); };
        return h('div', { class: 'dcard', onclick: () => D.go('communities/' + c.id), role: 'link', tabindex: 0 }, D.avatar({ full_name: c.title, avatar_url: c.avatar_url }, 'lg'), h('b', {}, c.title), h('small', { class: 'dc-sub' }, D.compact(c.member_count) + ' members'), h('small', { class: 'dc-desc' }, c.description || 'Public community'), h('div', { class: 'dc-act' }, btn));
      };
      const bizCard = (b) => h('div', { class: 'dcard', onclick: () => D.business.open(b.id), role: 'link', tabindex: 0 }, D.avatar({ full_name: b.name, avatar_url: b.logo_url }, 'lg'), h('b', {}, b.name), h('small', { class: 'dc-sub' }, b.category || 'Business'), h('small', { class: 'dc-desc' }, b.description || ''), h('div', { class: 'dc-act' }, h('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: (e) => { e.stopPropagation(); D.openChatWith(b.owner_id); } }, D.ic('chat', 'sm'), 'Message')));
      const section = (title, nodes, empty) => h('section', { class: 'dsec' }, h('h3', {}, title), nodes.length ? h('div', { class: 'dgrid' }, nodes) : h('p', { class: 'hint pad' }, empty));

      async function run() {
        const my = ++token; const s = q.trim(); out.replaceChildren(D.spinner());
        const want = (k) => tab === 'all' || tab === k;
        const [pp, cc, bb, ll] = await Promise.all([
          want('people') ? sb.rpc('search_people', { q: s }) : { data: [] }, want('communities') ? sb.rpc('discover_communities', { q: s }) : { data: [] },
          want('business') ? (s ? sb.from('businesses').select('*').or(`name.ilike.%${s}%,category.ilike.%${s}%,description.ilike.%${s}%`).limit(24) : sb.from('businesses').select('*').order('created_at', { ascending: false }).limit(24)) : { data: [] },
          tab === 'all' && !s ? sb.from('live_streams').select('id,title,host_id,started_at').eq('active', true).limit(6) : { data: [] }]);
        if (my !== token) return;
        const nodes = [];
        if ((ll.data || []).length) { const { data: hs } = await sb.from('profiles').select('id,full_name,avatar_url').in('id', ll.data.map((x) => x.host_id)); const hm = new Map((hs || []).map((p) => [p.id, p]));
          nodes.push(h('section', { class: 'dsec' }, h('h3', {}, h('span', { class: 'live-dot' }), 'Live now'), h('div', { class: 'dgrid' }, ll.data.map((l) => h('div', { class: 'dcard live', onclick: () => D.go('live/' + l.id), role: 'link', tabindex: 0 }, D.avatar(hm.get(l.host_id) || { full_name: 'Host' }, 'lg'), h('b', {}, l.title), h('small', { class: 'dc-sub' }, (hm.get(l.host_id) || {}).full_name || 'Host'), h('div', { class: 'dc-act' }, h('button', { class: 'btn btn-sm btn-primary', type: 'button' }, 'Watch'))))))); }
        if (want('people')) nodes.push(section(s ? 'People' : 'Suggested people', (pp.data || []).map(personCard), s ? 'No people match your search.' : 'No one to suggest yet — invite friends to Dyson!'));
        if (want('communities')) nodes.push(section('Communities', (cc.data || []).map(commCard), 'No public communities found.'));
        if (want('business')) nodes.push(section('Businesses', (bb.data || []).map(bizCard), 'No businesses listed yet.'));
        out.replaceChildren(...nodes);
      }
      search.addEventListener('input', D.debounce(() => { q = search.value; run(); }, 280));
      ctx.stage.replaceChildren(h('div', { class: 'page' }, D.vhead({ title: D.t('Discover'), sub: 'Find people, communities and businesses', back: true, actions: [D.bellBtn()] }), h('div', { class: 'input-ic', style: { marginBottom: '12px' } }, D.ic('search'), search), tabs, out));
      paintTabs(); run();
    },
  });
})();
