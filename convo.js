/* DYSON convo.js — one conversation (direct chat, group or community): messages, media, voice notes,
   reactions, replies, edit/delete/forward/pin, read receipts, typing, in-chat search. */
(function () {
  const { h, $, sb } = D;
  const COLS = 'id,conversation_id,sender_id,content,created_at,reply_to,msg_type,caption,media_path,media_mime,media_name,media_size,duration_ms,edited_at,deleted_at,meta';
  const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
  const MAX_UPLOAD = 50 * 1024 * 1024;
  const urls = new Map();
  const prefetch = async (msgs) => {
    await Promise.all(msgs.filter((m) => m.media_path && !urls.has(m.media_path)).map(async (m) => { const u = await D.mediaUrl('chat-media', m.media_path); if (u) urls.set(m.media_path, u); }));
  };
  D.chatUrl = (path) => urls.get(path);

  /* ---------- fullscreen media viewer ---------- */
  D.viewMedia = ({ url, type, name }) => {
    const close = () => { v.remove(); document.removeEventListener('keydown', k); };
    const k = (e) => { if (e.key === 'Escape') close(); };
    const v = h('div', { class: 'viewer', onclick: (e) => { if (e.target === v) close(); } },
      type === 'video' ? h('video', { src: url, controls: '', autoplay: '', playsinline: '' }) : h('img', { src: url, alt: name || 'Photo' }),
      h('a', { class: 'icon-btn dl', href: url, download: name || 'media', target: '_blank', rel: 'noopener', 'aria-label': 'Download' }, D.ic('download')),
      h('button', { class: 'icon-btn x', type: 'button', 'aria-label': 'Close', onclick: close }, D.ic('x')));
    document.body.append(v); document.addEventListener('keydown', k);
  };

  /* ---------- smart replies (local heuristics) ---------- */
  const smartFor = (t) => {
    t = (t || '').trim(); const l = t.toLowerCase();
    if (!t) return [];
    if (/\b(thanks|thank you|thx|asante|merci)\b/.test(l)) return ['You’re welcome! 😊', 'Anytime!', 'No problem 👍'];
    if (/\b(hi|hello|hey|good (morning|evening|afternoon))\b/.test(l) && t.length < 40) return ['Hey! 👋', 'Hi, how are you?', 'Good to hear from you!'];
    if (/(how are you|how's it going|how are things)/.test(l)) return ['Doing great, you?', 'All good here 🙂', 'Busy but good!'];
    if (/(call|join|meet|meeting)\b.*\?|\?.*(call|meet)/.test(l)) return ['Sounds perfect!', 'Give me 10 minutes', 'Can we do later?'];
    if (/(what time|when)\b.*\?/.test(l)) return ['Does 5pm work?', 'Anytime today works', 'Let me check and confirm'];
    if (/(send|share).*(file|photo|doc|picture|link)/.test(l)) return ['Sending now 📎', 'One moment', 'Which one exactly?'];
    if (/\?\s*$/.test(t)) return ['Yes 👍', 'Not sure yet', 'Let me check'];
    if (/(congrat|well done|great job|awesome)/.test(l)) return ['Thank you! 🎉', 'Thanks, means a lot!', 'Couldn’t have done it without you'];
    if (/(sorry|apolog)/.test(l)) return ['No worries', 'It’s okay 🙂', 'Thanks for telling me'];
    return ['👍', 'Sounds good!', 'Okay, noted'];
  };

  /* ---------- the conversation component ---------- */
  D.Conv = function (host, c, opts) {
    const id = c.conversation_id, kind = c.kind, direct = kind === 'direct';
    const st = { msgs: [], by: new Map(), reacts: new Map(), receipt: null, reply: null, edit: null, typingAt: 0, blocked: false, more: true, hits: [], hi: -1, meta: {}, people: new Map(), member: c.joined !== false, newCount: 0 };
    let destroyed = false, rec = null, typingCh = null, sentTyping = 0, emojiOpen = null;
    D.activeConv = id;

    /* --- skeleton --- */
    const nameEl = h('b', {}), subEl = h('small', {});
    const whoBtn = h('button', { class: 'who', type: 'button', onclick: () => opts.onInfo && opts.onInfo(), 'aria-label': 'Open details' });
    const paintHead = () => {
      const cur = D.store.convs.find((x) => x.conversation_id === id) || c;
      nameEl.replaceChildren(D.nm(cur), direct ? D.verified(cur) : '');
      let sub = '', off = false;
      if (direct) {
        const p = D.store.presence[c.other_id];
        if (Date.now() < st.typingAt) sub = 'typing…';
        else if (p && p.online) sub = 'Online';
        else { sub = p && p.last_seen ? D.fmtSeen(p.last_seen) : 'Offline'; off = true; }
      } else {
        const n = cur.member_count || c.member_count;
        sub = (Date.now() < st.typingAt ? 'someone is typing…' : (n ? D.compact(n) + ' members' : kind === 'community' ? 'Community' : 'Group'));
        off = Date.now() >= st.typingAt;
      }
      subEl.textContent = sub; subEl.className = off ? 'off' : '';
      whoBtn.replaceChildren(D.chatAvatar(cur, 'md'), h('span', {}, nameEl, subEl));
    };
    const searchBar = h('div', { class: 'in-search', hidden: '' });
    const headActs = h('div', { class: 'chat-acts' });
    const moreBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'More options', onclick: (e) => moreMenu(e.currentTarget) }, D.ic('more'));
    if (direct) {
      headActs.append(
        h('button', { class: 'icon-btn ring', type: 'button', 'aria-label': 'Video call', title: 'Video call', onclick: () => D.calls.start(peerObj(), true) }, D.ic('video')),
        h('button', { class: 'icon-btn ring', type: 'button', 'aria-label': 'Voice call', title: 'Voice call', onclick: () => D.calls.start(peerObj(), false) }, D.ic('phone')));
    }
    headActs.append(h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Search in chat', onclick: toggleSearch }, D.ic('search')), moreBtn);
    const head = h('header', { class: 'chat-head' },
      h('button', { class: 'icon-btn back', type: 'button', 'aria-label': 'Back', onclick: () => opts.onBack && opts.onBack() }, D.ic('back')), whoBtn, headActs);
    const pinBar = h('button', { class: 'pinbar', type: 'button', hidden: '' });
    const list = h('div', { class: 'msgs', role: 'log', 'aria-live': 'polite', 'aria-label': 'Messages' });
    const scrollBtn = h('button', { class: 'scroll-btn', type: 'button', hidden: '', 'aria-label': 'Scroll to latest', onclick: () => { scrollDown(true); } }, D.ic('chevron-down'));
    const smart = h('div', { class: 'smart', hidden: '' });
    const replyBar = h('div', { class: 'replybar', hidden: '' });
    const input = h('textarea', { rows: 1, placeholder: 'Type a message…', maxlength: 4000, 'aria-label': 'Message' });
    const sendBtn = h('button', { class: 'send rec', type: 'button', 'aria-label': 'Voice message' }, D.ic('mic'));
    const emojiBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Emoji', onclick: toggleEmoji }, D.ic('smile'));
    const attachBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Attach', onclick: (e) => attachMenu(e.currentTarget) }, D.ic('clip'));
    const composer = h('div', { class: 'composer' }, h('div', { class: 'field-wrap' }, attachBtn, input, emojiBtn), sendBtn);
    const quick = h('div', { class: 'qa' },
      qa('smile', 'Emoji', toggleEmoji), qa('clip', 'Attach', () => attachMenu(attachBtn)), qa('mic', 'Voice', () => startRec()),
      qa('camera', 'Photo', () => pick('image/*,video/*')), qa('file', 'File', () => pick('')));
    function qa(icon, label, fn) { return h('button', { type: 'button', onclick: fn }, D.ic(icon), label); }
    const foot = h('div', { class: 'chat-foot' });
    const root = h('div', { class: 'chat' }, head, searchBar, pinBar, list, scrollBtn, smart, replyBar, quick, foot);
    host.replaceChildren(root);
    paintHead();

    const peerObj = () => ({ id: c.other_id, full_name: D.nm(c), avatar_url: c.other_avatar });
    const sName = (uid) => (uid === D.uid ? 'You' : (direct ? D.nm(c) : (st.people.get(uid) || {}).full_name || 'Member'));

    /* --- footer: composer / join / blocked bar --- */
    function paintFoot() {
      if (!st.member) {
        const b = h('button', { class: 'btn btn-primary btn-pill', type: 'button', onclick: async () => {
          D.busy(b, true, 'Joining…');
          const { error } = await sb.rpc('join_community', { cid: id });
          if (error) { D.busy(b, false); return D.toast(D.err(error), 'error'); }
          D.toast('Joined community', 'success'); await D.loadChats(); st.member = true; paintFoot(); D.emit('joined', id);
        } }, 'Join community to post');
        foot.replaceChildren(h('div', { class: 'foot-bar' }, h('span', { class: 'muted' }, 'You are previewing this community.'), b)); return;
      }
      if (st.blocked) {
        foot.replaceChildren(h('div', { class: 'foot-bar' }, h('span', { class: 'muted' }, `You blocked ${D.nm(c)}.`), h('button', { class: 'btn btn-sm', type: 'button', onclick: async () => { await sb.from('blocks').delete().eq('blocker_id', D.uid).eq('blocked_id', c.other_id); st.blocked = false; D.toast('Unblocked', 'success'); paintFoot(); D.emit('blockchange'); } }, 'Unblock'))); return;
      }
      foot.replaceChildren(composer);
    }

    /* --- rendering --- */
    const nearBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 140;
    const scrollDown = (smoothly) => { list.scrollTo({ top: list.scrollHeight, behavior: smoothly ? 'smooth' : 'auto' }); st.newCount = 0; scrollBtn.hidden = true; };
    const isRead = (m) => direct && st.receipt && m.sender_id === D.uid && new Date(m.created_at) <= new Date(st.receipt);
    const preview = (m) => !m ? 'Message' : m.deleted_at ? 'Deleted message' : m.msg_type === 'image' ? '📷 Photo' : m.msg_type === 'video' ? '🎬 Video' : m.msg_type === 'audio' ? (m.meta && m.meta.voice ? '🎤 Voice message' : '🎵 Audio') : m.msg_type === 'file' ? '📎 ' + (m.media_name || 'File') : m.content;

    function bodyOf(m) {
      if (m.deleted_at) return [h('p', {}, 'This message was deleted')];
      const out = [], url = urls.get(m.media_path);
      const lazy = (el, attr = 'src') => { if (url) el[attr] = url; else if (m.media_path) D.mediaUrl('chat-media', m.media_path).then((u) => { if (u) { urls.set(m.media_path, u); el[attr] = u; } }); return el; };
      if (m.msg_type === 'image') out.push(lazy(h('img', { alt: m.media_name || 'Photo', loading: 'lazy', onclick: (e) => D.viewMedia({ url: e.target.src, name: m.media_name }) })));
      else if (m.msg_type === 'video') out.push(lazy(h('video', { controls: '', preload: 'metadata', playsinline: '' })));
      else if (m.msg_type === 'audio' && m.meta && m.meta.voice) out.push(voiceNote(m));
      else if (m.msg_type === 'audio') out.push(lazy(h('audio', { controls: '', preload: 'none', style: { width: '240px', maxWidth: '100%' } })));
      else if (m.msg_type === 'file') out.push(fileCard(m, url));
      if (m.msg_type && m.msg_type !== 'text') { if (m.caption) out.push(h('p', { class: 'cap' }, D.linkify(m.caption))); }
      else out.push(h('p', {}, D.linkify(m.content || '')));
      return out;
    }
    function fileCard(m, url) {
      const a = h('a', { class: 'fcard', href: url || '#', target: '_blank', rel: 'noopener', download: m.media_name || 'file' }, h('span', { class: 'fi' }, D.ic('file')), h('span', {}, h('b', {}, m.media_name || 'File'), h('small', {}, D.bytes(m.media_size))), D.ic('download', 'sm'));
      if (!url && m.media_path) D.mediaUrl('chat-media', m.media_path).then((u) => { if (u) { urls.set(m.media_path, u); a.href = u; } });
      return a;
    }
    function voiceNote(m) {
      const peaks = (m.meta && m.meta.peaks && m.meta.peaks.length ? m.meta.peaks : [.3, .6, .4, .8, .5, .9, .4, .7, .3, .6, .8, .5, .4, .7, .5, .3]);
      const bars = peaks.map((p) => h('i', { style: { height: Math.max(12, Math.round(p * 100)) + '%' } }));
      const play = h('button', { class: 'vplay', type: 'button', 'aria-label': 'Play voice message' }, D.ic('play', 'sm'));
      const time = h('span', { class: 'vtime' }, D.clock((m.duration_ms || 0) / 1000));
      let au = null;
      const paint = (p) => bars.forEach((b, i) => b.classList.toggle('on', i / bars.length <= p));
      const toggle = async () => {
        if (!au) {
          const u = urls.get(m.media_path) || await D.mediaUrl('chat-media', m.media_path); if (!u) return D.toast('Could not load audio', 'error');
          au = new Audio(u);
          au.ontimeupdate = () => { paint(au.currentTime / (au.duration || (m.duration_ms / 1000) || 1)); time.textContent = D.clock(au.currentTime); };
          au.onended = () => { paint(0); play.replaceChildren(D.ic('play', 'sm')); time.textContent = D.clock((m.duration_ms || 0) / 1000); };
        }
        if (D._aud && D._aud !== au) { D._aud.pause(); D.$$('.vplay').forEach((p) => { if (p !== play) p.replaceChildren(D.ic('play', 'sm')); }); }
        D._aud = au;
        if (au.paused) { await au.play().catch(() => {}); play.replaceChildren(D.ic('pause', 'sm')); } else { au.pause(); play.replaceChildren(D.ic('play', 'sm')); }
      };
      play.onclick = toggle;
      const wave = h('div', { class: 'vwave', onclick: (e) => { if (!au) return toggle(); const r = e.currentTarget.getBoundingClientRect(); au.currentTime = ((e.clientX - r.left) / r.width) * (au.duration || 0); } }, bars);
      return h('div', { class: 'vnote' }, play, wave, time);
    }

    function node(m, prev) {
      const mine = m.sender_id === D.uid, media = ['image', 'video'].includes(m.msg_type) && !m.deleted_at;
      const newGroup = !prev || prev.sender_id !== m.sender_id || new Date(m.created_at) - new Date(prev.created_at) > 5 * 60e3;
      const q = m.reply_to ? st.by.get(m.reply_to) : null;
      const rx = st.reacts.get(m.id) || [];
      const grouped = {}; rx.forEach((r) => { (grouped[r.emoji] = grouped[r.emoji] || []).push(r.user_id); });
      const bubble = h('div', { class: 'bubble' + (media ? ' media' : '') + (m.deleted_at ? ' deleted' : ''), 'data-id': m.id },
        !mine && !direct && newGroup ? h('span', { class: 'from', style: { color: `hsl(${D.hue(sName(m.sender_id))} 80% 70%)` } }, sName(m.sender_id)) : '',
        m.reply_to && !m.deleted_at ? h('button', { class: 'quote', type: 'button', onclick: () => jump(m.reply_to) }, h('b', {}, q ? sName(q.sender_id) : 'Reply'), h('span', {}, q ? preview(q) : 'Original message')) : '',
        ...bodyOf(m),
        Object.keys(grouped).length ? h('div', { class: 'reacts' }, Object.entries(grouped).map(([e, us]) => h('button', { class: 'react' + (us.includes(D.uid) ? ' mine' : ''), type: 'button', onclick: () => react(m, e) }, e + (us.length > 1 ? ' ' + us.length : '')))) : '',
        h('div', { class: 'meta' }, m.edited_at && !m.deleted_at ? h('span', {}, 'edited') : '', h('time', {}, D.fmtTime(m.created_at)),
          mine && !m.deleted_at ? D.ic(isRead(m) ? 'check-double' : direct ? 'check' : 'check', isRead(m) ? 'read' : '') : ''),
        !m.deleted_at ? h('button', { class: 'mact', type: 'button', 'aria-label': 'Message options', onclick: (e) => { e.stopPropagation(); msgSheet(m); } }, D.ic('chevron-down', 'sm')) : '');
      let lp; // long-press on touch
      bubble.addEventListener('touchstart', () => { lp = setTimeout(() => msgSheet(m), 480); }, { passive: true });
      ['touchend', 'touchmove', 'touchcancel'].forEach((ev) => bubble.addEventListener(ev, () => clearTimeout(lp), { passive: true }));
      bubble.addEventListener('contextmenu', (e) => { e.preventDefault(); msgSheet(m); });
      return h('div', { class: 'msg ' + (mine ? 'sent' : 'recv') + (newGroup ? ' first' : ''), id: 'm-' + m.id },
        !mine && !direct ? (newGroup ? D.avatar(st.people.get(m.sender_id) || { full_name: sName(m.sender_id) }, 'xs') : h('span', { style: { width: '28px', flex: 'none' } })) : '', bubble);
    }

    function draw(keep) {
      const bottom = nearBottom(), before = list.scrollHeight - list.scrollTop;
      const frag = document.createDocumentFragment();
      if (st.more && st.msgs.length) frag.append(h('button', { class: 'btn btn-sm earlier', type: 'button', onclick: loadEarlier }, 'Load earlier messages'));
      if (kind === 'community' && !st.more) frag.append(intro());
      let prev = null, lastDay = '';
      st.msgs.forEach((m) => {
        const d = new Date(m.created_at).toDateString();
        if (d !== lastDay) { frag.append(h('div', { class: 'day' }, D.fmtDay(m.created_at))); lastDay = d; prev = null; }
        frag.append(node(m, prev)); prev = m;
      });
      if (!st.msgs.length) frag.append(h('div', { class: 'chat-empty' }, D.empty('chat', direct ? 'Say hello 👋' : 'No messages yet', direct ? `Send the first message to ${D.nm(c)}.` : 'Be the first to post here.')));
      if (Date.now() < st.typingAt) frag.append(h('div', { class: 'typing' }, h('i'), h('i'), h('i')));
      list.replaceChildren(frag);
      if (keep === 'top') list.scrollTop = list.scrollHeight - before; else if (bottom || keep === 'bottom') list.scrollTop = list.scrollHeight;
      paintSmart(); paintPin(); markHits();
    }
    function intro() {
      const cur = D.store.convs.find((x) => x.conversation_id === id) || c;
      return h('div', { class: 'intro-card' }, D.avatar({ full_name: D.nm(cur), avatar_url: cur.avatar_url }, 'xl'), h('h3', {}, D.nm(cur)), h('p', { class: 'muted' }, st.meta.description || c.description || 'Welcome to the community.'));
    }
    function paintSmart() {
      const last = st.msgs[st.msgs.length - 1];
      if (!D.prefs.data.smartReplies || !D.prefs.data.aiOn || !st.member || st.blocked || !last || last.sender_id === D.uid || last.deleted_at || last.msg_type !== 'text') { smart.hidden = true; return; }
      const s = smartFor(last.content);
      smart.replaceChildren(h('span', { class: 'smart-l' }, D.ic('spark', 'sm')), ...s.map((t) => h('button', { type: 'button', onclick: () => { input.value = t; input.focus(); paintSend(); } }, t)));
      smart.hidden = !s.length;
    }
    function paintPin() {
      const pm = st.meta.pinned_message && st.by.get(st.meta.pinned_message);
      if (!pm) { pinBar.hidden = true; return; }
      pinBar.replaceChildren(D.ic('pin', 'sm'), h('span', {}, h('b', {}, 'Pinned message'), h('small', {}, preview(pm))));
      pinBar.onclick = () => jump(pm.id); pinBar.hidden = false;
    }
    function jump(mid) {
      const el = $('#m-' + mid, list); if (!el) return D.toast('Load earlier messages to see that one.', 'info');
      el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1400);
    }

    /* --- data --- */
    async function loadReacts(ids) {
      if (!ids.length) return;
      const { data } = await sb.from('message_reactions').select('message_id,user_id,emoji').in('message_id', ids);
      (data || []).forEach((r) => { const a = st.reacts.get(r.message_id) || []; if (!a.some((x) => x.user_id === r.user_id && x.emoji === r.emoji)) a.push(r); st.reacts.set(r.message_id, a); });
    }
    async function load(before) {
      let q = sb.from('messages').select(COLS).eq('conversation_id', id).order('created_at', { ascending: false }).limit(60);
      if (before) q = q.lt('created_at', before);
      const { data, error } = await q; if (error) throw error;
      const rows = (data || []).reverse(); st.more = (data || []).length === 60;
      rows.forEach((m) => { if (!st.by.has(m.id)) { st.by.set(m.id, m); } });
      st.msgs = [...st.by.values()].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      const need = [...new Set(rows.map((m) => m.reply_to).filter((x) => x && !st.by.has(x)))];
      if (need.length) { const { data: rq } = await sb.from('messages').select(COLS).in('id', need); (rq || []).forEach((m) => st.by.set(m.id, m)); }
      await Promise.all([loadReacts(rows.map((m) => m.id)), prefetch(rows)]);
    }
    async function loadEarlier() {
      const first = st.msgs[0]; if (!first) return;
      try { await load(first.created_at); draw('top'); } catch (e) { D.toast(D.err(e), 'error'); }
    }
    async function init() {
      list.replaceChildren(D.spinner());
      paintFoot();
      try {
        const [meta, ppl, mem, prof] = await Promise.all([
          sb.from('conversations').select('pinned_message,description,cover_url,created_by,is_public').eq('id', id).maybeSingle(),
          kind !== 'direct' ? sb.rpc('conversation_people', { cid: id }) : Promise.resolve({ data: [] }),
          direct ? sb.from('conversation_members').select('user_id,receipt_at').eq('conversation_id', id) : Promise.resolve({ data: [] }),
          direct ? sb.rpc('get_profile', { uid: c.other_id }) : Promise.resolve({ data: [] }),
        ]);
        st.meta = meta.data || {};
        (ppl.data || []).forEach((p) => st.people.set(p.user_id, p));
        if (direct) { const o = (mem.data || []).find((x) => x.user_id !== D.uid); st.receipt = o && o.receipt_at; st.blocked = !!(prof.data && prof.data[0] && prof.data[0].blocked); }
        await load();
        paintFoot(); draw('bottom'); paintHead();
        if (st.member) markRead();
        listenTyping();
      } catch (e) { console.error(e); list.replaceChildren(D.empty('alert', 'Could not load messages', D.err(e))); }
    }
    function markRead() {
      if (!st.member || document.hidden) return;
      sb.rpc('mark_read', { cid: id }).then(() => D.refreshChats());
    }

    /* --- sending --- */
    function add(m) {
      if (st.by.has(m.id)) { st.by.set(m.id, Object.assign(st.by.get(m.id), m)); } else st.by.set(m.id, m);
      st.msgs = [...st.by.values()].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    }
    async function insert(row) {
      row = Object.assign({ conversation_id: id, sender_id: D.uid }, row);
      if (st.reply) { row.reply_to = st.reply.id; }
      const { data, error } = await sb.from('messages').insert(row).select(COLS).single();
      if (error) throw error;
      st.reply = null; paintReply();
      await prefetch([data]); add(data); draw('bottom'); D.refreshChats();
      return data;
    }
    async function sendText() {
      const t = input.value.trim(); if (!t) return;
      if (st.edit) {
        const m = st.edit; st.edit = null; input.value = ''; paintSend(); paintReply();
        const { data, error } = await sb.from('messages').update({ content: t, edited_at: new Date().toISOString() }).eq('id', m.id).select(COLS).single();
        if (error) return D.toast(D.err(error), 'error');
        add(data); draw(); return;
      }
      input.value = ''; autosize(); paintSend();
      try { await insert({ content: t, msg_type: 'text' }); } catch (e) { input.value = t; paintSend(); D.toast(D.err(e), 'error'); }
    }
    async function sendFile(file, extra = {}) {
      if (file.size > MAX_UPLOAD) { D.toast(`${file.name} is larger than 50 MB.`, 'error'); return null; }
      const ext = ((file.name || '').split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6) || 'bin';
      const path = `${id}/${D.uuid()}.${ext}`;
      await D.upload('chat-media', path, file);
      const t = file.type || '';
      return insert({ msg_type: t.startsWith('image/') ? 'image' : t.startsWith('video/') ? 'video' : t.startsWith('audio/') ? 'audio' : 'file', content: '', caption: extra.caption || null, media_path: path, media_mime: t, media_name: file.name, media_size: file.size, duration_ms: extra.duration || null, meta: extra.voice ? { voice: true, peaks: extra.peaks } : null });
    }
    async function pick(accept, capture) { const files = await D.pickFile(accept, true, capture); if (files.length) confirmSend(files); }
    function attachMenu(anchor) {
      D.popMenu([
        { icon: 'image', label: 'Photos & videos', fn: () => pick('image/*,video/*') },
        { icon: 'camera', label: 'Camera', fn: () => pick('image/*', 'environment') },
        { icon: 'music', label: 'Audio', fn: () => pick('audio/*') },
        { icon: 'file', label: 'Document', fn: () => pick('') },
      ], anchor);
    }
    function confirmSend(files) {
      const cap = h('input', { class: 'input', placeholder: 'Add a caption…', maxlength: 500 });
      const prev = h('div', { class: 'prev-grid' }, files.map((f) => {
        const u = URL.createObjectURL(f);
        return h('div', { class: 'prev-i' }, f.type.startsWith('image/') ? h('img', { src: u, alt: '' }) : f.type.startsWith('video/') ? h('video', { src: u, muted: '', playsinline: '' }) : h('div', { class: 'prev-f' }, D.ic('file', 'lg'), h('b', {}, f.name), h('small', {}, D.bytes(f.size))));
      }));
      const go = h('button', { class: 'btn btn-primary', type: 'button' }, 'Send');
      const mo = D.modal({ title: files.length > 1 ? `Send ${files.length} files` : 'Send attachment', body: [prev, cap], actions: [h('button', { class: 'btn', type: 'button', onclick: () => mo.close() }, 'Cancel'), go] });
      go.onclick = async () => {
        D.busy(go, true, 'Sending…');
        try { for (let i = 0; i < files.length; i++) { await sendFile(files[i], { caption: i === 0 ? cap.value.trim() : '' }); } mo.close(); }
        catch (e) { D.busy(go, false); D.toast(D.err(e), 'error'); }
      };
    }
    // drag & drop + paste images
    root.addEventListener('dragover', (e) => { if (st.member && !st.blocked) e.preventDefault(); });
    root.addEventListener('drop', (e) => { if (!st.member || st.blocked) return; e.preventDefault(); const f = [...(e.dataTransfer.files || [])]; if (f.length) confirmSend(f); });
    input.addEventListener('paste', (e) => { const f = [...(e.clipboardData.files || [])]; if (f.length) { e.preventDefault(); confirmSend(f); } });

    /* --- voice notes --- */
    async function startRec() {
      if (rec) return;
      if (!navigator.mediaDevices || !window.MediaRecorder) return D.toast('Voice recording is not supported in this browser.', 'error');
      let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch (e) { return D.toast('Allow microphone access to record.', 'error'); }
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks = [], peaks = [];
      mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      const ac = new (window.AudioContext || window.webkitAudioContext)(), an = ac.createAnalyser(); an.fftSize = 512;
      ac.createMediaStreamSource(stream).connect(an); const buf = new Uint8Array(an.fftSize);
      const t0 = Date.now(), time = h('b', {}, '0:00'), wave = h('div', { class: 'rw' });
      const bar = h('div', { class: 'rec-bar' }, h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Discard', onclick: () => stopRec(false) }, D.ic('trash')), h('span', { class: 'rdot' }), time, wave);
      composer.append(bar);
      const iv = setInterval(() => {
        an.getByteTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; s += v * v; }
        const p = Math.min(1, Math.sqrt(s / buf.length) * 4); peaks.push(p);
        wave.append(h('i', { style: { height: Math.max(8, p * 100) + '%' } })); if (wave.children.length > 80) wave.firstChild.remove();
        time.textContent = D.clock((Date.now() - t0) / 1000) .replace(/^0/, '');
      }, 90);
      rec = { mr, stream, ac, iv, bar, chunks, peaks, t0 }; mr.start(250);
      sendBtn.classList.remove('rec'); sendBtn.replaceChildren(D.ic('send')); sendBtn.setAttribute('aria-label', 'Send voice message');
      sendBtn.onclick = () => stopRec(true);
    }
    function stopRec(send) {
      if (!rec) return; const r = rec; rec = null; clearInterval(r.iv);
      const dur = (Date.now() - r.t0) / 1000;
      r.mr.onstop = async () => {
        r.stream.getTracks().forEach((t) => t.stop()); r.ac.close().catch(() => {}); r.bar.remove(); paintSend();
        if (!send) return;
        if (dur < 0.8) return D.toast('Hold on a bit longer to record.', 'info');
        const type = (r.mr.mimeType || 'audio/webm').split(';')[0], ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        const n = 36, out = []; for (let i = 0; i < n; i++) { const a = Math.floor((i * r.peaks.length) / n), b = Math.max(a + 1, Math.floor(((i + 1) * r.peaks.length) / n)); out.push(+(Math.max(...r.peaks.slice(a, b), 0.08)).toFixed(2)); }
        try { await sendFile(new File([new Blob(r.chunks, { type })], `voice.${ext}`, { type }), { voice: true, peaks: out, duration: Math.round(dur * 1000) }); } catch (e) { D.toast(D.err(e), 'error'); }
      };
      try { r.mr.stop(); } catch (e) { r.mr.onstop(); }
    }

    /* --- composer plumbing --- */
    function autosize() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 150) + 'px'; }
    function paintSend() {
      if (rec) return;
      const has = !!input.value.trim();
      sendBtn.classList.toggle('rec', !has && !st.edit);
      sendBtn.replaceChildren(D.ic(has || st.edit ? 'send' : 'mic'));
      sendBtn.setAttribute('aria-label', has ? 'Send message' : 'Record voice message');
      sendBtn.onclick = has || st.edit ? sendText : startRec;
    }
    input.addEventListener('input', () => { autosize(); paintSend(); sendTyping(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && D.prefs.data.enter && !e.isComposing && matchMedia('(pointer:fine)').matches) { e.preventDefault(); sendText(); }
      if (e.key === 'Escape') { st.reply = null; st.edit = null; paintReply(); }
    });
    paintSend();
    function toggleEmoji() {
      if (emojiOpen) { emojiOpen.remove(); emojiOpen = null; return; }
      const pop = h('div', { class: 'emoji-pop' }, D.emojiPicker((e) => {
        const s = input.selectionStart ?? input.value.length; input.value = input.value.slice(0, s) + e + input.value.slice(input.selectionEnd ?? s); input.focus(); input.selectionStart = input.selectionEnd = s + e.length; paintSend();
      }));
      root.append(pop); emojiOpen = pop;
      setTimeout(() => document.addEventListener('mousedown', function off(ev) { if (!pop.contains(ev.target) && !ev.target.closest('.composer,.qa')) { pop.remove(); emojiOpen = null; document.removeEventListener('mousedown', off); } }), 0);
    }
    function paintReply() {
      const m = st.reply || st.edit;
      if (!m) { replyBar.hidden = true; return; }
      replyBar.replaceChildren(h('div', {}, h('b', {}, st.edit ? 'Editing message' : 'Replying to ' + sName(m.sender_id)), h('span', {}, preview(m))),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Cancel', onclick: () => { st.reply = null; if (st.edit) { st.edit = null; input.value = ''; paintSend(); } paintReply(); } }, D.ic('x')));
      replyBar.hidden = false;
    }

    /* --- typing --- */
    function listenTyping() {
      typingCh = sb.channel('typing:' + id, { config: { broadcast: { self: false } } });
      let tt;
      typingCh.on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (!payload || payload.uid === D.uid) return;
        st.typingAt = Date.now() + 3500; paintHead(); const was = nearBottom(); draw(); if (was) scrollDown();
        clearTimeout(tt); tt = setTimeout(() => { st.typingAt = 0; paintHead(); draw(); }, 3600);
      }).subscribe();
    }
    function sendTyping() { if (!typingCh || !input.value.trim() || Date.now() - sentTyping < 2500) return; sentTyping = Date.now(); typingCh.send({ type: 'broadcast', event: 'typing', payload: { uid: D.uid } }); }

    /* --- message actions --- */
    async function react(m, emoji) {
      const mine = (st.reacts.get(m.id) || []).some((r) => r.user_id === D.uid && r.emoji === emoji);
      const arr = (st.reacts.get(m.id) || []).filter((r) => !(r.user_id === D.uid && r.emoji === emoji));
      if (!mine) arr.push({ message_id: m.id, user_id: D.uid, emoji });
      st.reacts.set(m.id, arr); draw();
      const q = mine ? sb.from('message_reactions').delete().match({ message_id: m.id, user_id: D.uid, emoji }) : sb.from('message_reactions').insert({ message_id: m.id, user_id: D.uid, emoji });
      const { error } = await q; if (error) { D.toast(D.err(error), 'error'); }
    }
    function msgSheet(m) {
      const mine = m.sender_id === D.uid, text = m.msg_type === 'text';
      const admin = c.role === 'admin' && !direct;
      const act = (icon, label, fn, cls = '') => h('button', { class: 'sheet-act ' + cls, type: 'button', onclick: () => { sh.close(); fn(); } }, D.ic(icon), label);
      const bar = h('div', { class: 'react-bar' }, REACTIONS.map((e) => h('button', { type: 'button', onclick: () => { sh.close(); react(m, e); } }, e)),
        h('button', { type: 'button', 'aria-label': 'More reactions', onclick: () => { sh.close(); D.emojiSheet((e) => react(m, e)); } }, '＋'));
      const sh = D.sheet([bar, h('div', { class: 'sheet-acts' },
        st.member && !st.blocked ? act('reply', 'Reply', () => { st.reply = m; st.edit = null; paintReply(); input.focus(); }) : '',
        text ? act('copy', 'Copy text', () => D.copy(m.content)) : '',
        act('forward', 'Forward', () => forwardMsg(m)),
        admin ? act('pin', st.meta.pinned_message === m.id ? 'Unpin' : 'Pin to top', () => pin(m)) : '',
        mine && text ? act('pen', 'Edit', () => { st.edit = m; st.reply = null; input.value = m.content; autosize(); paintSend(); paintReply(); input.focus(); }) : '',
        mine ? act('trash', 'Delete for everyone', async () => { if (await D.confirm('Delete message?', 'This removes it for everyone in the chat.', 'Delete', true)) del(m); }, 'danger') : '')]);
    }
    async function del(m) {
      const { data, error } = await sb.from('messages').update({ deleted_at: new Date().toISOString(), content: '', caption: null }).eq('id', m.id).select(COLS).single();
      if (error) return D.toast(D.err(error), 'error');
      add(data); draw(); D.refreshChats();
      if (m.media_path) sb.storage.from('chat-media').remove([m.media_path]);
    }
    async function pin(m) {
      const v = st.meta.pinned_message === m.id ? null : m.id;
      const { error } = await sb.from('conversations').update({ pinned_message: v }).eq('id', id);
      if (error) return D.toast(D.err(error), 'error');
      st.meta.pinned_message = v; paintPin(); D.toast(v ? 'Message pinned' : 'Unpinned', 'success');
    }
    function forwardMsg(m) {
      const q = h('input', { class: 'input', type: 'search', placeholder: 'Search chats' }), box = h('div', { class: 'rows' });
      const draw2 = () => {
        const s = q.value.trim().toLowerCase();
        const rows = D.store.convs.filter((x) => x.kind !== 'community' || x.role).filter((x) => !s || D.nm(x).toLowerCase().includes(s));
        box.replaceChildren(...rows.map((x) => h('button', { class: 'row', type: 'button', onclick: async () => {
          sh.close();
          try {
            const row = { conversation_id: x.conversation_id, sender_id: D.uid, msg_type: m.msg_type || 'text', content: m.content || '', caption: m.caption, media_mime: m.media_mime, media_name: m.media_name, media_size: m.media_size, duration_ms: m.duration_ms, meta: m.meta };
            if (m.media_path) { const np = `${x.conversation_id}/${D.uuid()}.${(m.media_path.split('.').pop() || 'bin')}`; const { error: ce } = await sb.storage.from('chat-media').copy(m.media_path, np); if (ce) throw ce; row.media_path = np; }
            const { error } = await sb.from('messages').insert(row); if (error) throw error;
            D.toast('Forwarded to ' + D.nm(x), 'success'); D.refreshChats();
          } catch (e) { D.toast(D.err(e), 'error'); }
        } }, D.chatAvatar(x, 'md'), h('div', { class: 'row-b' }, h('b', {}, D.nm(x))))));
      };
      q.addEventListener('input', draw2);
      const sh = D.sheet([q, box], { title: 'Forward to…' }); draw2();
    }

    /* --- in-chat search --- */
    function toggleSearch() {
      if (!searchBar.hidden) { searchBar.hidden = true; st.hits = []; markHits(); return; }
      const inp = h('input', { class: 'input', type: 'search', placeholder: 'Search in this chat' }), cnt = h('small', {}, '');
      const go = (d) => { if (!st.hits.length) return; st.hi = (st.hi + d + st.hits.length) % st.hits.length; markHits(true); cnt.textContent = `${st.hi + 1}/${st.hits.length}`; };
      inp.addEventListener('input', () => {
        const q = inp.value.trim().toLowerCase();
        st.hits = q ? st.msgs.filter((m) => !m.deleted_at && ((m.content || '') + ' ' + (m.caption || '')).toLowerCase().includes(q)).map((m) => m.id) : [];
        st.hi = st.hits.length - 1; cnt.textContent = st.hits.length ? `${st.hits.length} found` : q ? 'No matches' : ''; markHits(true);
      });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(e.shiftKey ? 1 : -1); if (e.key === 'Escape') toggleSearch(); });
      searchBar.replaceChildren(inp, cnt, h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Previous match', onclick: () => go(-1) }, D.ic('chevron-up')), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Next match', onclick: () => go(1) }, D.ic('chevron-down')), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close search', onclick: toggleSearch }, D.ic('x')));
      searchBar.hidden = false; inp.focus();
    }
    function markHits(scroll) {
      D.$$('.bubble.hit', list).forEach((b) => b.classList.remove('hit', 'cur'));
      st.hits.forEach((mid, i) => { const b = $(`.bubble[data-id="${mid}"]`, list); if (b) { b.classList.add('hit'); if (i === st.hi) { b.classList.add('cur'); if (scroll) b.scrollIntoView({ block: 'center', behavior: 'smooth' }); } } });
    }

    /* --- more menu --- */
    function moreMenu(anchor) {
      const cur = D.store.convs.find((x) => x.conversation_id === id);
      D.popMenu([
        { icon: 'info', label: direct ? 'Contact info' : kind === 'community' ? 'Community info' : 'Group info', fn: () => opts.onInfo && opts.onInfo() },
        cur && st.member ? { icon: cur.favorite ? 'star-fill' : 'star', label: cur.favorite ? 'Remove favorite' : 'Add to favorites', fn: () => setMember({ favorite: !cur.favorite }) } : null,
        cur && st.member ? { icon: cur.muted ? 'bell' : 'bell-off', label: cur.muted ? 'Unmute notifications' : 'Mute notifications', fn: () => setMember({ muted: !cur.muted }) } : null,
        { icon: 'search', label: 'Search in chat', fn: toggleSearch },
        { icon: 'download', label: 'Export chat (.txt)', fn: exportChat },
        st.member && !direct ? { sep: 1 } : null,
        st.member && !direct ? { icon: 'logout', label: kind === 'community' ? 'Leave community' : 'Leave group', danger: 1, fn: leave } : null,
        direct && st.member ? { sep: 1 } : null,
        direct && st.member ? { icon: 'slash', label: st.blocked ? 'Unblock' : 'Block ' + D.nm(c).split(' ')[0], danger: !st.blocked, fn: toggleBlock } : null,
      ], anchor);
    }
    async function setMember(patch) {
      const { error } = await sb.from('conversation_members').update(patch).match({ conversation_id: id, user_id: D.uid });
      if (error) return D.toast(D.err(error), 'error'); D.toast('Updated', 'success'); D.loadChats();
    }
    async function leave() {
      if (!(await D.confirm('Leave this ' + (kind === 'community' ? 'community' : 'group') + '?', 'You will stop receiving messages from it.', 'Leave', true))) return;
      const { error } = await sb.rpc('leave_conversation', { cid: id }); if (error) return D.toast(D.err(error), 'error');
      await D.loadChats(); D.go(kind === 'community' ? 'communities' : 'chats');
    }
    async function toggleBlock() {
      if (st.blocked) { await sb.from('blocks').delete().eq('blocker_id', D.uid).eq('blocked_id', c.other_id); st.blocked = false; D.toast('Unblocked', 'success'); }
      else {
        if (!(await D.confirm(`Block ${D.nm(c)}?`, 'They will not be able to message or call you. You can unblock them any time.', 'Block', true))) return;
        const { error } = await sb.from('blocks').insert({ blocker_id: D.uid, blocked_id: c.other_id }); if (error) return D.toast(D.err(error), 'error'); st.blocked = true; D.toast('Blocked', 'success');
      }
      paintFoot(); paintSmart(); D.emit('blockchange');
    }
    async function exportChat() {
      D.toast('Preparing export…', 'info', 1500);
      const lines = []; let before = null;
      for (let i = 0; i < 20; i++) {
        let q = sb.from('messages').select(COLS).eq('conversation_id', id).order('created_at', { ascending: false }).limit(500); if (before) q = q.lt('created_at', before);
        const { data } = await q; if (!data || !data.length) break; data.forEach((m) => lines.unshift(`[${new Date(m.created_at).toLocaleString()}] ${sName(m.sender_id)}: ${m.deleted_at ? '(deleted)' : m.msg_type === 'text' ? m.content : '[' + m.msg_type + '] ' + (m.media_name || '') + ' ' + (m.caption || '')}`));
        before = data[data.length - 1].created_at; if (data.length < 500) break;
      }
      D.download(`dyson-${D.nm(c).replace(/\W+/g, '-').toLowerCase()}.txt`, new Blob([lines.join('\n')], { type: 'text/plain' }));
    }

    /* --- live events --- */
    const offs = [];
    const sub = (n, f) => offs.push(D.on(n, f));
    sub('msg:insert', (m) => {
      if (destroyed || m.conversation_id !== id) return;
      const mine = m.sender_id === D.uid, was = nearBottom();
      prefetch([m]).then(() => {
        add(m); st.typingAt = 0; draw();
        if (mine || was) scrollDown(); else { st.newCount++; scrollBtn.hidden = false; }
        if (!mine) markRead();
      });
    });
    sub('msg:update', (m) => { if (!destroyed && m.conversation_id === id && st.by.has(m.id)) { add(m); draw(); } });
    sub('msg:delete', (m) => { if (!destroyed && m.id && st.by.has(m.id)) { st.by.delete(m.id); st.msgs = st.msgs.filter((x) => x.id !== m.id); draw(); } });
    sub('react', (p) => {
      if (destroyed) return; const r = p.new && p.new.message_id ? p.new : p.old; if (!r || !st.by.has(r.message_id) || r.user_id === D.uid) return;
      const arr = (st.reacts.get(r.message_id) || []).filter((x) => !(x.user_id === r.user_id && x.emoji === r.emoji));
      if (p.eventType === 'INSERT') arr.push(r); st.reacts.set(r.message_id, arr); draw();
    });
    sub('member:update', (m) => { if (!destroyed && direct && m.conversation_id === id && m.user_id !== D.uid) { st.receipt = m.receipt_at; draw(); } });
    sub('presence', () => { if (!destroyed) paintHead(); });
    sub('chats', () => { if (!destroyed) paintHead(); });
    sub('blockchange', async () => { if (destroyed || !direct) return; const { data } = await sb.rpc('get_profile', { uid: c.other_id }); st.blocked = !!(data && data[0] && data[0].blocked); paintFoot(); });
    list.addEventListener('scroll', () => { scrollBtn.hidden = nearBottom(); if (nearBottom()) st.newCount = 0; });
    const vis = () => { if (!document.hidden && !destroyed) markRead(); };
    document.addEventListener('visibilitychange', vis);

    init();
    return {
      id,
      focus: () => input.focus(),
      destroy() {
        destroyed = true; if (D.activeConv === id) D.activeConv = null;
        if (rec) { try { rec.mr.onstop = () => rec.stream.getTracks().forEach((t) => t.stop()); rec.mr.stop(); } catch (e) { /* ignore */ } clearInterval(rec.iv); rec = null; }
        if (typingCh) sb.removeChannel(typingCh);
        document.removeEventListener('visibilitychange', vis);
        if (D._aud) { D._aud.pause(); }
      },
    };
  };
})();
