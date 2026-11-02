/* DYSON chats.js — chat list, communities, info panel, new chat, group/community creation. */
(function () {
  const { h, $, sb } = D;
  const S = D.store;

  /* ---------- previews ---------- */
  const previewText = (c) => {
    if (!c.last_type && !c.last_content) return 'No messages yet';
    const who = c.last_sender === D.uid ? 'You: ' : '';
    const t = c.last_type;
    const body = t === 'image' ? '📷 Photo' : t === 'video' ? '🎬 Video' : t === 'audio' ? '🎤 Voice message' : t === 'file' ? '📎 File' : (c.last_content || '');
    return who + (body || 'Deleted message');
  };

  /* ---------- new chat sheet ---------- */
  D.openNewChat = () => {
    const q = h('input', { class: 'input', type: 'search', placeholder: 'Search people by name or @username', autocomplete: 'off' });
    const box = h('div', { class: 'rows' });
    const quick = h('div', { class: 'quick-grid' },
      qbtn('users', 'New group', () => { sh.close(); D.createConversation('group'); }),
      qbtn('building', 'New community', () => { sh.close(); D.createConversation('community'); }),
      qbtn('user-plus', 'New contact', () => { sh.close(); D.contacts.add(); }),
      qbtn('contacts', 'Contacts', () => { sh.close(); D.contacts.manage(); }));
    function qbtn(i, l, fn) { return h('button', { class: 'quick', type: 'button', onclick: fn }, h('span', {}, D.ic(i)), l); }
    const personRow = (u, sub) => h('button', { class: 'row', type: 'button', onclick: () => { sh.close(); D.openChatWith(u.id || u.contact_id); } },
      D.avatar(u, 'md'), h('div', { class: 'row-b' }, h('b', {}, u.saved_name || u.full_name, D.verified(u)), h('small', {}, sub)), D.ic('chat', 'sm'));
    const drawContacts = () => {
      const list = D.contacts.list.filter((c) => c.contact_id);
      box.replaceChildren(h('b', { class: 'hits-h' }, 'Your contacts'), ...(list.length ? list.map((c) => personRow({ id: c.contact_id, full_name: c.saved_name, avatar_url: c.avatar_url }, '@' + c.username)) : [h('p', { class: 'hint pad' }, 'No contacts yet. Search above to find people on Dyson.')]));
    };
    const run = D.debounce(async () => {
      const s = q.value.trim();
      if (s.length < 2) return drawContacts();
      box.replaceChildren(D.spinner());
      const { data, error } = await sb.rpc('search_people', { q: s });
      if (error) return box.replaceChildren(D.empty('alert', 'Search failed', D.err(error)));
      box.replaceChildren(...((data || []).length ? data.map((u) => personRow(u, '@' + u.username + ' · ' + D.compact(u.followers) + ' followers')) : [D.empty('search', 'No one found', 'Check the spelling or try their @username.')]));
    }, 260);
    q.addEventListener('input', run);
    const sh = D.sheet([quick, h('div', { style: { marginTop: '10px' } }, q), box], { title: 'New chat' });
    drawContacts();
  };

  /* ---------- create group / community ---------- */
  D.createConversation = (kind) => {
    const isC = kind === 'community';
    const title = h('input', { class: 'input', placeholder: isC ? 'Community name' : 'Group name', maxlength: 60 });
    const desc = h('textarea', { class: 'input', rows: 3, placeholder: isC ? 'What is this community about?' : 'Optional description', maxlength: 300 });
    const pub = h('input', { type: 'checkbox' }); pub.checked = true;
    const picked = new Set();
    const contacts = D.contacts.list.filter((c) => c.contact_id);
    const rows = h('div', { class: 'rows pick' }, contacts.length ? contacts.map((c) => {
      const cb = h('input', { type: 'checkbox', 'aria-label': c.saved_name }); cb.onchange = () => (cb.checked ? picked.add(c.contact_id) : picked.delete(c.contact_id));
      return h('label', { class: 'row' }, D.avatar({ full_name: c.saved_name, avatar_url: c.avatar_url }, 'sm'), h('div', { class: 'row-b' }, h('b', {}, c.saved_name)), cb);
    }) : [h('p', { class: 'hint' }, 'Add contacts to invite them now, or share the link later.')]);
    const msg = h('div', { class: 'form-msg error', hidden: '' });
    const go = h('button', { class: 'btn btn-primary', type: 'button' }, 'Create');
    const mo = D.modal({ title: isC ? 'New community' : 'New group', body: [msg, D.field('Name', title), D.field('Description', desc),
      isC ? h('label', { class: 'check', style: { marginBottom: '14px' } }, pub, 'Public — anyone can find and join it') : '', h('b', { class: 'lbl' }, 'Add people'), rows],
      actions: [h('button', { class: 'btn', type: 'button', onclick: () => mo.close() }, 'Cancel'), go] });
    go.onclick = async () => {
      if (title.value.trim().length < 2) { msg.textContent = 'Give it a name (2+ characters).'; msg.hidden = false; return; }
      D.busy(go, true, 'Creating…');
      const { data, error } = await sb.rpc('create_conversation', { p_kind: kind, p_title: title.value.trim(), p_description: desc.value.trim(), p_public: isC ? pub.checked : false, p_members: [...picked] });
      if (error) { D.busy(go, false); msg.textContent = D.err(error); msg.hidden = false; return; }
      mo.close(); await D.loadChats(); D.go((isC ? 'communities/' : 'chats/') + data); D.toast(isC ? 'Community created' : 'Group created', 'success');
    };
  };

  /* ---------- info panel (desktop pane / mobile sheet) ---------- */
  async function renderInfo(c, el, closeFn) {
    el.replaceChildren(D.spinner());
    if (c.kind === 'direct') return directInfo(c, el);
    return groupInfo(c, el, closeFn);
  }
  async function directInfo(c, el) {
    const { data } = await sb.rpc('get_profile', { uid: c.other_id });
    const p = (data && data[0]) || { id: c.other_id, full_name: D.nm(c), username: c.username, avatar_url: c.other_avatar, followers: 0, following: 0, posts: 0 };
    const fol = h('button', { class: 'btn ' + (p.i_follow ? 'btn-outline' : 'btn-primary') + ' btn-block btn-pill', type: 'button' }, p.i_follow ? 'Following' : 'Follow');
    fol.onclick = async () => {
      D.busy(fol, true, '…');
      const q = p.i_follow ? sb.from('follows').delete().match({ follower_id: D.uid, followee_id: p.id }) : sb.from('follows').insert({ follower_id: D.uid, followee_id: p.id });
      const { error } = await q; if (error) { D.busy(fol, false); return D.toast(D.err(error), 'error'); }
      directInfo(c, el);
    };
    const pres = S.presence[c.other_id], media = h('div', { class: 'media-grid' });
    el.replaceChildren(h('div', { class: 'info' },
      h('div', { class: 'info-cover', style: p.cover_url ? { backgroundImage: `url(${p.cover_url})` } : {} }),
      h('div', { class: 'info-who' }, h('span', { class: 'ring' }, D.avatar(p, 'xl', pres && pres.online)), h('h2', {}, D.nm(c), D.verified(p)), h('p', { class: 'muted' }, '@' + p.username), p.about ? h('p', { class: 'info-about' }, p.about) : ''),
      h('div', { class: 'stats3' }, stat(p.followers, 'Followers'), stat(p.following, 'Following'), stat(p.posts, 'Posts')),
      h('div', { class: 'info-actions' }, fol, h('button', { class: 'icon-btn ring', type: 'button', 'aria-label': 'View profile', onclick: () => D.go('profile/' + p.id) }, D.ic('user'))),
      h('h4', {}, 'About'), h('p', { class: 'muted' }, p.bio || p.about || 'No bio yet.'),
      h('div', { class: 'info-line' }, h('span', {}, 'Online status'), h('b', { class: pres && pres.online ? 'ok' : '' }, pres && pres.online ? '● Online' : pres && pres.last_seen ? D.fmtSeen(pres.last_seen) : 'Hidden')),
      h('div', { class: 'info-line' }, h('h4', {}, 'Shared media'), h('button', { class: 'link', type: 'button', onclick: () => allMedia(c) }, 'See all')), media,
      h('h4', {}, 'Quick actions'),
      h('div', { class: 'two' }, h('button', { class: 'btn btn-outline', type: 'button', onclick: () => D.calls.start({ id: c.other_id, full_name: D.nm(c), avatar_url: c.other_avatar }, false) }, D.ic('phone', 'sm'), 'Voice call'),
        h('button', { class: 'btn btn-outline', type: 'button', onclick: () => D.calls.start({ id: c.other_id, full_name: D.nm(c), avatar_url: c.other_avatar }, true) }, D.ic('video', 'sm'), 'Video call')),
      !D.contacts.has(c.other_id) ? h('button', { class: 'btn btn-block', type: 'button', style: { marginTop: '10px' }, onclick: () => D.contacts.add({ name: p.full_name, handle: '@' + p.username }) }, D.ic('user-plus', 'sm'), 'Save to contacts') : ''));
    fillMedia(c, media, 6);
  }
  const stat = (n, l) => h('div', {}, h('b', {}, D.compact(n)), h('small', {}, l));
  async function mediaRows(c, limit) {
    const { data } = await sb.from('messages').select('id,media_path,msg_type,media_name').eq('conversation_id', c.conversation_id).in('msg_type', ['image', 'video']).is('deleted_at', null).order('created_at', { ascending: false }).limit(limit);
    const rows = data || [];
    await Promise.all(rows.map(async (m) => { m.url = await D.mediaUrl('chat-media', m.media_path); }));
    return rows.filter((m) => m.url);
  }
  async function fillMedia(c, box, n) {
    const rows = await mediaRows(c, n);
    if (!rows.length) return box.replaceChildren(h('p', { class: 'hint' }, 'No photos or videos shared yet.'));
    box.replaceChildren(...rows.map((m) => h('button', { class: 'mg-i', type: 'button', onclick: () => D.viewMedia({ url: m.url, type: m.msg_type, name: m.media_name }) }, m.msg_type === 'video' ? h('video', { src: m.url, muted: '', preload: 'metadata' }) : h('img', { src: m.url, alt: '', loading: 'lazy' }))));
  }
  function allMedia(c) { const box = h('div', { class: 'media-grid big' }); D.sheet(box, { title: 'Shared media' }); fillMedia(c, box, 60); }

  async function groupInfo(c, el, closeFn) {
    const cid = c.conversation_id, isC = c.kind === 'community';
    const [{ data: ppl }, { data: meta }] = await Promise.all([sb.rpc('conversation_people', { cid }), sb.from('conversations').select('description,cover_url,is_public,pinned_message,created_by').eq('id', cid).maybeSingle()]);
    const people = ppl || [], m = meta || {}, admin = c.role === 'admin', joined = c.joined !== false;
    const body = h('div', { class: 'tab-body' });
    let tab = 'about';
    const tabs = h('div', { class: 'itabs' }, ['about', 'members', 'media', ...(isC ? ['events'] : [])].map((t) => h('button', { type: 'button', 'data-t': t, class: t === tab ? 'on' : '', onclick: () => { tab = t; D.$$('button', tabs).forEach((b) => b.classList.toggle('on', b.dataset.t === t)); paint(); } }, t[0].toUpperCase() + t.slice(1))));
    const link = () => location.href.split('#')[0] + '#communities/' + cid;
    const join = h('button', { class: 'btn btn-primary btn-pill', type: 'button' }, 'Join');
    join.onclick = async () => { D.busy(join, true, 'Joining…'); const { error } = await sb.rpc('join_community', { cid }); if (error) { D.busy(join, false); return D.toast(D.err(error), 'error'); } D.toast('Joined', 'success'); await D.loadChats(); D.emit('route', D.route()); };
    const head = h('div', { class: 'info' },
      h('div', { class: 'info-cover', style: m.cover_url ? { backgroundImage: `url(${m.cover_url})` } : {} }),
      h('div', { class: 'info-who' }, h('span', { class: 'ring' }, D.avatar({ full_name: D.nm(c), avatar_url: c.avatar_url }, 'xl')), h('h2', {}, D.nm(c), isC ? h('span', { class: 'vbadge' }, D.ic('check')) : ''), h('p', { class: 'muted' }, D.compact(people.length) + ' members' + (isC ? (m.is_public ? ' · Public' : ' · Private') : ''))),
      h('div', { class: 'info-actions' }, joined ? '' : join,
        isC ? h('button', { class: 'btn btn-outline btn-pill', type: 'button', onclick: () => (navigator.share ? navigator.share({ title: D.nm(c), url: link() }).catch(() => {}) : D.copy(link(), 'Invite link copied')) }, D.ic('user-plus', 'sm'), 'Invite') : admin ? h('button', { class: 'btn btn-outline btn-pill', type: 'button', onclick: addPeople }, D.ic('user-plus', 'sm'), 'Add people') : '',
        admin ? h('button', { class: 'icon-btn ring', type: 'button', 'aria-label': 'Edit', onclick: editGroup }, D.ic('pen')) : ''),
      tabs, body);
    el.replaceChildren(head);
    paint();
    function paint() {
      if (tab === 'about') {
        body.replaceChildren(h('p', { class: 'info-about left' }, m.description || 'No description yet.'),
          m.pinned_message ? h('div', { class: 'pinned-card' }, h('b', {}, D.ic('pin', 'sm'), 'Pinned message'), h('p', { class: 'muted' }, 'See it at the top of the conversation.')) : '',
          '');
      } else if (tab === 'members') {
        body.replaceChildren(...people.map((p) => h('div', { class: 'row' }, h('button', { class: 'row-main', type: 'button', onclick: () => { closeFn && closeFn(); D.go('profile/' + p.user_id); } }, D.avatar(p, 'sm'), h('div', { class: 'row-b' }, h('b', {}, p.user_id === D.uid ? 'You' : p.full_name, D.verified(p)), h('small', {}, '@' + p.username))),
          p.role === 'admin' ? h('span', { class: 'tag' }, 'Admin') : '',
          admin && p.user_id !== D.uid ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Remove', onclick: async () => { if (!(await D.confirm('Remove member?', `${p.full_name} will be removed.`, 'Remove', true))) return; const { error } = await sb.from('conversation_members').delete().match({ conversation_id: cid, user_id: p.user_id }); if (error) return D.toast(D.err(error), 'error'); groupInfo(c, el, closeFn); } }, D.ic('x', 'sm')) : '')));
      } else if (tab === 'media') {
        const box = h('div', { class: 'media-grid' }); body.replaceChildren(box); fillMedia(c, box, 24);
      } else {
        body.replaceChildren(D.spinner());
        D.events.forCommunity(cid, joined).then((node) => body.replaceChildren(node));
      }
    }
    async function addPeople() {
      const have = new Set(people.map((p) => p.user_id)), cand = D.contacts.list.filter((x) => x.contact_id && !have.has(x.contact_id)), sel = new Set();
      if (!cand.length) return D.toast('All your contacts are already here. Save more contacts first.', 'info');
      const go = h('button', { class: 'btn btn-primary btn-block', type: 'button' }, 'Add selected');
      const sh = D.sheet([h('div', { class: 'rows pick' }, cand.map((x) => { const cb = h('input', { type: 'checkbox' }); cb.onchange = () => (cb.checked ? sel.add(x.contact_id) : sel.delete(x.contact_id)); return h('label', { class: 'row' }, D.avatar({ full_name: x.saved_name, avatar_url: x.avatar_url }, 'sm'), h('div', { class: 'row-b' }, h('b', {}, x.saved_name)), cb); })), go], { title: 'Add people' });
      go.onclick = async () => { if (!sel.size) return; D.busy(go, true, 'Adding…'); const { error } = await sb.rpc('add_conversation_members', { cid, p_members: [...sel] }); if (error) { D.busy(go, false); return D.toast(D.err(error), 'error'); } sh.close(); D.toast('People added', 'success'); D.loadChats(); groupInfo(c, el, closeFn); };
    }
    function editGroup() {
      const t = h('input', { class: 'input', value: D.nm(c), maxlength: 60 }), d = h('textarea', { class: 'input', rows: 3, maxlength: 300 }); d.value = m.description || '';
      const pub = h('input', { type: 'checkbox' }); pub.checked = !!m.is_public;
      const photo = h('button', { class: 'btn btn-sm', type: 'button', onclick: async () => {
        const [f] = await D.pickFile('image/*'); if (!f) return; const bad = D.checkImage(f); if (bad) return D.toast(bad, 'error');
        const cropped = await D.crop(f); if (!cropped) return;
        try { const path = `${D.uid}/conv-${cid}-${Date.now()}.jpg`; await D.upload('avatars', path, cropped, { upsert: true }); const { error } = await sb.from('conversations').update({ avatar_url: D.publicUrl('avatars', path) }).eq('id', cid); if (error) throw error; D.toast('Photo updated', 'success'); D.loadChats(); } catch (e) { D.toast(D.err(e), 'error'); }
      } }, D.ic('camera', 'sm'), 'Change photo');
      const go = h('button', { class: 'btn btn-primary', type: 'button' }, 'Save');
      const mo = D.modal({ title: 'Edit ' + (isC ? 'community' : 'group'), body: [D.field('Name', t), D.field('Description', d), photo, isC ? h('label', { class: 'check', style: { marginTop: '14px' } }, pub, 'Public community') : ''], actions: [h('button', { class: 'btn', type: 'button', onclick: () => mo.close() }, 'Cancel'), go] });
      go.onclick = async () => { D.busy(go, true, 'Saving…'); const { error } = await sb.from('conversations').update({ title: t.value.trim() || D.nm(c), description: d.value.trim(), is_public: isC ? pub.checked : false }).eq('id', cid); if (error) { D.busy(go, false); return D.toast(D.err(error), 'error'); } mo.close(); await D.loadChats(); groupInfo(Object.assign(c, { title: t.value.trim() }), el, closeFn); };
    }
  }

  /* ---------- the list pane + views ---------- */
  function makeView(mode) {
    const isComm = mode === 'communities';
    let ctxRef = null, tab = 'all', q = '', conv = null, curId = null, listEl, discoverRows = [], infoOpen = true, offs = [];
    const wide = () => matchMedia('(min-width:1280px)').matches;
    const mine = () => S.convs.filter((c) => (isComm ? c.kind === 'community' : c.kind !== 'community'));

    function tabs() {
      const all = mine();
      const defs = isComm ? [['all', 'Joined', all.length], ['discover', 'Discover', 0]] : [['all', 'All', all.length], ['unread', 'Unread', all.filter((c) => Number(c.unread) > 0).length], ['fav', 'Favorites', 0], ['groups', 'Groups', all.filter((c) => c.kind === 'group').length]];
      return defs.map(([k, l, n]) => h('button', { class: 'filter' + (tab === k ? ' on' : ''), type: 'button', onclick: () => { tab = k; paintFilters(); paintList(); }, 'aria-pressed': String(tab === k) }, l, n && k !== 'fav' ? h('b', {}, n) : ''));
    }
    let filterBox;
    const paintFilters = () => filterBox && filterBox.replaceChildren(...tabs());

    async function paintList() {
      if (!listEl) return;
      const s = q.trim().toLowerCase();
      if (isComm && tab === 'discover') {
        listEl.replaceChildren(D.spinner());
        const { data, error } = await sb.rpc('discover_communities', { q: s });
        if (error) return listEl.replaceChildren(D.empty('alert', 'Could not load', D.err(error)));
        discoverRows = data || [];
        return listEl.replaceChildren(...(discoverRows.length ? discoverRows.map((r) => h('div', { class: 'conv' }, h('button', { class: 'conv-main', type: 'button', onclick: () => D.go('communities/' + r.id) }, D.avatar({ full_name: r.title, avatar_url: r.avatar_url }, 'md'),
          h('span', { class: 'conv-body' }, h('span', { class: 'conv-top' }, h('b', {}, r.title)), h('span', { class: 'conv-bot' }, h('span', { class: 'preview' }, D.compact(r.member_count) + ' members · ' + (r.description || 'Public community'))))),
          r.joined ? h('span', { class: 'tag' }, 'Joined') : h('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: async (e) => { D.busy(e.currentTarget, true, ''); const { error: er } = await sb.rpc('join_community', { cid: r.id }); if (er) return D.toast(D.err(er), 'error'); await D.loadChats(); paintList(); } }, 'Join'))) : [D.empty('users', 'No public communities yet', 'Create the first one and invite people.')]));
      }
      const items = mine().filter((c) => (tab === 'all' || (tab === 'unread' && Number(c.unread) > 0) || (tab === 'fav' && c.favorite) || (tab === 'groups' && c.kind === 'group')) && (!s || D.nm(c).toLowerCase().includes(s) || (c.username || '').toLowerCase().includes(s)));
      if (!items.length) {
        listEl.replaceChildren(isComm ? D.empty('users', tab === 'all' ? 'No communities yet' : 'Nothing here', 'Find a community to join or start your own.', h('button', { class: 'btn btn-primary btn-pill', type: 'button', onclick: () => D.createConversation('community') }, 'Create a community'))
          : D.empty('chat', s ? 'No matches' : tab === 'unread' ? 'You are all caught up' : 'No conversations yet', s ? '' : 'Tap + to start a chat, group or community.', !s && tab === 'all' ? h('button', { class: 'btn btn-primary btn-pill', type: 'button', onclick: D.openNewChat }, 'Start a chat') : ''));
        return;
      }
      listEl.replaceChildren(...items.map((c) => {
        const unread = Number(c.unread) > 0;
        return h('button', { class: 'conv' + (c.conversation_id === curId ? ' on' : '') + (unread ? ' unread' : ''), type: 'button', onclick: () => D.go((isComm ? 'communities/' : 'chats/') + c.conversation_id) },
          D.chatAvatar(c, 'md'),
          h('span', { class: 'conv-body' },
            h('span', { class: 'conv-top' }, h('b', {}, (c.favorite ? '★ ' : '') + D.nm(c), c.kind === 'direct' ? D.verified(c) : ''), h('time', {}, D.fmtList(c.last_at))),
            h('span', { class: 'conv-bot' }, h('span', { class: 'preview' }, previewText(c)), c.muted ? D.ic('bell-off', 'sm') : '', unread ? h('span', { class: 'badge' + (c.muted ? ' muted-b' : '') }, String(c.unread)) : '')));
      }));
    }

    function buildList(ctx) {
      const search = h('input', { class: 'input', type: 'search', placeholder: isComm ? 'Search communities' : 'Search chats', 'aria-label': 'Search list' });
      search.addEventListener('input', D.debounce(() => { q = search.value; paintList(); }, 180));
      filterBox = h('div', { class: 'filters' });
      listEl = h('div', { class: 'clist', role: 'list' });
      ctx.list.replaceChildren(
        h('div', { class: 'lp-head' }, h('h1', {}, D.t(isComm ? 'Communities' : 'Chats')),
          h('button', { class: 'icon-btn ring', type: 'button', 'aria-label': 'Search everything', onclick: () => D.openSearch() }, D.ic('search')),
          h('button', { class: 'icon-btn ring', type: 'button', 'aria-label': 'New', onclick: () => (isComm ? D.createConversation('community') : D.openNewChat()) }, D.ic(isComm ? 'plus' : 'edit'))),
        h('div', { class: 'lp-search' }, search), filterBox, listEl,
        h('button', { class: 'fab', type: 'button', 'aria-label': isComm ? 'New community' : 'New chat', onclick: () => (isComm ? D.createConversation('community') : D.openNewChat()) }, D.ic('plus')));
      paintFilters(); paintList();
    }

    async function open(ctx, id) {
      if (conv && conv.ctl && curId === id) return;
      closeConv(ctx);
      curId = id;
      let c = S.convs.find((x) => x.conversation_id === id);
      if (!c) {
        // maybe a public community we have not joined yet
        const { data } = await sb.from('conversations').select('id,kind,title,description,avatar_url,is_public').eq('id', id).maybeSingle();
        if (!data) { ctx.stage.replaceChildren(D.empty('alert', 'Conversation not found', 'It may have been removed or is private.', h('button', { class: 'btn btn-primary', type: 'button', onclick: () => D.go(mode) }, 'Back'))); ctx.setOpen(true); return; }
        const { data: ppl } = await sb.rpc('conversation_people', { cid: id });
        c = { conversation_id: data.id, kind: data.kind, title: data.title, description: data.description, avatar_url: data.avatar_url, joined: false, member_count: (ppl || []).length, role: null };
      }
      if (curId !== id) return;
      ctx.setOpen(true);
      const host = h('div', { class: 'chat-host' }); ctx.stage.replaceChildren(host);
      const showInfo = () => { if (wide()) { infoOpen = !infoOpen; ctx.setInfo(infoOpen); if (infoOpen) renderInfo(c, ctx.info); } else { const box = h('div', {}); const sh = D.sheet(box, { cls: 'info-sheet' }); renderInfo(c, box, sh.close); } };
      conv = { ctl: D.Conv(host, c, { mode, onBack: () => D.go(mode), onInfo: showInfo }), c };
      if (wide()) { ctx.setInfo(infoOpen); if (infoOpen) renderInfo(c, ctx.info); } else ctx.setInfo(false);
      paintList();
      if (Number(c.unread) > 0) sb.rpc('mark_read', { cid: id }).then(() => D.refreshChats());
    }
    function closeConv(ctx) {
      if (conv) { conv.ctl.destroy(); conv = null; }
      curId = null; ctx.setInfo(false); ctx.info.replaceChildren();
    }
    function placeholder(ctx) {
      ctx.stage.replaceChildren(h('div', { class: 'stage-empty' }, h('img', { src: 'icon.png', alt: '', width: 84, height: 84 }), h('h2', {}, isComm ? 'Communities' : 'Your conversations'),
        h('p', { class: 'muted' }, isComm ? 'Pick a community to read its posts, or discover new ones.' : 'Select a chat to start messaging, or begin a new one.'),
        h('div', { class: 'two' }, h('button', { class: 'btn btn-primary btn-pill', type: 'button', onclick: () => (isComm ? D.createConversation('community') : D.openNewChat()) }, isComm ? 'New community' : 'New chat'), isComm ? h('button', { class: 'btn btn-pill', type: 'button', onclick: () => { tab = 'discover'; paintFilters(); paintList(); } }, 'Discover') : h('button', { class: 'btn btn-pill', type: 'button', onclick: () => D.createConversation('group') }, 'New group'))));
    }
    const sync = (ctx) => { const id = ctx.route.a; if (id) open(ctx, id); else { closeConv(ctx); ctx.setOpen(false); placeholder(ctx); paintList(); } };

    return {
      layout: 'split', fill: true, isOpen: (r) => !!r.a,
      render(ctx) {
        ctxRef = ctx; tab = 'all'; q = ''; infoOpen = true;
        buildList(ctx);
        offs.push(D.on('chats', () => { paintFilters(); if (!(isComm && tab === 'discover')) paintList(); }), D.on('presence', paintList), D.on('contacts', paintList));
        sync(ctx);
      },
      update(ctx) { ctxRef = ctx; sync(ctx); },
      leave() { if (ctxRef) closeConv(ctxRef); offs.forEach((f) => f && f()); offs = []; conv = null; curId = null; listEl = null; filterBox = null; },
    };
  }
  D.register('chats', makeView('chats'));
  D.register('communities', makeView('communities'));
})();
