/* DYSON profile.js — profiles (yours and others'), follow, posts, status, media, highlights, edit profile. */
(function () {
  const { h, $, sb } = D;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const shareLink = (p) => location.href.split('#')[0] + '#profile/' + p.username;

  D.refreshMe = async () => {
    const { data } = await sb.from('profiles').select('*').eq('id', D.uid).maybeSingle();
    if (data) { D.me = data; const b = $('#meBtn'); if (b) b.replaceChildren(D.avatar(D.me, 'sm', true), D.ic('chevron-down', 'sm')); }
  };

  async function fetchProfile(key) {
    const params = !key || key === D.uid ? { uid: D.uid } : UUID.test(key) ? { uid: key } : { uname: key.replace(/^@/, '') };
    const { data, error } = await sb.rpc('get_profile', params);
    if (error) throw error;
    return data && data[0];
  }

  function peopleList(title, uid, kind) {
    const box = h('div', { class: 'rows' }, D.spinner());
    D.sheet(box, { title });
    (async () => {
      const col = kind === 'followers' ? 'follower_id' : 'followee_id', key = kind === 'followers' ? 'followee_id' : 'follower_id';
      const { data } = await sb.from('follows').select(col).eq(key, uid).limit(200);
      const ids = (data || []).map((x) => x[col]);
      if (!ids.length) return box.replaceChildren(D.empty('users', kind === 'followers' ? 'No followers yet' : 'Not following anyone', ''));
      const { data: ps } = await sb.from('profiles').select('id,full_name,username,avatar_url,verified').in('id', ids);
      box.replaceChildren(...(ps || []).map((p) => h('button', { class: 'row', type: 'button', onclick: () => { D.$$('.sheet').forEach((s) => s.remove()); D.go('profile/' + p.id); } }, D.avatar(p, 'md'), h('div', { class: 'row-b' }, h('b', {}, p.full_name, D.verified(p)), h('small', {}, '@' + p.username)))));
    })();
  }

  function editProfile(p, done) {
    const f = {
      name: h('input', { class: 'input', value: p.full_name || '', maxlength: 50 }),
      user: h('input', { class: 'input', value: p.username || '', maxlength: 20, autocapitalize: 'off', autocomplete: 'off' }),
      about: h('input', { class: 'input', value: p.about || '', maxlength: 80, placeholder: 'Dream big. Connect more.' }),
      bio: h('textarea', { class: 'input', rows: 3, maxlength: 240, placeholder: 'Tell people about yourself' }),
      web: h('input', { class: 'input', value: p.website || '', maxlength: 120, placeholder: 'https://' }),
      loc: h('input', { class: 'input', value: p.location || '', maxlength: 60, placeholder: 'City, Country' }),
    };
    f.bio.value = p.bio || '';
    let avatar = p.avatar_url, cover = p.cover_url;
    const av = h('div', { class: 'ep-av' }), cv = h('div', { class: 'ep-cover' });
    const paint = () => { av.replaceChildren(D.avatar({ full_name: f.name.value || p.full_name, avatar_url: avatar }, 'xl')); cv.style.backgroundImage = cover ? `url(${cover})` : ''; };
    const up = async (file, cropIt, kind) => {
      const bad = D.checkImage(file); if (bad) return D.toast(bad, 'error');
      const out = cropIt ? await D.crop(file) : file; if (!out) return;
      try { const ext = kind === 'avatar' ? 'jpg' : (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg'); const path = `${D.uid}/${kind}-${Date.now()}.${ext}`; await D.upload('avatars', path, out, { upsert: true }); const url = D.publicUrl('avatars', path); if (kind === 'avatar') avatar = url; else cover = url; paint(); } catch (e) { D.toast(D.err(e), 'error'); }
    };
    const status = h('small', { class: 'hint' }, '');
    f.user.addEventListener('input', D.debounce(async () => {
      const v = f.user.value.trim().toLowerCase(); if (v === p.username) { status.textContent = ''; return; }
      if (!/^[a-z0-9_]{3,20}$/.test(v)) { status.textContent = '3–20 letters, numbers or underscores'; status.className = 'hint bad'; return; }
      const { data } = await sb.rpc('username_available', { uname: v }); status.textContent = data ? '@' + v + ' is available' : 'Already taken'; status.className = 'hint ' + (data ? 'ok2' : 'bad');
    }, 350));
    const go = h('button', { class: 'btn btn-primary', type: 'button' }, 'Save changes');
    const mo = D.modal({ title: 'Edit profile', wide: true, body: [
      cv, h('div', { class: 'ep-row2' }, av, h('div', { class: 'two' }, h('button', { class: 'btn btn-sm', type: 'button', onclick: async () => { const [x] = await D.pickFile('image/*'); if (x) up(x, true, 'avatar'); } }, D.ic('camera', 'sm'), 'Photo'), h('button', { class: 'btn btn-sm', type: 'button', onclick: async () => { const [x] = await D.pickFile('image/*'); if (x) up(x, false, 'cover'); } }, D.ic('image', 'sm'), 'Cover'))),
      D.field('Name', f.name), h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Username'), f.user, status), D.field('Tagline', f.about), D.field('Bio', f.bio), D.field('Website', f.web), D.field('Location', f.loc)],
      actions: [h('button', { class: 'btn', type: 'button', onclick: () => mo.close() }, 'Cancel'), go] });
    paint(); f.name.addEventListener('input', paint);
    go.onclick = async () => {
      const uname = f.user.value.trim().toLowerCase();
      if (!f.name.value.trim()) return D.toast('Name cannot be empty.', 'error');
      if (!/^[a-z0-9_]{3,20}$/.test(uname)) return D.toast('Username must be 3–20 letters, numbers or underscores.', 'error');
      let web = f.web.value.trim(); if (web && !/^https?:\/\//i.test(web)) web = 'https://' + web;
      D.busy(go, true, 'Saving…');
      const { error } = await sb.from('profiles').update({ full_name: f.name.value.trim(), username: uname, about: f.about.value.trim(), bio: f.bio.value.trim(), website: web || null, location: f.loc.value.trim() || null, avatar_url: avatar, cover_url: cover, updated_at: new Date().toISOString() }).eq('id', D.uid);
      if (error) { D.busy(go, false); return D.toast(error.code === '23505' ? 'That username is taken.' : D.err(error), 'error'); }
      mo.close(); await D.refreshMe(); D.toast('Profile updated', 'success'); done && done();
    };
  }

  function newPost(done) {
    const t = h('textarea', { class: 'input', rows: 4, placeholder: 'What’s on your mind?', maxlength: 500 });
    let file = null; const prev = h('div', { class: 'prev-grid one', hidden: '' });
    const go = h('button', { class: 'btn btn-primary', type: 'button' }, 'Post');
    const mo = D.modal({ title: 'New post', body: [t, prev, h('button', { class: 'btn btn-sm', type: 'button', style: { marginTop: '10px' }, onclick: async () => { const [f] = await D.pickFile('image/*,video/mp4,video/webm'); if (!f) return; if (f.size > 25 * 1024 * 1024) return D.toast('Max 25 MB.', 'error'); file = f; const u = URL.createObjectURL(f); prev.replaceChildren(h('div', { class: 'prev-i' }, f.type.startsWith('video/') ? h('video', { src: u, controls: '' }) : h('img', { src: u, alt: '' }))); prev.hidden = false; } }, D.ic('image', 'sm'), 'Add photo / video')], actions: [h('button', { class: 'btn', type: 'button', onclick: () => mo.close() }, 'Cancel'), go] });
    go.onclick = async () => {
      if (!t.value.trim() && !file) return D.toast('Write something or add a photo.', 'info');
      D.busy(go, true, 'Posting…');
      try {
        let path = null; if (file) { path = `${D.uid}/${D.uuid()}.${(file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5)}`; await D.upload('post-media', path, file); }
        const { error } = await sb.from('posts').insert({ user_id: D.uid, content: t.value.trim(), media_path: path, media_mime: file ? file.type : null }); if (error) throw error;
        mo.close(); D.toast('Posted', 'success'); done && done();
      } catch (e) { D.busy(go, false); D.toast(D.err(e), 'error'); }
    };
  }
  D.newPost = newPost;

  D.register('profile', {
    layout: 'page',
    async render(ctx) {
      const root = h('div', { class: 'page narrow prof' }, D.spinner()); ctx.stage.replaceChildren(root);
      let p; try { p = await fetchProfile(ctx.route.a); } catch (e) { return root.replaceChildren(D.empty('alert', 'Could not load profile', D.err(e))); }
      if (!p) return root.replaceChildren(D.empty('user', 'Profile not found', 'That user does not exist.', h('button', { class: 'btn btn-primary', type: 'button', onclick: () => D.go('discover') }, 'Find people')));
      const own = p.id === D.uid; let tab = 'posts';
      const body = h('div', { class: 'prof-body' });
      const paintTabs = () => D.$$('.ptab', root).forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
      const pres = D.store.presence[p.id];

      const actions = own
        ? [h('button', { class: 'btn btn-primary btn-pill grow', type: 'button', onclick: () => editProfile(p, () => D.emit('route', D.route())) }, 'Edit Profile'), h('button', { class: 'icon-btn ring', type: 'button', 'aria-label': 'Share profile', onclick: () => (navigator.share ? navigator.share({ title: p.full_name, url: shareLink(p) }).catch(() => {}) : D.copy(shareLink(p), 'Profile link copied')) }, D.ic('share'))]
        : [followBtn(), h('button', { class: 'btn btn-pill', type: 'button', onclick: () => D.openChatWith(p.id) }, D.ic('chat', 'sm'), 'Message'),
          h('button', { class: 'icon-btn ring', type: 'button', 'aria-label': 'Voice call', onclick: () => D.calls.start({ id: p.id, full_name: p.full_name, avatar_url: p.avatar_url }, false) }, D.ic('phone')),
          h('button', { class: 'icon-btn ring', type: 'button', 'aria-label': 'More', onclick: (e) => D.popMenu([
            { icon: 'video', label: 'Video call', fn: () => D.calls.start({ id: p.id, full_name: p.full_name, avatar_url: p.avatar_url }, true) },
            { icon: 'share', label: 'Share profile', fn: () => D.copy(shareLink(p), 'Profile link copied') },
            !D.contacts.has(p.id) ? { icon: 'user-plus', label: 'Save to contacts', fn: () => D.contacts.add({ name: p.full_name, handle: '@' + p.username }) } : null,
            { sep: 1 }, { icon: 'slash', label: p.blocked ? 'Unblock' : 'Block', danger: !p.blocked, fn: async () => {
              if (p.blocked) await sb.from('blocks').delete().match({ blocker_id: D.uid, blocked_id: p.id });
              else { if (!(await D.confirm('Block ' + p.full_name + '?', 'They will not be able to message or call you.', 'Block', true))) return; await sb.from('blocks').insert({ blocker_id: D.uid, blocked_id: p.id }); }
              D.emit('blockchange'); D.emit('route', D.route()); } }], e.currentTarget) }, D.ic('more'))];
      function followBtn() {
        const b = h('button', { class: 'btn btn-pill grow ' + (p.i_follow ? 'btn-outline' : 'btn-primary'), type: 'button' }, p.i_follow ? 'Following' : p.follows_me ? 'Follow back' : 'Follow');
        b.onclick = async () => {
          D.busy(b, true, '…');
          const { error } = await (p.i_follow ? sb.from('follows').delete().match({ follower_id: D.uid, followee_id: p.id }) : sb.from('follows').insert({ follower_id: D.uid, followee_id: p.id }));
          if (error) { D.busy(b, false); return D.toast(D.err(error), 'error'); } D.emit('route', D.route());
        }; return b;
      }

      root.replaceChildren(
        h('div', { class: 'prof-cover', style: p.cover_url ? { backgroundImage: `url(${p.cover_url})` } : {} },
          h('button', { class: 'icon-btn glass', type: 'button', 'aria-label': 'Back', onclick: () => (history.length > 1 ? history.back() : D.go('home')) }, D.ic('back')),
          h('button', { class: 'icon-btn glass', type: 'button', 'aria-label': 'Share', onclick: () => (navigator.share ? navigator.share({ title: p.full_name, url: shareLink(p) }).catch(() => {}) : D.copy(shareLink(p), 'Profile link copied')) }, D.ic('share'))),
        h('div', { class: 'prof-head' },
          h('span', { class: 'ring big' }, D.avatar(p, 'xxl', own || (pres && pres.online))),
          h('h1', {}, p.full_name, D.verified(p)), h('p', { class: 'muted' }, '@' + p.username),
          p.about ? h('p', { class: 'prof-about' }, p.about) : '',
          p.bio ? h('p', { class: 'prof-bio' }, p.bio) : '',
          (p.website || p.location) ? h('p', { class: 'prof-meta' }, p.location ? h('span', {}, D.ic('map-pin', 'sm'), p.location) : '', p.website ? h('a', { href: p.website, target: '_blank', rel: 'noopener noreferrer' }, D.ic('link', 'sm'), p.website.replace(/^https?:\/\//, '')) : '') : '',
          h('div', { class: 'stats3 big' },
            h('button', { type: 'button', onclick: () => peopleList('Followers', p.id, 'followers') }, h('b', {}, D.compact(p.followers)), h('small', {}, 'Followers')),
            h('button', { type: 'button', onclick: () => peopleList('Following', p.id, 'following') }, h('b', {}, D.compact(p.following)), h('small', {}, 'Following')),
            h('button', { type: 'button', onclick: () => { tab = 'posts'; paintTabs(); paint(); } }, h('b', {}, D.compact(p.posts)), h('small', {}, 'Posts'))),
          h('div', { class: 'prof-actions' }, actions)),
        h('div', { class: 'ptabs', role: 'tablist' }, ['posts', 'status', 'media', 'highlights'].map((t) => h('button', { class: 'ptab' + (t === tab ? ' on' : ''), type: 'button', 'data-t': t, role: 'tab', onclick: () => { tab = t; paintTabs(); paint(); } }, t[0].toUpperCase() + t.slice(1)))),
        body);

      async function posts() { const { data } = await sb.from('posts').select('*').eq('user_id', p.id).order('created_at', { ascending: false }).limit(60); return data || []; }
      const pUrl = (x) => D.publicUrl('post-media', x.media_path);
      function postCard(x) {
        return h('article', { class: 'post' },
          h('div', { class: 'post-h' }, D.avatar(p, 'sm'), h('div', {}, h('b', {}, p.full_name), h('small', {}, D.fmtDay(x.created_at) + ' · ' + D.fmtTime(x.created_at))), own ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Delete post', onclick: async () => { if (!(await D.confirm('Delete post?', 'This cannot be undone.', 'Delete', true))) return; const { error } = await sb.from('posts').delete().eq('id', x.id); if (error) return D.toast(D.err(error), 'error'); if (x.media_path) sb.storage.from('post-media').remove([x.media_path]); D.emit('route', D.route()); } }, D.ic('trash', 'sm')) : ''),
          x.content ? h('p', {}, D.linkify(x.content)) : '',
          x.media_path ? (x.media_mime && x.media_mime.startsWith('video') ? h('video', { src: pUrl(x), controls: '', preload: 'metadata', playsinline: '' }) : h('img', { src: pUrl(x), alt: '', loading: 'lazy', onclick: () => D.viewMedia({ url: pUrl(x) }) })) : '');
      }
      async function paint() {
        body.replaceChildren(D.spinner());
        try {
          if (tab === 'posts') {
            const list = await posts();
            body.replaceChildren(...(own ? [h('button', { class: 'composer-prompt', type: 'button', onclick: () => newPost(() => D.emit('route', D.route())) }, D.avatar(D.me, 'sm'), h('span', {}, 'Share something with your followers…'), D.ic('image'))] : []),
              ...(list.length ? list.map(postCard) : [D.empty('note', own ? 'No posts yet' : 'No posts yet', own ? 'Share your first photo or thought.' : p.full_name + ' has not posted yet.')]));
          } else if (tab === 'media') {
            const list = (await posts()).filter((x) => x.media_path);
            body.replaceChildren(list.length ? h('div', { class: 'media-grid big' }, list.map((x) => h('button', { class: 'mg-i', type: 'button', onclick: () => D.viewMedia({ url: pUrl(x), type: x.media_mime && x.media_mime.startsWith('video') ? 'video' : 'image' }) }, x.media_mime && x.media_mime.startsWith('video') ? h('video', { src: pUrl(x), muted: '', preload: 'metadata' }) : h('img', { src: pUrl(x), alt: '', loading: 'lazy' })))) : D.empty('image', 'No media yet', ''));
          } else if (tab === 'status') {
            await D.status.load();
            const g = own ? D.status.mine : D.status.groups.find((x) => x.uid === p.id);
            body.replaceChildren(g ? h('button', { class: 'row', type: 'button', onclick: () => D.status.view([g], 0) }, h('span', { class: 'ring' }, D.avatar(p, 'md')), h('div', { class: 'row-b' }, h('b', {}, `${g.items.length} active update${g.items.length > 1 ? 's' : ''}`), h('small', {}, 'Tap to view · expires in 24 hours'))) : D.empty('status', 'No active status', own ? 'Post a status from the Status tab.' : 'Nothing to see right now.'));
          } else {
            const { data } = await sb.rpc('profile_highlights', { uid: p.id }); const list = data || [];
            const items = list.map((s) => Object.assign({}, s, { user_id: p.id, full_name: p.full_name, avatar_url: p.avatar_url, viewed: true }));
            body.replaceChildren(items.length ? h('div', { class: 'stories big wrap' }, items.map((s, i) => h('button', { class: 'story', type: 'button', onclick: () => D.status.view([{ uid: p.id, p, items }], 0, i) }, h('span', { class: 'ring' }, s.status_type === 'text' ? h('span', { class: 'avatar lg', style: { background: D.statusBg[s.bg] || D.statusBg.b1 } }, '') : h('span', { class: 'avatar lg hl', 'data-path': s.media_path }, '')), h('span', { class: 'n' }, D.fmtList(s.created_at))))) : D.empty('bookmark', 'No highlights', own ? 'Open one of your status updates and choose “Add to profile highlights”.' : ''));
            D.$$('.hl', body).forEach(async (el) => { const u = await D.mediaUrl('status-media', el.dataset.path); if (u) el.style.cssText = `background:url(${u}) center/cover`; });
          }
        } catch (e) { body.replaceChildren(D.empty('alert', 'Could not load', D.err(e))); }
      }
      paint();
    },
  });
})();
