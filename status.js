/* DYSON status.js — 24-hour status updates (photo, video, text), viewer, highlights, privacy. */
(function () {
  const { h, $, sb } = D;
  const BG = { b1: 'linear-gradient(135deg,#1f5dff,#34d0ff)', b2: 'linear-gradient(135deg,#7a5cff,#e15bff)', b3: 'linear-gradient(135deg,#ff6a2b,#ffb02e)', b4: 'linear-gradient(135deg,#0fb07a,#7be0a4)', b5: 'linear-gradient(135deg,#f0397d,#ff9a62)', b6: 'linear-gradient(135deg,#0b1840,#2a6bff)' };
  const St = (D.status = { groups: [], mine: null });
  D.statusBg = BG;

  St.load = async () => {
    try {
      const { data, error } = await sb.rpc('get_statuses');
      if (error) throw error;
      const by = new Map();
      (data || []).forEach((s) => { if (!by.has(s.user_id)) by.set(s.user_id, { uid: s.user_id, p: s, items: [] }); by.get(s.user_id).items.push(s); });
      St.mine = by.get(D.uid) || null;
      St.groups = [...by.values()].filter((g) => g.uid !== D.uid).sort((a, b) => (a.items.every((x) => x.viewed) - b.items.every((x) => x.viewed)) || +new Date(b.items.at(-1).created_at) - +new Date(a.items.at(-1).created_at));
      D.setBadge('status', St.groups.filter((g) => g.items.some((x) => !x.viewed)).length);
      D.emit('status:loaded');
    } catch (e) { console.warn('status', e); }
  };
  D.on('status:new', D.debounce(St.load, 700));

  const when = (d) => D.fmtDay(d) + ' at ' + D.fmtTime(d);
  const ring = (g, size = 'md') => h('span', { class: 'ring' + (g.items.every((x) => x.viewed) ? ' seen' : '') }, D.avatar(g.p, size));

  /* ---------- strip used on Home ---------- */
  St.strip = () => {
    const box = h('div', { class: 'stories' });
    const paint = () => {
      const me = St.mine;
      box.replaceChildren(
        h('button', { class: 'story', type: 'button', onclick: () => (me ? St.view([me], 0) : St.compose()) }, h('span', { class: 'ring' + (me ? '' : ' seen'), style: { position: 'relative' } }, D.avatar(D.me, 'lg'), h('span', { class: 'plus' }, D.ic('plus'))), h('span', { class: 'n' }, 'My status')),
        ...St.groups.map((g, i) => h('button', { class: 'story', type: 'button', onclick: () => St.view(St.groups, i) }, ring(g, 'lg'), h('span', { class: 'n' }, (D.contacts.name(g.uid) || g.p.full_name).split(' ')[0]))));
    };
    paint(); const off = D.on('status:loaded', paint); box._off = off;
    return box;
  };

  /* ---------- compose ---------- */
  St.compose = () => {
    const sh = D.sheet(h('div', { class: 'quick-grid two' },
      h('button', { class: 'quick', type: 'button', onclick: () => { sh.close(); text(); } }, h('span', {}, D.ic('type')), 'Text'),
      h('button', { class: 'quick', type: 'button', onclick: async () => { sh.close(); const [f] = await D.pickFile('image/*,video/*'); if (f) media(f); } }, h('span', {}, D.ic('image')), 'Photo / video'),
      h('button', { class: 'quick', type: 'button', onclick: async () => { sh.close(); const [f] = await D.pickFile('image/*', false, 'environment'); if (f) media(f); } }, h('span', {}, D.ic('camera')), 'Camera')), { title: 'New status' });
  };
  function text() {
    let bg = 'b1';
    const t = h('textarea', { class: 'st-text', placeholder: 'Type a status', maxlength: 240, rows: 5 });
    const prev = h('div', { class: 'st-compose', style: { background: BG[bg] } }, t);
    const sw = h('div', { class: 'swatches' }, Object.keys(BG).map((k) => h('button', { type: 'button', class: 'swatch' + (k === bg ? ' on' : ''), 'aria-label': 'Background ' + k, style: { background: BG[k] }, onclick: (e) => { bg = k; prev.style.background = BG[k]; D.$$('.swatch', sw).forEach((s) => s.classList.toggle('on', s === e.currentTarget)); } })));
    const go = h('button', { class: 'btn btn-primary', type: 'button' }, 'Post status');
    const mo = D.modal({ title: 'Text status', body: [prev, sw], actions: [h('button', { class: 'btn', type: 'button', onclick: () => mo.close() }, 'Cancel'), go] });
    go.onclick = async () => {
      const v = t.value.trim(); if (!v) return D.toast('Write something first.', 'info');
      D.busy(go, true, 'Posting…');
      const { error } = await sb.from('statuses').insert({ user_id: D.uid, status_type: 'text', content: v, bg });
      if (error) { D.busy(go, false); return D.toast(D.err(error), 'error'); }
      mo.close(); D.toast('Status posted', 'success'); St.load();
    };
  }
  function media(f) {
    if (f.size > 40 * 1024 * 1024) return D.toast('Max 40 MB.', 'error');
    const isV = f.type.startsWith('video/'), u = URL.createObjectURL(f);
    const cap = h('input', { class: 'input', placeholder: 'Add a caption…', maxlength: 200 });
    const go = h('button', { class: 'btn btn-primary', type: 'button' }, 'Post status');
    const mo = D.modal({ title: 'Post status', body: [h('div', { class: 'prev-grid one' }, h('div', { class: 'prev-i' }, isV ? h('video', { src: u, controls: '', muted: '', playsinline: '' }) : h('img', { src: u, alt: '' }))), cap], actions: [h('button', { class: 'btn', type: 'button', onclick: () => mo.close() }, 'Cancel'), go] });
    go.onclick = async () => {
      D.busy(go, true, 'Uploading…');
      try {
        const ext = (f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
        const path = `${D.uid}/${D.uuid()}.${ext}`; await D.upload('status-media', path, f);
        const { error } = await sb.from('statuses').insert({ user_id: D.uid, status_type: isV ? 'video' : 'image', media_path: path, media_mime: f.type, caption: cap.value.trim() || null });
        if (error) throw error; mo.close(); D.toast('Status posted', 'success'); St.load();
      } catch (e) { D.busy(go, false); D.toast(D.err(e), 'error'); }
    };
  }

  /* ---------- viewer ---------- */
  St.view = (groups, gi, startItem = 0) => {
    let g = groups[gi], ii = startItem, timer = null, t0 = 0, dur = 5000, paused = false, elapsed = 0, vid = null;
    const bars = h('div', { class: 'sv-bars' }), body = h('div', { class: 'sv-body' }), head = h('div', { class: 'sv-head' }), foot = h('div', { class: 'sv-foot' });
    const el = h('div', { class: 'sv', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Status viewer' }, h('div', { class: 'sv-card' }, bars, head, body, foot,
      h('button', { class: 'sv-nav l', type: 'button', 'aria-label': 'Previous', onclick: () => step(-1) }), h('button', { class: 'sv-nav r', type: 'button', 'aria-label': 'Next', onclick: () => step(1) })));
    const key = (e) => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); };
    const close = () => { clearInterval(timer); el.remove(); document.removeEventListener('keydown', key); St.load(); };
    document.addEventListener('keydown', key); document.body.append(el);
    ['pointerdown'].forEach((e) => body.addEventListener(e, () => { paused = true; if (vid) vid.pause(); }));
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((e) => body.addEventListener(e, () => { paused = false; if (vid) vid.play().catch(() => {}); }));

    function step(d) {
      ii += d;
      if (ii < 0) { if (gi > 0) { gi--; g = groups[gi]; ii = g.items.length - 1; } else ii = 0; }
      else if (ii >= g.items.length) { if (gi < groups.length - 1) { gi++; g = groups[gi]; ii = 0; } else return close(); }
      show();
    }
    async function show() {
      clearInterval(timer); elapsed = 0; vid = null;
      const s = g.items[ii], mineS = g.uid === D.uid;
      bars.replaceChildren(...g.items.map((_, i) => h('i', {}, h('b', { style: { width: i < ii ? '100%' : '0%' } }))));
      head.replaceChildren(D.avatar(g.p, 'sm'), h('div', {}, h('b', {}, mineS ? 'My status' : (D.contacts.name(g.uid) || g.p.full_name)), h('small', {}, when(s.created_at))), h('span', { class: 'grow' }),
        mineS ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'More', onclick: (e) => { paused = true; D.popMenu([
          { icon: 'bookmark', label: s.highlight ? 'Remove from highlights' : 'Add to profile highlights', fn: async () => { const { error } = await sb.from('statuses').update({ highlight: !s.highlight }).eq('id', s.id); if (error) return D.toast(D.err(error), 'error'); s.highlight = !s.highlight; D.toast(s.highlight ? 'Added to highlights' : 'Removed', 'success'); } },
          { icon: 'trash', label: 'Delete this update', danger: 1, fn: async () => { if (!(await D.confirm('Delete status?', 'This update will be removed.', 'Delete', true))) return; const { error } = await sb.from('statuses').delete().eq('id', s.id); if (error) return D.toast(D.err(error), 'error'); if (s.media_path) sb.storage.from('status-media').remove([s.media_path]); g.items.splice(ii, 1); if (!g.items.length) return close(); ii = Math.min(ii, g.items.length - 1); show(); } }], e.currentTarget); setTimeout(() => { paused = false; }, 4000); } }, D.ic('more')) : '',
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: close }, D.ic('x')));
      const done = () => { dur = 5000; };
      if (s.status_type === 'text') {
        body.replaceChildren(h('div', { class: 'sv-text', style: { background: BG[s.bg] || BG.b1 } }, h('p', {}, s.content))); dur = Math.min(12000, 4000 + (s.content || '').length * 60);
      } else {
        const url = await D.mediaUrl('status-media', s.media_path);
        if (g.items[ii] !== s) return;
        if (s.status_type === 'video') { vid = h('video', { src: url, autoplay: '', playsinline: '' }); vid.onloadedmetadata = () => { dur = Math.min(30000, (vid.duration || 8) * 1000); }; vid.onended = () => step(1); body.replaceChildren(vid, s.caption ? h('p', { class: 'sv-cap' }, s.caption) : ''); }
        else { body.replaceChildren(h('img', { src: url, alt: 'Status' }), s.caption ? h('p', { class: 'sv-cap' }, s.caption) : ''); done(); }
      }
      foot.replaceChildren(mineS ? viewsFooter(s) : replyFooter(s));
      if (!mineS && !s.viewed) { sb.from('status_views').upsert({ status_id: s.id, viewer_id: D.uid }).then(() => {}); s.viewed = true; }
      t0 = Date.now();
      timer = setInterval(() => {
        if (paused) { t0 = Date.now() - elapsed; return; }
        elapsed = Date.now() - t0; const b = bars.children[ii] && bars.children[ii].firstChild; if (b) b.style.width = Math.min(100, (elapsed / dur) * 100) + '%';
        if (elapsed >= dur && !(vid && !vid.ended && s.status_type === 'video')) step(1);
      }, 60);
    }
    function viewsFooter(s) {
      return h('button', { class: 'sv-views', type: 'button', onclick: async () => {
        paused = true;
        const { data } = await sb.from('status_views').select('viewer_id,viewed_at').eq('status_id', s.id).order('viewed_at', { ascending: false });
        const ids = (data || []).map((v) => v.viewer_id), { data: ps } = ids.length ? await sb.from('profiles').select('id,full_name,username,avatar_url').in('id', ids) : { data: [] };
        const pm = new Map((ps || []).map((p) => [p.id, p]));
        const sh = D.sheet(h('div', { class: 'rows' }, ids.length ? data.map((v) => { const p = pm.get(v.viewer_id) || { full_name: 'Someone' }; return h('div', { class: 'row' }, D.avatar(p, 'sm'), h('div', { class: 'row-b' }, h('b', {}, p.full_name), h('small', {}, D.fmtTime(v.viewed_at)))); }) : [D.empty('eye', 'No views yet', '')]), { title: `Viewed by ${ids.length}`, onClose: () => { paused = false; } });
      } }, D.ic('eye', 'sm'), (s.view_count || 0) + ' views');
    }
    function replyFooter(s) {
      const inp = h('input', { class: 'input', placeholder: 'Reply to status…', maxlength: 500 });
      inp.addEventListener('focus', () => { paused = true; }); inp.addEventListener('blur', () => { paused = false; });
      const send = async (txt) => {
        try {
          const { data: cid, error } = await sb.rpc('start_direct_conversation', { other_user_id: g.uid }); if (error) throw error;
          const { error: e2 } = await sb.from('messages').insert({ conversation_id: cid, sender_id: D.uid, msg_type: 'text', content: '↩️ Status: ' + txt }); if (e2) throw e2;
          D.toast('Reply sent', 'success', 1500); D.refreshChats();
        } catch (e) { D.toast(D.err(e), 'error'); }
      };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && inp.value.trim()) { send(inp.value.trim()); inp.value = ''; inp.blur(); } });
      return h('div', { class: 'sv-reply' }, inp, ...['❤️', '🔥', '😂', '👏'].map((e) => h('button', { class: 'sv-emo', type: 'button', 'aria-label': 'React ' + e, onclick: () => send(e) }, e)));
    }
    show();
  };

  /* ---------- Status page ---------- */
  D.register('status', {
    layout: 'page',
    render(ctx) {
      const list = h('div', { class: 'rows' });
      const paint = () => {
        const mine = St.mine, fresh = St.groups.filter((g) => g.items.some((x) => !x.viewed)), old = St.groups.filter((g) => g.items.every((x) => x.viewed));
        const row = (g) => h('button', { class: 'row', type: 'button', onclick: () => St.view(St.groups, St.groups.indexOf(g)) }, ring(g, 'md'), h('div', { class: 'row-b' }, h('b', {}, D.contacts.name(g.uid) || g.p.full_name), h('small', {}, when(g.items.at(-1).created_at))));
        list.replaceChildren(
          h('button', { class: 'row mine', type: 'button', onclick: () => (mine ? St.view([mine], 0) : St.compose()) }, h('span', { class: 'ring' + (mine ? '' : ' seen'), style: { position: 'relative' } }, D.avatar(D.me, 'md'), h('span', { class: 'plus' }, D.ic('plus'))),
            h('div', { class: 'row-b' }, h('b', {}, 'My Status'), h('small', {}, mine ? `${mine.items.length} update${mine.items.length > 1 ? 's' : ''} · ${when(mine.items.at(-1).created_at)}` : 'Tap to add status'))),
          h('b', { class: 'hits-h' }, 'Recent updates'),
          ...(fresh.length ? fresh.map(row) : [h('p', { class: 'hint pad' }, 'No new updates from the people you know.')]),
          old.length ? h('b', { class: 'hits-h' }, 'Viewed') : '', ...old.map(row));
        const strip = h('div', { class: 'stories big' }, ...fresh.concat(old).map((g) => h('button', { class: 'story', type: 'button', onclick: () => St.view(St.groups, St.groups.indexOf(g)) }, ring(g, 'lg'), h('span', { class: 'n' }, (D.contacts.name(g.uid) || g.p.full_name).split(' ')[0]))));
        hero.replaceChildren(...(St.groups.length ? [strip] : []));
      };
      const hero = h('div', {});
      const menu = (e) => D.popMenu([
        { icon: 'refresh', label: 'Refresh', fn: () => St.load() },
        { icon: 'lock', label: 'Who can see my status', fn: privacy },
        { icon: 'trash', label: 'Delete all my updates', danger: 1, fn: async () => { if (!St.mine) return D.toast('You have no updates.', 'info'); if (!(await D.confirm('Delete all updates?', 'Everything you posted in the last 24 hours will be removed.', 'Delete', true))) return; const paths = St.mine.items.map((x) => x.media_path).filter(Boolean); const { error } = await sb.from('statuses').delete().eq('user_id', D.uid); if (error) return D.toast(D.err(error), 'error'); if (paths.length) sb.storage.from('status-media').remove(paths); St.load(); } },
      ], e.currentTarget);
      ctx.stage.replaceChildren(h('div', { class: 'page narrow' }, D.vhead({ title: D.t('Status'), sub: 'Disappears after 24 hours', back: true, actions: [h('button', { class: 'icon-btn ring', type: 'button', 'aria-label': 'Add status', onclick: St.compose }, D.ic('plus')), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Status menu', onclick: menu }, D.ic('more'))] }), hero, list),
        h('button', { class: 'fab', type: 'button', 'aria-label': 'New status', onclick: St.compose }, D.ic('camera')));
      paint(); St.load(); this._o = [D.on('status:loaded', paint)];
    },
    leave() { (this._o || []).forEach((f) => f && f()); },
  });

  async function privacy() {
    const { data } = await sb.from('status_privacy').select('audience').eq('user_id', D.uid).maybeSingle();
    let cur = (data && data.audience) || 'shared';
    const opts = [['shared', 'People I chat with, contacts & followers'], ['contacts', 'Only people in my contacts'], ['nobody', 'Nobody (hidden)']];
    const sh = D.sheet(h('div', { class: 'rows' }, opts.map(([v, l]) => h('button', { class: 'row', type: 'button', onclick: async () => { const { error } = await sb.from('status_privacy').upsert({ user_id: D.uid, audience: v }); if (error) return D.toast(D.err(error), 'error'); sh.close(); D.toast('Status privacy updated', 'success'); } },
      h('div', { class: 'row-b' }, h('b', {}, l)), v === cur ? D.ic('check') : ''))), { title: 'Who can see my status' });
  }
  D.statusPrivacy = privacy;
})();
