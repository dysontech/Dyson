/* DYSON live.js — Dyson Live. The host streams camera/mic to each viewer over WebRTC (host → viewers, best for
   up to ~8 viewers without a media server). Signaling, live chat and hearts use Supabase Realtime broadcast
   on channel "live:<streamId>". The stream list lives in live_streams. */
(function () {
  const { h, $, sb } = D;
  const iceServers = () => (D.cfg.ICE_SERVERS && D.cfg.ICE_SERVERS.length ? D.cfg.ICE_SERVERS : [{ urls: 'stun:stun.l.google.com:19302' }]);
  let host = null, watch = null;

  function chatUI(send, floatEl) {
    const log = h('div', { class: 'live-log' }), inp = h('input', { class: 'input', placeholder: 'Say something…', maxlength: 200, 'aria-label': 'Live chat message' });
    const add = (name, text) => { log.append(h('p', {}, h('b', {}, name + ' '), text)); log.scrollTop = log.scrollHeight; while (log.children.length > 80) log.firstChild.remove(); };
    const heart = () => { const e = h('i', { style: { left: Math.random() * 40 + 'px', '--dx': Math.random() * 60 - 20 + 'px' } }, ['❤️', '🔥', '👏', '😍'][Math.floor(Math.random() * 4)]); floatEl.append(e); setTimeout(() => e.remove(), 3100); };
    const form = h('form', { class: 'live-form', onsubmit: (e) => { e.preventDefault(); const t = inp.value.trim(); if (!t) return; inp.value = ''; add('You', t); send({ type: 'chat', name: D.me.full_name.split(' ')[0], text: t }); } }, inp,
      h('button', { class: 'icon-btn ring', type: 'button', 'aria-label': 'Send heart', onclick: () => { heart(); send({ type: 'heart' }); } }, D.ic('heart')), h('button', { class: 'send', type: 'submit', 'aria-label': 'Send' }, D.ic('send')));
    return { log, form, add, heart };
  }

  async function startHost(title, video, ctx) {
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia(D.calls.constraints(video)); } catch (e) { return D.toast('Allow camera/microphone access to go live.', 'error'); }
    const { data: row, error } = await sb.from('live_streams').insert({ host_id: D.uid, title, video }).select('*').single();
    if (error) { stream.getTracks().forEach((t) => t.stop()); return D.toast(D.err(error), 'error'); }
    const peers = new Map(); const ch = sb.channel('live:' + row.id, { config: { broadcast: { self: false } } });
    const send = (p) => ch.send({ type: 'broadcast', event: 'm', payload: Object.assign({ from: D.uid }, p) });
    host = { row, stream, ch, peers, send };
    ch.on('broadcast', { event: 'm' }, async ({ payload: p }) => {
      if (p.type === 'join') {
        const pc = new RTCPeerConnection({ iceServers: iceServers() }); peers.set(p.from, pc);
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        pc.onicecandidate = (e) => e.candidate && send({ type: 'ice', to: p.from, candidate: e.candidate });
        pc.onconnectionstatechange = () => { if (['closed', 'failed', 'disconnected'].includes(pc.connectionState)) { peers.delete(p.from); send({ type: 'count', n: peers.size }); host.onCount && host.onCount(peers.size); } };
        const offer = await pc.createOffer(); await pc.setLocalDescription(offer); send({ type: 'offer', to: p.from, sdp: pc.localDescription });
        host.onCount && host.onCount(peers.size); send({ type: 'count', n: peers.size });
      } else if (p.type === 'answer' && p.to === D.uid) { const pc = peers.get(p.from); if (pc) pc.setRemoteDescription(p.sdp).catch(() => {}); }
      else if (p.type === 'ice' && p.to === D.uid) { const pc = peers.get(p.from); if (pc) pc.addIceCandidate(p.candidate).catch(() => {}); }
      else if (p.type === 'chat') host.ui && host.ui.add(p.name, p.text);
      else if (p.type === 'heart') host.ui && host.ui.heart();
      else if (p.type === 'leave') { const pc = peers.get(p.from); if (pc) { pc.close(); peers.delete(p.from); host.onCount && host.onCount(peers.size); } }
    }).subscribe();
    D.go('live');
  }
  async function endHost() {
    if (!host) return; const hh = host; host = null;
    try { hh.send({ type: 'end' }); } catch (e) { /* ignore */ }
    hh.peers.forEach((pc) => pc.close()); hh.stream.getTracks().forEach((t) => t.stop());
    await sb.from('live_streams').update({ active: false, ended_at: new Date().toISOString() }).eq('id', hh.row.id);
    setTimeout(() => sb.removeChannel(hh.ch), 500); D.toast('Live ended', 'info');
  }
  addEventListener('beforeunload', () => { if (host) { try { host.send({ type: 'end' }); } catch (e) { /* ignore */ } sb.from('live_streams').update({ active: false }).eq('id', host.row.id); } });

  function hostConsole(root) {
    const video = h('video', { class: 'live-video', autoplay: '', playsinline: '' }); video.muted = true; video.srcObject = host.stream;
    const floaters = h('div', { class: 'floaters' }), viewers = h('b', {}, '0');
    const ui = chatUI(host.send, floaters); host.ui = ui; host.onCount = (n) => { viewers.textContent = n; };
    const mic = h('button', { class: 'cbtn', type: 'button', 'aria-label': 'Mute', onclick: () => { const t = host.stream.getAudioTracks()[0]; if (t) { t.enabled = !t.enabled; mic.classList.toggle('off', !t.enabled); mic.replaceChildren(D.ic(t.enabled ? 'mic' : 'mic-off')); } } }, D.ic('mic'));
    const cam = host.row.video ? h('button', { class: 'cbtn', type: 'button', 'aria-label': 'Camera', onclick: () => { const t = host.stream.getVideoTracks()[0]; if (t) { t.enabled = !t.enabled; cam.classList.toggle('off', !t.enabled); cam.replaceChildren(D.ic(t.enabled ? 'video' : 'video-off')); } } }, D.ic('video')) : '';
    const share = h('button', { class: 'cbtn', type: 'button', 'aria-label': 'Share link', onclick: () => D.copy(location.href.split('#')[0] + '#live/' + host.row.id, 'Watch link copied') }, D.ic('share'));
    const end = h('button', { class: 'cbtn end', type: 'button', 'aria-label': 'End live', onclick: async () => { if (await D.confirm('End your live stream?', 'Viewers will be disconnected.', 'End live', true)) { await endHost(); D.emit('route', D.route()); } } }, D.ic('end-call'));
    root.replaceChildren(D.vhead({ title: 'You are live', sub: host.row.title, back: false }), h('div', { class: 'live-wrap' }, h('div', { class: 'live-stage' }, video, h('span', { class: 'live-pill' }, h('i'), 'LIVE'), h('span', { class: 'live-count' }, D.ic('eye', 'sm'), viewers), floaters, h('div', { class: 'live-ctrl' }, mic, cam, share, end)), h('aside', { class: 'live-chat' }, h('h3', {}, 'Live chat'), ui.log, ui.form)));
  }

  async function watchStream(root, id) {
    const { data: row } = await sb.from('live_streams').select('*').eq('id', id).maybeSingle();
    if (!row) return root.replaceChildren(D.vhead({ title: 'Live', back: true }), D.empty('live', 'Stream not found', 'It may have ended.', h('button', { class: 'btn btn-primary', type: 'button', onclick: () => D.go('live') }, 'Browse live')));
    const { data: hp } = await sb.from('profiles').select('id,full_name,avatar_url').eq('id', row.host_id).maybeSingle();
    if (!row.active) return root.replaceChildren(D.vhead({ title: row.title, back: true }), D.empty('live', 'This live has ended', (hp ? hp.full_name : 'The host') + ' is no longer live.', h('button', { class: 'btn btn-primary', type: 'button', onclick: () => D.go('live') }, 'Browse live')));
    const video = h('video', { class: 'live-video', autoplay: '', playsinline: '', controls: '' }), status = h('div', { class: 'live-status' }, h('span', { class: 'spinner' }), h('p', {}, 'Connecting to stream…'));
    const floaters = h('div', { class: 'floaters' }), count = h('b', {}, '–');
    const ch = sb.channel('live:' + id, { config: { broadcast: { self: false } } });
    const send = (p) => ch.send({ type: 'broadcast', event: 'm', payload: Object.assign({ from: D.uid }, p) });
    const ui = chatUI(send, floaters); let pc = null;
    watch = { ch, send, pc: () => pc };
    ch.on('broadcast', { event: 'm' }, async ({ payload: p }) => {
      if (p.type === 'offer' && p.to === D.uid) {
        pc = new RTCPeerConnection({ iceServers: iceServers() });
        pc.ontrack = (e) => { video.srcObject = e.streams[0]; video.play().catch(() => {}); status.hidden = true; };
        pc.onicecandidate = (e) => e.candidate && send({ type: 'ice', to: row.host_id, candidate: e.candidate });
        pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') { status.hidden = false; status.replaceChildren(h('p', { class: 'bad' }, 'Connection failed. The network may need a TURN server.')); } };
        await pc.setRemoteDescription(p.sdp); const ans = await pc.createAnswer(); await pc.setLocalDescription(ans); send({ type: 'answer', to: row.host_id, sdp: pc.localDescription });
      } else if (p.type === 'ice' && p.to === D.uid && pc) pc.addIceCandidate(p.candidate).catch(() => {});
      else if (p.type === 'chat') ui.add(p.name, p.text); else if (p.type === 'heart') ui.heart();
      else if (p.type === 'count') count.textContent = p.n;
      else if (p.type === 'end') { status.hidden = false; status.replaceChildren(D.ic('live', 'xl'), h('p', {}, 'The live has ended.')); if (pc) pc.close(); }
    }).subscribe((s) => { if (s === 'SUBSCRIBED') send({ type: 'join' }); });
    setTimeout(() => { if (!video.srcObject && !status.hidden) { status.replaceChildren(h('p', { class: 'bad' }, 'The host did not respond. They may have left.')); } }, 20000);
    root.replaceChildren(D.vhead({ title: row.title, sub: hp ? hp.full_name : '', back: () => D.go('live'), actions: [hp ? h('button', { class: 'btn btn-sm', type: 'button', onclick: () => D.go('profile/' + hp.id) }, 'View host') : ''] }),
      h('div', { class: 'live-wrap' }, h('div', { class: 'live-stage' }, video, status, h('span', { class: 'live-pill' }, h('i'), 'LIVE'), h('span', { class: 'live-count' }, D.ic('eye', 'sm'), count), floaters), h('aside', { class: 'live-chat' }, h('h3', {}, 'Live chat'), ui.log, ui.form)));
  }
  function stopWatch() { if (!watch) return; try { watch.send({ type: 'leave' }); } catch (e) { /* ignore */ } const p = watch.pc(); if (p) p.close(); sb.removeChannel(watch.ch); watch = null; }

  D.register('live', {
    layout: 'page',
    async render(ctx) {
      const root = h('div', { class: 'page' }); ctx.stage.replaceChildren(root);
      stopWatch();
      if (ctx.route.a) return watchStream(root, ctx.route.a);
      if (host) return hostConsole(root);
      const list = h('div', { class: 'dgrid' }, D.spinner());
      const goLive = () => {
        if (!navigator.mediaDevices) return D.toast('Going live needs HTTPS and a camera/microphone.', 'error');
        const t = h('input', { class: 'input', placeholder: 'What is your live about?', maxlength: 80 }); let vid = true;
        const go = h('button', { class: 'btn btn-primary', type: 'button' }, D.ic('radio', 'sm'), 'Go live');
        const mo = D.modal({ title: 'Go live', body: [D.field('Title', t), D.field('Type', D.seg([['v', 'Video'], ['a', 'Audio only']], 'v', (v) => { vid = v === 'v'; })), h('p', { class: 'hint' }, 'People who follow you are notified. Best for up to ~8 viewers.')], actions: [h('button', { class: 'btn', type: 'button', onclick: () => mo.close() }, 'Cancel'), go] });
        go.onclick = async () => { if (!t.value.trim()) return D.toast('Give your live a title.', 'info'); D.busy(go, true, 'Starting…'); mo.close(); await startHost(t.value.trim(), vid); D.emit('route', D.route()); };
      };
      const load = async () => {
        const { data } = await sb.from('live_streams').select('id,title,host_id,started_at,video').eq('active', true).order('started_at', { ascending: false });
        const rows = data || []; const ids = rows.map((r) => r.host_id);
        const { data: ps } = ids.length ? await sb.from('profiles').select('id,full_name,avatar_url').in('id', ids) : { data: [] }; const pm = new Map((ps || []).map((p) => [p.id, p]));
        list.replaceChildren(...(rows.length ? rows.map((l) => h('div', { class: 'dcard live', onclick: () => D.go('live/' + l.id), role: 'link', tabindex: 0 }, h('span', { class: 'live-pill sm' }, h('i'), 'LIVE'), D.avatar(pm.get(l.host_id) || { full_name: 'Host' }, 'lg'), h('b', {}, l.title), h('small', { class: 'dc-sub' }, (pm.get(l.host_id) || {}).full_name || 'Host'), h('small', { class: 'dc-desc' }, 'Started ' + D.ago(l.started_at) + ' ago'), h('div', { class: 'dc-act' }, h('button', { class: 'btn btn-sm btn-primary', type: 'button' }, 'Watch')))) : [D.empty('live', 'No one is live right now', 'Be the first — start a live and your followers get notified.', h('button', { class: 'btn btn-primary btn-pill', type: 'button', onclick: goLive }, 'Go live'))]));
      };
      root.replaceChildren(D.vhead({ title: D.t('Dyson Live'), sub: 'Stream to your followers in real time', back: true, actions: [h('button', { class: 'btn btn-primary btn-pill', type: 'button', onclick: goLive }, D.ic('radio', 'sm'), 'Go live')] }), list);
      load(); this._o = [D.on('live:change', load)];
    },
    update(ctx) { this.render(ctx); },
    leave() { (this._o || []).forEach((f) => f && f()); stopWatch(); if (host) endHost(); },
  });
})();
