/* DYSON calls.js — 1:1 voice & video calls over WebRTC. Signaling uses Supabase Realtime broadcast
   (channel "calls:<userId>"); history is stored in call_logs. Needs HTTPS (or localhost) for camera/mic.
   For calls across strict NATs add a TURN server to DYSON_CONFIG.ICE_SERVERS. */
(function () {
  const { h, $, sb } = D;
  const C = (D.calls = {});
  const RING_MS = 45000;
  const EMOJIS = ['❤️', '😍', '🔥', '🎉', '😂', '👏'];
  const iceServers = () => (D.cfg.ICE_SERVERS && D.cfg.ICE_SERVERS.length ? D.cfg.ICE_SERVERS : [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }]);

  let call = null, inc = null, inbox = null, ringIv = null;
  const out = {};
  const pendingIce = {};

  /* ---------- signaling ---------- */
  const outChan = (id) => {
    if (!out[id]) {
      const ch = sb.channel('calls:' + id, { config: { broadcast: { self: false } } });
      out[id] = new Promise((res) => ch.subscribe((s) => { if (s === 'SUBSCRIBED') res(ch); }));
    }
    return out[id];
  };
  const sig = async (to, payload) => { const ch = await outChan(to); ch.send({ type: 'broadcast', event: 'sig', payload: Object.assign({ from: D.uid }, payload) }); };

  C.init = () => {
    inbox = sb.channel('calls:' + D.uid, { config: { broadcast: { self: false } } }).on('broadcast', { event: 'sig' }, ({ payload }) => onSig(payload)).subscribe();
  };

  function onSig(p) {
    if (!p || !p.type) return;
    if (p.type === 'invite') {
      if (call || inc) return sig(p.from, { type: 'busy', callId: p.callId });
      return showIncoming(p);
    }
    if (p.type === 'ice') {
      if (call && call.id === p.callId && call.pc && call.pc.remoteDescription) return call.pc.addIceCandidate(p.candidate).catch(() => {});
      (pendingIce[p.callId] = pendingIce[p.callId] || []).push(p.candidate); return;
    }
    if (p.type === 'cancel' && inc && inc.p.callId === p.callId) { dismissIncoming(); D.toast('Missed call', 'info'); return; }
    if (!call || call.id !== p.callId) return;
    if (p.type === 'answer') {
      call.pc.setRemoteDescription(p.sdp).then(() => flushIce()).catch(console.warn);
      if (ui) ui.status.textContent = 'Connecting…';
    } else if (p.type === 'reject') end(false, 'Call declined');
    else if (p.type === 'busy') end(false, 'User is on another call');
    else if (p.type === 'end') end(false, 'Call ended');
    else if (p.type === 'react') floatEmoji(p.emoji);
  }
  function flushIce() {
    const q = pendingIce[call.id] || []; delete pendingIce[call.id];
    q.forEach((c) => call.pc.addIceCandidate(c).catch(() => {}));
  }

  /* ---------- media ---------- */
  C.constraints = (video) => {
    const p = D.prefs.data;
    return {
      audio: Object.assign({ echoCancellation: p.echo, noiseSuppression: p.noise, autoGainControl: true }, p.micId ? { deviceId: { exact: p.micId } } : {}),
      video: video ? Object.assign({ width: { ideal: 1280 }, height: { ideal: 720 } }, p.camId ? { deviceId: { exact: p.camId } } : { facingMode: p.facing }) : false,
    };
  };
  async function getMedia(video) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Calls need HTTPS and a browser with camera/microphone support.');
    try { return await navigator.mediaDevices.getUserMedia(C.constraints(video)); }
    catch (e) {
      if (e.name === 'OverconstrainedError') return navigator.mediaDevices.getUserMedia({ audio: true, video: !!video });
      throw new Error(e.name === 'NotAllowedError' ? 'Allow camera/microphone access to make calls.' : e.name === 'NotFoundError' ? 'No camera or microphone found.' : e.message);
    }
  }
  function makePc(peerId) {
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    pc.onicecandidate = (e) => { if (e.candidate && call) sig(peerId, { type: 'ice', callId: call.id, candidate: e.candidate }); };
    pc.ontrack = (e) => { call.remote = e.streams[0]; if (ui) { ui.remote.srcObject = call.remote; ui.remote.play().catch(() => {}); } };
    pc.onconnectionstatechange = () => {
      if (!call) return;
      const s = pc.connectionState;
      if (s === 'connected') connected();
      else if (s === 'failed') end(true, 'Connection lost');
      else if (s === 'disconnected') { const id = call.id; setTimeout(() => { if (call && call.id === id && pc.connectionState === 'disconnected') end(true, 'Connection lost'); }, 8000); }
    };
    return pc;
  }
  function connected() {
    if (call.connected) return;
    call.connected = true; call.t0 = Date.now(); clearTimeout(call.ringT);
    if (ui) { ui.el.classList.add('live'); ui.status.textContent = ''; ui.timer = setInterval(() => { ui.time.textContent = D.clock((Date.now() - call.t0) / 1000); }, 1000); ui.time.textContent = '00:00'; }
    ui && ui.el.classList.toggle('novideo', !call.video);
  }

  /* ---------- UI ---------- */
  let ui = null;
  function showUI() {
    const remote = h('video', { class: 'remote', autoplay: '', playsinline: '' });
    const lv = h('video', { autoplay: '', muted: '', playsinline: '' }); lv.muted = true;
    const pip = h('div', { class: 'call-pip' + (D.prefs.data.mirror ? ' mirror' : ''), hidden: !call.video }, lv);
    const status = h('p', {}, call.role === 'caller' ? 'Calling…' : 'Connecting…'), time = h('small', {}, '');
    const floaters = h('div', { class: 'floaters' });
    const mic = h('button', { class: 'cbtn', type: 'button', 'aria-label': 'Mute microphone', onclick: () => { const t = call.local.getAudioTracks()[0]; if (!t) return; t.enabled = !t.enabled; mic.classList.toggle('off', !t.enabled); mic.replaceChildren(D.ic(t.enabled ? 'mic' : 'mic-off')); } }, D.ic('mic'));
    const cam = call.video ? h('button', { class: 'cbtn', type: 'button', 'aria-label': 'Turn camera off', onclick: () => { const t = call.local.getVideoTracks()[0]; if (!t) return; t.enabled = !t.enabled; cam.classList.toggle('off', !t.enabled); cam.replaceChildren(D.ic(t.enabled ? 'video' : 'video-off')); pip.style.visibility = t.enabled ? 'visible' : 'hidden'; } }, D.ic('video')) : '';
    const flip = call.video && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices ? h('button', { class: 'cbtn', type: 'button', 'aria-label': 'Switch camera', onclick: switchCamera }, D.ic('refresh')) : '';
    let ei = 0;
    const react = h('button', { class: 'cbtn', type: 'button', 'aria-label': 'Send reaction', onclick: () => { const e = EMOJIS[ei++ % EMOJIS.length]; floatEmoji(e); sig(call.peer.id, { type: 'react', callId: call.id, emoji: e }); } }, D.ic('heart'));
    const endB = h('button', { class: 'cbtn end', type: 'button', 'aria-label': 'End call', onclick: () => end(true, 'Call ended') }, D.ic('end-call'));
    const el = h('div', { class: 'call', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Call' },
      h('div', { class: 'call-stage' }, remote,
        h('div', { class: 'call-who' }, D.avatar({ full_name: call.peer.full_name, avatar_url: call.peer.avatar_url }, 'xxl'), h('h2', {}, call.peer.full_name), status),
        h('div', { class: 'call-top' }, h('div', {}, h('b', {}, call.peer.full_name), time), h('span', { class: 'tag' }, call.video ? 'Video' : 'Voice')),
        pip, floaters),
      h('div', { class: 'call-dock' }, mic, cam, flip, react, endB));
    document.body.append(el);
    ui = { el, remote, lv, pip, status, time, floaters };
    if (call.local) lv.srcObject = call.local;
  }
  async function switchCamera() {
    const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    if (cams.length < 2) return D.toast('Only one camera found.', 'info');
    const cur = call.local.getVideoTracks()[0], idx = cams.findIndex((c) => c.deviceId === (cur.getSettings().deviceId));
    const next = cams[(idx + 1) % cams.length];
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: next.deviceId } } }); const nt = s.getVideoTracks()[0];
      const sender = call.pc.getSenders().find((x) => x.track && x.track.kind === 'video'); if (sender) await sender.replaceTrack(nt);
      cur.stop(); call.local.removeTrack(cur); call.local.addTrack(nt); ui.lv.srcObject = call.local;
    } catch (e) { D.toast('Could not switch camera.', 'error'); }
  }
  function floatEmoji(e) {
    if (!ui) return; const i = h('i', { style: { left: Math.random() * 40 + 'px', '--dx': Math.random() * 60 - 20 + 'px' } }, e); ui.floaters.append(i); setTimeout(() => i.remove(), 3100);
  }

  /* ---------- outgoing ---------- */
  C.start = async (peer, video) => {
    if (call || inc) return D.toast('You are already in a call.', 'info');
    if (!peer || !peer.id) return D.toast('Cannot call this contact.', 'error');
    try {
      const { data: row, error } = await sb.from('call_logs').insert({ caller_id: D.uid, callee_id: peer.id, is_video: !!video, status: 'ringing' }).select('id').single();
      if (error) throw error;
      call = { id: row.id, peer, video: !!video, role: 'caller', connected: false };
      call.local = await getMedia(video);
      showUI();
      call.pc = makePc(peer.id);
      call.local.getTracks().forEach((t) => call.pc.addTrack(t, call.local));
      const offer = await call.pc.createOffer(); await call.pc.setLocalDescription(offer);
      sig(peer.id, { type: 'invite', callId: call.id, video: !!video, sdp: call.pc.localDescription, info: { id: D.uid, full_name: D.me.full_name, avatar_url: D.me.avatar_url } });
      call.ringT = setTimeout(() => { if (call && !call.connected) end(true, 'No answer'); }, RING_MS);
    } catch (e) {
      const id = call && call.id; if (call) { call.ended = true; cleanup(); call = null; }
      if (id) sb.from('call_logs').update({ status: 'missed', ended_at: new Date().toISOString() }).eq('id', id).then(() => {});
      D.toast(e.message && !/row-level/.test(e.message) ? e.message : 'Could not start the call.', 'error');
    }
  };

  /* ---------- incoming ---------- */
  function showIncoming(p) {
    const info = p.info || { id: p.from, full_name: 'Dyson user' };
    const ring = () => { if (D.prefs.data.ringtone) { D.tone(660, 180, 0.07); setTimeout(() => D.tone(880, 220, 0.07), 220); } };
    ring(); ringIv = setInterval(ring, 1800);
    const el = h('div', { class: 'incoming', role: 'alertdialog', 'aria-label': 'Incoming call' }, D.avatar(info, 'md'),
      h('div', {}, h('b', {}, info.full_name), h('small', {}, p.video ? 'Incoming video call…' : 'Incoming voice call…')),
      h('button', { class: 'cbtn end', type: 'button', 'aria-label': 'Decline', onclick: () => { sig(p.from, { type: 'reject', callId: p.callId }); sb.from('call_logs').update({ status: 'declined', ended_at: new Date().toISOString() }).eq('id', p.callId).then(() => {}); dismissIncoming(); } }, D.ic('end-call')),
      h('button', { class: 'cbtn ok', type: 'button', 'aria-label': 'Accept', onclick: () => accept() }, D.ic(p.video ? 'video' : 'phone')));
    document.body.append(el);
    inc = { p, info, el, timer: setTimeout(dismissIncoming, RING_MS) };
    if (D.prefs.data.nCall) D.osNotify(info.full_name, p.video ? 'Incoming video call' : 'Incoming voice call', 'calls');
  }
  function dismissIncoming() { if (!inc) return; clearTimeout(inc.timer); clearInterval(ringIv); inc.el.remove(); inc = null; }
  async function accept() {
    const { p, info } = inc; dismissIncoming();
    try {
      call = { id: p.callId, peer: { id: p.from, full_name: info.full_name, avatar_url: info.avatar_url }, video: !!p.video, role: 'callee', connected: false };
      call.local = await getMedia(p.video);
      showUI();
      call.pc = makePc(p.from);
      call.local.getTracks().forEach((t) => call.pc.addTrack(t, call.local));
      await call.pc.setRemoteDescription(p.sdp); flushIce();
      const ans = await call.pc.createAnswer(); await call.pc.setLocalDescription(ans);
      sig(p.from, { type: 'answer', callId: call.id, sdp: call.pc.localDescription });
      sb.from('call_logs').update({ status: 'answered', answered_at: new Date().toISOString() }).eq('id', call.id).then(() => {});
      call.ringT = setTimeout(() => { if (call && !call.connected) end(true, 'Could not connect'); }, 30000);
    } catch (e) {
      sig(p.from, { type: 'reject', callId: p.callId });
      if (call) { call.ended = true; cleanup(); call = null; }
      D.toast(e.message || 'Could not answer the call.', 'error');
    }
  }

  /* ---------- end ---------- */
  function cleanup() {
    if (!call) return;
    clearTimeout(call.ringT);
    if (call.local) call.local.getTracks().forEach((t) => t.stop());
    if (call.pc) { try { call.pc.close(); } catch (e) { /* closed */ } }
    if (ui) { clearInterval(ui.timer); ui.el.remove(); ui = null; }
  }
  function end(notify, msg) {
    if (!call || call.ended) return;
    call.ended = true;
    const c = call, secs = c.connected ? Math.round((Date.now() - c.t0) / 1000) : 0;
    if (notify) sig(c.peer.id, { type: c.connected ? 'end' : c.role === 'caller' ? 'cancel' : 'reject', callId: c.id });
    const patch = c.connected ? { status: 'ended', ended_at: new Date().toISOString(), duration_s: secs } : c.role === 'caller' ? { status: 'missed', ended_at: new Date().toISOString() } : { status: 'declined', ended_at: new Date().toISOString() };
    sb.from('call_logs').update(patch).eq('id', c.id).in('status', ['ringing', 'answered']).then(() => D.emit('calllog'));
    cleanup(); call = null;
    D.toast(msg + (secs ? ' · ' + D.dur(secs) : ''), 'info', 2600);
  }
  addEventListener('beforeunload', () => { if (call && !call.ended) { sig(call.peer.id, { type: call.connected ? 'end' : 'cancel', callId: call.id }); } });

  /* ---------- pick someone to call ---------- */
  C.pick = () => {
    const rows = [], seen = new Set();
    D.store.convs.filter((c) => c.kind === 'direct').forEach((c) => { seen.add(c.other_id); rows.push({ id: c.other_id, full_name: D.nm(c), avatar_url: c.other_avatar }); });
    D.contacts.list.filter((c) => c.contact_id && !seen.has(c.contact_id)).forEach((c) => rows.push({ id: c.contact_id, full_name: c.saved_name, avatar_url: c.avatar_url }));
    const q = h('input', { class: 'input', type: 'search', placeholder: 'Search people to call' }), box = h('div', { class: 'rows' });
    const draw = () => {
      const s = q.value.trim().toLowerCase(), list = rows.filter((r) => !s || r.full_name.toLowerCase().includes(s));
      box.replaceChildren(...(list.length ? list.map((r) => h('div', { class: 'row' }, D.avatar(r, 'md'), h('div', { class: 'row-b' }, h('b', {}, r.full_name)),
        h('button', { class: 'icon-btn ring', type: 'button', 'aria-label': 'Voice call', onclick: () => { sh.close(); C.start(r, false); } }, D.ic('phone')),
        h('button', { class: 'icon-btn ring', type: 'button', 'aria-label': 'Video call', onclick: () => { sh.close(); C.start(r, true); } }, D.ic('video')))) : [D.empty('users', 'No one to call yet', 'Start a chat or save a contact first.')]));
    };
    q.addEventListener('input', draw);
    const sh = D.sheet([q, box], { title: 'New call' }); draw();
  };

  /* ---------- Calls view ---------- */
  D.register('calls', {
    layout: 'page',
    render(ctx) {
      let filter = 'all', logs = [], offs = [];
      const box = h('div', { class: 'rows calls' });
      const seg = h('div', { class: 'filters' });
      const paintSeg = () => seg.replaceChildren(...[['all', 'All'], ['missed', 'Missed'], ['outgoing', 'Outgoing'], ['incoming', 'Incoming']].map(([k, l]) => h('button', { class: 'filter' + (filter === k ? ' on' : ''), type: 'button', onclick: () => { filter = k; paintSeg(); paint(); } }, l)));
      const paint = () => {
        const list = logs.filter((l) => filter === 'all' || (filter === 'missed' ? l.status === 'missed' || l.status === 'declined' : l.direction === filter));
        box.replaceChildren(...(list.length ? list.map((l) => {
          const missed = l.status === 'missed' || (l.status === 'declined' && l.direction === 'incoming');
          const icon = missed ? 'phone-missed' : l.direction === 'outgoing' ? 'phone-out' : 'phone-in';
          const detail = l.status === 'ended' ? D.dur(l.duration_s) : l.status === 'declined' ? 'Declined' : l.status === 'missed' ? (l.direction === 'outgoing' ? 'No answer' : 'Missed') : l.status === 'ringing' ? 'Not answered' : 'Answered';
          return h('div', { class: 'row' }, h('button', { class: 'row-main', type: 'button', onclick: () => D.go('profile/' + l.other_id) }, D.avatar(l, 'md'),
            h('div', { class: 'row-b' }, h('b', {}, D.contacts.name(l.other_id) || l.full_name),
              h('small', { class: missed ? 'bad' : 'ok2' }, D.ic(icon, 'sm'), [l.direction === 'outgoing' ? 'Outgoing' : missed ? 'Missed' : 'Incoming', missed && l.direction === 'incoming' ? '' : detail, D.fmtList(l.started_at), l.is_video ? 'video' : ''].filter(Boolean).join(' • ')))),
            h('button', { class: 'icon-btn ring', type: 'button', 'aria-label': 'Call back', onclick: () => C.start({ id: l.other_id, full_name: D.contacts.name(l.other_id) || l.full_name, avatar_url: l.avatar_url }, l.is_video) }, D.ic(l.is_video ? 'video' : 'phone')));
        }) : [D.empty('phone', 'No calls here', 'Your voice and video calls will appear in this list.', h('button', { class: 'btn btn-primary btn-pill', type: 'button', onclick: C.pick }, 'Start a call'))]));
      };
      const load = async () => {
        const { data, error } = await sb.rpc('get_call_logs');
        if (error) return box.replaceChildren(D.empty('alert', 'Could not load calls', D.err(error)));
        logs = data || []; paint();
      };
      ctx.stage.replaceChildren(h('div', { class: 'page narrow' }, D.vhead({ title: D.t('Calls'), sub: 'Voice and video calls', back: true, actions: [D.searchBtn(), h('button', { class: 'icon-btn ring', type: 'button', 'aria-label': 'New call', onclick: C.pick }, D.ic('phone-out'))] }), seg, box),
        h('button', { class: 'fab', type: 'button', 'aria-label': 'New call', onclick: C.pick }, D.ic('phone')));
      paintSeg(); box.replaceChildren(D.spinner()); load();
      offs = [D.on('calllog', load)]; this._o = offs;
    },
    leave() { (this._o || []).forEach((f) => f && f()); },
  });
})();
