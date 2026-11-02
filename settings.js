/* DYSON settings.js — every row opens a working page.
   Account & Security · Privacy · Notifications · Appearance · Data & Storage · Chats · Calls · AI · Language · Help · About */
(function () {
  const { h, $, sb } = D;
  const P = () => D.prefs;

  const SECTIONS = [
    ['account', 'user', 'Account & Security', 'Manage your account, password and security'],
    ['privacy', 'shield', 'Privacy', 'Control your privacy and visibility'],
    ['notifications', 'bell', 'Notifications', 'Customise how you get notified'],
    ['appearance', 'palette', 'Appearance', 'Theme, chat wallpaper and more'],
    ['data', 'database', 'Data & Storage', 'Manage storage and data usage'],
    ['chats', 'chat', 'Chats Settings', 'Message settings and conversation options'],
    ['calls', 'phone', 'Calls Settings', 'Voice and video call preferences'],
    ['ai', 'spark', 'AI Assistant', 'Configure Dyson AI features', 'New'],
    ['language', 'globe', 'Language', 'Choose your preferred language'],
    ['help', 'headphones', 'Help & Support', 'Get help and contact us'],
    ['about', 'info', 'About Dyson', ''],
  ];

  /* ---------- building blocks ---------- */
  const group = (title, ...rows) => h('section', { class: 'sgroup' }, title ? h('h3', {}, title) : '', h('div', { class: 'scard' }, rows));
  const row = (icon, title, sub, right, onclick) => h(onclick ? 'button' : 'div', { class: 'srow2' + (onclick ? ' tap' : ''), type: onclick ? 'button' : null, onclick },
    icon ? h('span', { class: 'si' }, D.ic(icon)) : '', h('span', { class: 'sb' }, h('b', {}, title), sub ? h('small', {}, sub) : ''), right || (onclick ? D.ic('chevron-right', 'sm') : ''));
  const sw = (key, title, sub, icon) => row(icon, title, sub, D.toggle(P().get(key), (v) => P().set(key, v), title));
  const select = (key, opts, extra) => { const s = h('select', { class: 'select compact' }, opts.map(([v, l]) => h('option', { value: v, selected: String(P().get(key)) === String(v) }, l))); s.onchange = () => { P().set(key, s.value); extra && extra(s.value); }; return s; };
  const note = (txt, cls = 'info') => h('div', { class: 'form-msg ' + cls }, txt);

  /* ---------- ACCOUNT & SECURITY ---------- */
  async function account(el) {
    const u = D.user || (await sb.auth.getUser()).data.user, provider = (u.app_metadata && u.app_metadata.provider) || 'email';
    const hasPw = provider === 'email';
    const lockOn = D.lock && D.lock.enabled();
    el.append(
      group('Sign-in', row('mail', 'Email', u.email || 'Not set', null, hasPw ? changeEmail : null), row('key', 'Password', hasPw ? 'Change your password' : 'Signed in with ' + provider, null, hasPw ? changePassword : null)),
      group('This device', row('lock', 'App lock (PIN)', lockOn ? 'On — asks for a 6-digit PIN after you leave the app' : 'Off', h('button', { class: 'btn btn-sm', type: 'button', onclick: (e) => { e.stopPropagation(); pinFlow(); } }, lockOn ? 'Turn off' : 'Set PIN'), null),
        lockOn ? row('clock', 'Lock after', 'How long the app can stay hidden', select2('dyson-lock-after', [['0', 'Immediately'], ['60', '1 minute'], ['300', '5 minutes'], ['1800', '30 minutes']])) : '',
        row('logout', 'Sign out of all devices', 'Ends every active session, including this one', null, async () => { if (await D.confirm('Sign out everywhere?', 'You will need to sign in again on every device.', 'Sign out', true)) D.logout('global'); })),
      group('Your data', row('download', 'Download my data', 'Profile, contacts and messages you sent (JSON)', null, exportData),
        row('trash', 'Delete my account', 'Permanently removes your profile, messages and files', null, deleteAccount)));
    function select2(lsKey, opts) { const s = h('select', { class: 'select compact' }, opts.map(([v, l]) => h('option', { value: v, selected: (localStorage.getItem(lsKey) || '60') === v }, l))); s.onchange = () => localStorage.setItem(lsKey, s.value); return s; }
    async function changeEmail() {
      const v = await D.ask('Change email', { label: 'New email address', type: 'email', ok: 'Send confirmation' }); if (!v) return;
      if (!D.isEmail(v)) return D.toast('Enter a valid email.', 'error');
      const { error } = await sb.auth.updateUser({ email: v }); if (error) return D.toast(D.err(error), 'error'); D.toast('Check both inboxes to confirm the change.', 'success', 6000);
    }
    async function changePassword() {
      const a = h('input', { class: 'input', type: 'password', placeholder: 'New password (6+ characters)', autocomplete: 'new-password' }), b = h('input', { class: 'input', type: 'password', placeholder: 'Repeat new password', autocomplete: 'new-password' });
      const go = h('button', { class: 'btn btn-primary', type: 'button' }, 'Update password');
      const mo = D.modal({ title: 'Change password', body: [D.field('New password', a), D.field('Confirm', b)], actions: [h('button', { class: 'btn', type: 'button', onclick: () => mo.close() }, 'Cancel'), go] });
      go.onclick = async () => { if (a.value.length < 6) return D.toast('Use at least 6 characters.', 'error'); if (a.value !== b.value) return D.toast('Passwords do not match.', 'error'); D.busy(go, true, 'Updating…'); const { error } = await sb.auth.updateUser({ password: a.value }); D.busy(go, false); if (error) return D.toast(D.err(error), 'error'); mo.close(); D.toast('Password updated', 'success'); };
    }
    function pinFlow() {
      if (D.lock.enabled()) { localStorage.removeItem('dyson-lock'); localStorage.removeItem('dyson-pin-' + D.uid); D.toast('App lock turned off', 'success'); return rerender(); }
      const a = h('input', { class: 'input wz-code', type: 'password', inputmode: 'numeric', maxlength: 6, placeholder: '••••••', style: { textAlign: 'center', fontSize: '1.6rem' } });
      const go = h('button', { class: 'btn btn-primary', type: 'button' }, 'Save PIN');
      const mo = D.modal({ title: 'Set a 6-digit PIN', body: [h('p', { class: 'muted' }, 'The PIN stays on this device (hashed). If you forget it, sign out and sign in again.'), a], actions: [h('button', { class: 'btn', type: 'button', onclick: () => mo.close() }, 'Cancel'), go] });
      a.addEventListener('input', () => { a.value = a.value.replace(/\D/g, '').slice(0, 6); });
      go.onclick = async () => { if (a.value.length !== 6) return D.toast('Enter exactly 6 digits.', 'error'); await D.lock.save(D.uid, a.value); localStorage.setItem('dyson-lock', 'on'); D.lock.opened(); mo.close(); D.toast('App lock is on', 'success'); rerender(); };
    }
    async function exportData() {
      D.toast('Preparing your data…', 'info', 2000);
      const [prof, ctc, msgs, pref] = await Promise.all([sb.from('profiles').select('*').eq('id', D.uid).maybeSingle(), sb.rpc('list_contacts'), sb.from('messages').select('conversation_id,content,msg_type,caption,created_at').eq('sender_id', D.uid).is('deleted_at', null).order('created_at', { ascending: false }).limit(5000), sb.from('user_preferences').select('*').eq('user_id', D.uid).maybeSingle()]);
      D.download('dyson-my-data.json', new Blob([JSON.stringify({ exported_at: new Date().toISOString(), profile: prof.data, contacts: ctc.data, preferences: pref.data, messages_sent: msgs.data }, null, 2)], { type: 'application/json' }));
    }
    async function deleteAccount() {
      const v = await D.ask('Delete account', { label: 'This cannot be undone. Type DELETE to confirm.', placeholder: 'DELETE', ok: 'Delete forever' }); if (v !== 'DELETE') return v === null ? null : D.toast('Not deleted — you must type DELETE.', 'info');
      const { error } = await sb.rpc('delete_my_account'); if (error) return D.toast(D.err(error), 'error');
      try { localStorage.clear(); } catch (e) { /* ignore */ } await sb.auth.signOut().catch(() => {}); location.replace('start.html');
    }
    function rerender() { D.emit('route', D.route()); }
  }

  /* ---------- PRIVACY ---------- */
  async function privacy(el) {
    const { data } = await sb.from('privacy_settings').select('*').eq('user_id', D.uid).maybeSingle();
    const ps = Object.assign({ last_seen: 'everyone', online: 'everyone', who_can_message: 'everyone', read_receipts: true, discoverable: true }, data || {});
    const save = async (k, v) => { ps[k] = v; const { error } = await sb.from('privacy_settings').upsert(Object.assign({ user_id: D.uid }, { [k]: v })); if (error) D.toast(D.err(error), 'error'); else if (k === 'read_receipts') P().set('readReceipts', v); };
    const sel = (k, opts) => { const s = h('select', { class: 'select compact' }, opts.map(([v, l]) => h('option', { value: v, selected: ps[k] === v }, l))); s.onchange = () => save(k, s.value); return s; };
    const vis = [['everyone', 'Everyone'], ['contacts', 'My contacts'], ['nobody', 'Nobody']];
    const blocked = h('div', { class: 'rows' });
    el.append(
      group('Visibility', row('clock', 'Last seen', 'Who can see when you were last online', sel('last_seen', vis)), row('eye', 'Online status', 'Who can see that you are online', sel('online', vis)),
        row('check-double', 'Read receipts', 'If off, you will not see theirs either', D.toggle(ps.read_receipts, (v) => save('read_receipts', v), 'Read receipts')),
        row('compass', 'Show me in Discover', 'Let people find you by name or username', D.toggle(ps.discoverable, (v) => save('discoverable', v), 'Discoverable'))),
      group('Contact', row('chat', 'Who can message me', 'Applies to new conversations', sel('who_can_message', [['everyone', 'Everyone'], ['contacts', 'My contacts only']])),
        row('status', 'Status privacy', 'Who can see your status updates', null, () => D.statusPrivacy()), row('contacts', 'Contacts', 'Manage saved contacts', null, () => D.contacts.manage())),
      group('Blocked users', blocked));
    async function loadBlocked() {
      const { data: b } = await sb.from('blocks').select('blocked_id').eq('blocker_id', D.uid); const ids = (b || []).map((x) => x.blocked_id);
      if (!ids.length) return blocked.replaceChildren(h('p', { class: 'hint pad' }, 'You have not blocked anyone.'));
      const { data: ps2 } = await sb.from('profiles').select('id,full_name,username,avatar_url').in('id', ids);
      blocked.replaceChildren(...(ps2 || []).map((p) => h('div', { class: 'srow2' }, D.avatar(p, 'sm'), h('span', { class: 'sb' }, h('b', {}, p.full_name), h('small', {}, '@' + p.username)), h('button', { class: 'btn btn-sm', type: 'button', onclick: async () => { await sb.from('blocks').delete().match({ blocker_id: D.uid, blocked_id: p.id }); D.toast('Unblocked', 'success'); D.emit('blockchange'); loadBlocked(); } }, 'Unblock'))));
    }
    loadBlocked();
  }

  /* ---------- NOTIFICATIONS ---------- */
  function notifications(el) {
    const perm = 'Notification' in window ? Notification.permission : 'unsupported';
    const status = h('span', { class: 'chip ' + (perm === 'granted' ? 'on' : '') }, perm === 'granted' ? 'Allowed' : perm === 'denied' ? 'Blocked in browser' : perm === 'unsupported' ? 'Not supported' : 'Not asked yet');
    el.append(
      group('Alerts on this device', row('bell', 'Desktop & phone alerts', 'Show alerts when Dyson is in the background', status, perm === 'default' ? async () => { const r = await Notification.requestPermission(); if (r === 'granted') { P().set('notify', true); new Notification('DYSON', { body: 'Alerts are on.', icon: 'icon-192.png' }); } D.emit('route', D.route()); } : null),
        sw('notify', 'Allow alerts', 'Master switch for pop-up alerts', 'zap'), sw('sound', 'Sounds', 'Play a tone for new messages', 'volume'), sw('previews', 'Message previews', 'Show message text in alerts', 'eye'),
        row('bell', 'Send a test', 'Check that alerts and sound work', null, () => { D.beep(); if (perm === 'granted') new Notification('DYSON test', { body: 'This is how alerts will look.', icon: 'icon-192.png' }); else D.toast('Alert sound played. Allow browser alerts above for pop-ups.', 'info'); })),
      group('What to notify me about', sw('nMsg', 'Messages', 'New chats, groups and communities', 'chat'), sw('nCall', 'Calls', 'Incoming call alerts', 'phone'), sw('nSocial', 'Activity', 'Followers, events and live streams', 'users')),
      note('Muted chats never notify you. Change that from the chat’s menu.'));
  }

  /* ---------- APPEARANCE ---------- */
  function appearance(el) {
    const ACC = [['blue', '#2a6bff'], ['violet', '#7a5cff'], ['cyan', '#0ea5d9'], ['emerald', '#10a878'], ['sunset', '#ff6a2b'], ['rose', '#f0397d'], ['gold', '#e6a210']];
    const accents = h('div', { class: 'swatches' }, ACC.map(([k, c]) => h('button', { class: 'swatch' + (P().get('accent') === k ? ' on' : ''), type: 'button', 'aria-label': k + ' accent', style: { background: c }, onclick: () => { P().set('accent', k); D.$$('.swatch', accents).forEach((s) => s.classList.toggle('on', s.getAttribute('aria-label') === k + ' accent')); } })));
    const WALLS = [['aurora', 'Aurora'], ['grid', 'Grid'], ['dots', 'Dots'], ['plain', 'Plain']];
    const walls = h('div', { class: 'walls' }, WALLS.map(([k, l]) => h('button', { class: 'wall wl-' + k + (P().get('wall') === k ? ' on' : ''), type: 'button', onclick: () => { P().set('wall', k); D.$$('.wall', walls).forEach((b) => b.classList.toggle('on', b.classList.contains('wl-' + k))); } }, h('span', {}), l)));
    el.append(
      group('Theme', h('div', { class: 'srow2 col' }, D.seg([['dark', 'Dark'], ['light', 'Light'], ['auto', 'Auto']], P().get('theme'), (v) => P().set('theme', v)), h('small', { class: 'hint' }, 'Auto follows your device setting.'))),
      group('Accent colour', h('div', { class: 'srow2 col' }, accents)),
      group('Chat wallpaper', h('div', { class: 'srow2 col' }, walls)),
      group('Text size', h('div', { class: 'srow2 col' }, D.seg([['s', 'Small'], ['m', 'Medium'], ['l', 'Large']], P().get('fontSize'), (v) => P().set('fontSize', v)), h('p', { class: 'sample' }, 'The quick brown fox jumps over the lazy dog.'))));
  }

  /* ---------- DATA & STORAGE ---------- */
  async function dataStorage(el) {
    const usage = h('div', { class: 'usage' }, D.spinner());
    el.append(group('Storage', h('div', { class: 'srow2 col' }, usage)),
      group('Media auto-download', sw('dlPhotos', 'Photos', 'Load photos automatically', 'image'), sw('dlVideos', 'Videos', 'Preload video previews (uses more data)', 'video'), sw('dataSaver', 'Data saver', 'Reduce data: no previews, smaller loads', 'zap')),
      group('This device', row('refresh', 'Clear cache', 'Removes cached app files; you stay signed in', null, async () => { if ('caches' in window) { const k = await caches.keys(); await Promise.all(k.map((x) => caches.delete(x))); } D.toast('Cache cleared', 'success'); }),
        row('trash', 'Clear local data', 'Resets preferences and AI history on this device', null, async () => { if (!(await D.confirm('Clear local data?', 'Theme, preferences and assistant history on this device will reset. Your account and chats are not touched.', 'Clear', true))) return; const keep = ['dyson-remember']; Object.keys(localStorage).filter((k) => k.startsWith('dyson-') && !keep.includes(k) && !k.startsWith('sb-')).forEach((k) => localStorage.removeItem(k)); D.toast('Local data cleared', 'success'); setTimeout(() => location.reload(), 600); })));
    try {
      const [m, v] = await Promise.all([sb.from('messages').select('media_size,msg_type').eq('sender_id', D.uid).not('media_path', 'is', null).limit(5000), sb.from('vault_files').select('size').eq('user_id', D.uid)]);
      const t = { image: 0, video: 0, audio: 0, file: 0 }; (m.data || []).forEach((x) => { t[x.msg_type] = (t[x.msg_type] || 0) + Number(x.media_size || 0); });
      const vs = (v.data || []).reduce((s, x) => s + Number(x.size || 0), 0), total = Object.values(t).reduce((a, b) => a + b, 0) + vs, max = Math.max(total, 1);
      const seg = (label, n, cls) => ({ label, n, cls });
      const parts = [seg('Photos', t.image, 'a'), seg('Videos', t.video, 'b'), seg('Audio', t.audio, 'c'), seg('Files', t.file, 'd'), seg('Vault', vs, 'e')];
      usage.replaceChildren(h('b', { class: 'usage-n' }, D.bytes(total)), h('small', { class: 'hint' }, 'Used by media you sent and your vault'), h('div', { class: 'bar' }, parts.map((p) => h('i', { class: p.cls, style: { width: (p.n / max) * 100 + '%' } }))),
        h('div', { class: 'legend' }, parts.map((p) => h('span', {}, h('i', { class: p.cls }), `${p.label} ${D.bytes(p.n)}`))));
    } catch (e) { usage.replaceChildren(h('p', { class: 'hint' }, 'Could not read usage.')); }
  }

  /* ---------- CHATS ---------- */
  function chats(el) {
    el.append(group('Typing', sw('enter', 'Enter sends message', 'On desktop; Shift+Enter adds a new line', 'send'), sw('smartReplies', 'Smart replies', 'Suggest quick replies above the message box', 'spark')),
      group('Display', row('palette', 'Chat wallpaper', 'Pick it in Appearance', null, () => D.go('settings/appearance')), row('type', 'Text size', 'Pick it in Appearance', null, () => D.go('settings/appearance'))),
      group('People', row('contacts', 'Manage contacts', 'Rename, remove or export contacts', null, () => D.contacts.manage()), row('user-plus', 'Add a contact', 'Save someone by @username, email or phone', null, () => D.contacts.add()),
        row('users', 'New group', 'Start a private group chat', null, () => D.createConversation('group'))));
  }

  /* ---------- CALLS ---------- */
  function calls(el) {
    const mic = h('select', { class: 'select compact' }), cam = h('select', { class: 'select compact' });
    const test = h('div', { class: 'cam-test', hidden: '' });
    el.append(
      group('Defaults', sw('callVideo', 'Start calls with video', 'When calling from a chat header', 'video'), sw('ringtone', 'Ringtone', 'Ring on incoming calls', 'volume'), sw('mirror', 'Mirror my video', 'Flip your own preview like a mirror', 'refresh')),
      group('Audio quality', sw('echo', 'Echo cancellation', 'Stops speaker sound feeding back', 'mic'), sw('noise', 'Noise suppression', 'Filter background noise', 'mic-wave')),
      group('Devices', row('mic', 'Microphone', '', mic), row('camera', 'Camera', '', cam), row('video', 'Camera facing', 'For phones', select('facing', [['user', 'Front'], ['environment', 'Back']]))),
      group('Test', row('video', 'Test camera & microphone', 'See yourself and watch the mic level', null, runTest), test));
    (async () => {
      try {
        try { const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: true }); s.getTracks().forEach((t) => t.stop()); } catch (e) { /* labels need permission */ }
        const dev = await navigator.mediaDevices.enumerateDevices();
        const fill = (sel, kind, key) => { const list = dev.filter((d) => d.kind === kind); sel.replaceChildren(h('option', { value: '' }, 'Default'), ...list.map((d, i) => h('option', { value: d.deviceId, selected: P().get(key) === d.deviceId }, d.label || `${kind === 'audioinput' ? 'Microphone' : 'Camera'} ${i + 1}`))); sel.onchange = () => P().set(key, sel.value); };
        fill(mic, 'audioinput', 'micId'); fill(cam, 'videoinput', 'camId');
      } catch (e) { mic.replaceChildren(h('option', {}, 'Unavailable')); cam.replaceChildren(h('option', {}, 'Unavailable')); }
    })();
    let stream, raf, ac;
    async function runTest() {
      if (stream) { stop(); return; }
      try { stream = await navigator.mediaDevices.getUserMedia(D.calls.constraints(true)); } catch (e) { return D.toast('Allow camera and microphone access first.', 'error'); }
      const v = h('video', { autoplay: '', muted: '', playsinline: '', class: D.prefs.data.mirror ? 'mirror' : '' }); v.muted = true; v.srcObject = stream;
      const lvl = h('i'), meter = h('div', { class: 'meter' }, lvl);
      test.replaceChildren(v, meter, h('button', { class: 'btn btn-sm', type: 'button', onclick: stop }, 'Stop test')); test.hidden = false;
      ac = new (window.AudioContext || window.webkitAudioContext)(); const an = ac.createAnalyser(); an.fftSize = 256; ac.createMediaStreamSource(stream).connect(an); const buf = new Uint8Array(an.fftSize);
      const tick = () => { an.getByteTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) { const x = (buf[i] - 128) / 128; s += x * x; } lvl.style.width = Math.min(100, Math.sqrt(s / buf.length) * 400) + '%'; raf = requestAnimationFrame(tick); }; tick();
    }
    function stop() { cancelAnimationFrame(raf); if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; if (ac) ac.close().catch(() => {}); test.hidden = true; test.replaceChildren(); }
    el._cleanup = stop;
  }

  /* ---------- AI ---------- */
  function ai(el) {
    el.append(group('Assistant', sw('aiOn', 'Enable AI Assistant', 'Summaries, drafts, translation and search', 'spark'), sw('smartReplies', 'Smart replies in chats', 'Quick-reply suggestions above the message box', 'chat'), sw('aiHistory', 'Keep assistant history on this device', 'Turn off to forget conversations', 'clock'),
      row('globe', 'Translate into / Wikipedia language', 'Default language for translation and lookups', select('aiLang', D.LANGS.map(([v, l]) => [v, l])))),
      group('Engine', row('zap', 'Mode', D.cfg.AI_ENDPOINT ? 'Custom AI endpoint + built-in tools' : 'Built-in tools (no API key needed)', h('span', { class: 'chip on' }, D.cfg.AI_ENDPOINT ? 'Custom' : 'Built-in')),
        row('trash', 'Clear assistant history', 'Removes it from this device', null, () => { D.ai.clearHistory(); D.toast('Assistant history cleared', 'success'); })),
      note('Your chats are only read by the assistant when you ask it to summarise one, and they are processed in your browser.'));
  }

  /* ---------- LANGUAGE ---------- */
  function language(el) {
    const L = [['en', 'English', 'English'], ['sw', 'Kiswahili', 'Swahili'], ['fr', 'Français', 'French'], ['es', 'Español', 'Spanish']];
    const cur = P().get('lang');
    el.append(group('Interface language', ...L.map(([v, n, e]) => row(null, n, e, cur === v ? D.ic('check') : null, () => { P().set('lang', v); D.toast('Language updated', 'success', 1500); setTimeout(() => location.reload(), 500); }))),
      note('Menus, settings and main screens are translated. Names, messages and user content always stay as written. Dates and times follow the chosen language.'));
  }

  /* ---------- HELP ---------- */
  function help(el) {
    const FAQ = [
      ['How do I start a chat?', 'Open Chats, tap the pencil or + button, then search for a person or pick a contact. You can also open anyone’s profile and tap Message.'],
      ['Why can’t I call someone?', 'Calls need camera/microphone permission and an HTTPS connection. The other person must have Dyson open to receive the call. On strict networks, add a TURN server in config.js.'],
      ['Who can see my status?', 'You decide: Status › menu › Who can see my status. Updates disappear after 24 hours unless you add them to highlights.'],
      ['Are my messages private?', 'Messages are protected by access rules in Supabase and sent over HTTPS. Dyson Vault files are additionally encrypted in your browser with a passphrase only you know.'],
      ['How do I block someone?', 'Open the chat menu (⋯) or their profile and choose Block. Manage blocked people in Settings › Privacy.'],
      ['I forgot my app PIN.', 'Use “Log out” on the lock screen, then sign in again. The PIN is stored only on your device.'],
    ];
    const t = h('input', { class: 'input', placeholder: 'Subject' }), b = h('textarea', { class: 'input', rows: 4, placeholder: 'Describe the problem or idea' });
    const go = h('button', { class: 'btn btn-primary btn-block', type: 'button' }, 'Send to support');
    go.onclick = async () => { if (!t.value.trim() || !b.value.trim()) return D.toast('Add a subject and a message.', 'info'); D.busy(go, true, 'Sending…'); const { error } = await sb.from('support_tickets').insert({ user_id: D.uid, subject: t.value.trim(), body: b.value.trim() + '\n\n— ' + navigator.userAgent }); D.busy(go, false); if (error) return D.toast(D.err(error), 'error'); t.value = b.value = ''; D.toast('Thanks — your message was sent.', 'success'); };
    el.append(group('Frequently asked', ...FAQ.map(([q, a]) => { const d = h('details', { class: 'faq' }, h('summary', {}, q), h('p', {}, a)); return d; })),
      group('Contact us', h('div', { class: 'srow2 col' }, t, b, go), D.cfg.SUPPORT_EMAIL ? row('mail', 'Email support', D.cfg.SUPPORT_EMAIL, null, () => { location.href = 'mailto:' + D.cfg.SUPPORT_EMAIL; }) : ''),
      group('Shortcuts', h('div', { class: 'srow2 col keys' }, [['Ctrl / ⌘ + K', 'Search everything'], ['Enter', 'Send message'], ['Shift + Enter', 'New line'], ['Esc', 'Close dialogs, cancel reply']].map(([k, d]) => h('div', { class: 'keyrow' }, h('kbd', {}, k), h('span', {}, d))))),
      group('Documents', row('file', 'Terms of Service', '', null, () => { location.href = 'terms.html'; }), row('shield', 'Privacy Policy', '', null, () => { location.href = 'privacy.html'; }), row('help', 'Help centre', '', null, () => { location.href = 'help.html'; })));
  }

  /* ---------- ABOUT ---------- */
  function about(el) {
    const inst = h('button', { class: 'btn btn-sm btn-primary', type: 'button', hidden: !D.installEv, onclick: async () => { D.installEv.prompt(); await D.installEv.userChoice; D.installEv = null; D.emit('route', D.route()); } }, 'Install');
    el.append(h('div', { class: 'about-hero' }, h('img', { src: 'icon-192.png', alt: '', width: 84, height: 84 }), h('h2', {}, 'DYSON'), h('p', { class: 'muted' }, 'Connect without limits.'), h('span', { class: 'chip' }, `Version ${D.version} · Build ${D.build}`)),
      group('App', row('download', 'Install DYSON', D.installEv ? 'Add it to your home screen or desktop' : 'Already installed, or use your browser’s “Install / Add to Home Screen”', inst),
        row('refresh', 'Check for updates', 'Reloads the newest version', null, async () => { try { if (D.swReg) await D.swReg.update(); } catch (e) { /* offline */ } if ('caches' in window) { (await caches.keys()).forEach((k) => caches.delete(k)); } D.toast('Updating…', 'info', 1200); setTimeout(() => location.reload(), 700); }),
        row('copy', 'Copy diagnostics', 'Version, browser and connection for support', null, () => D.copy([`DYSON ${D.version} (${D.build})`, navigator.userAgent, `Online: ${navigator.onLine}`, `Secure context: ${isSecureContext}`, `User: ${D.uid}`].join('\n'), 'Diagnostics copied'))),
      group('Legal', row('file', 'Terms of Service', '', null, () => { location.href = 'terms.html'; }), row('shield', 'Privacy Policy', '', null, () => { location.href = 'privacy.html'; })));
  }

  const PAGES = { account, privacy, notifications, appearance, data: dataStorage, chats, calls, ai, language, help, about };

  /* ---------- the view ---------- */
  D.register('settings', {
    layout: 'page',
    render(ctx) {
      const desktop = matchMedia('(min-width:900px)').matches;
      let sub = ctx.route.a || (desktop ? 'account' : '');
      const me = D.me;
      const wrap = h('div', { class: 'set-wrap', 'data-sub': ctx.route.a || '' });
      const detail = h('div', { class: 'set-detail' });

      const profileCard = h('div', { class: 'set-profile' },
        h('button', { class: 'sp-av', type: 'button', 'aria-label': 'Change profile photo', onclick: () => D.go('profile') }, h('span', { class: 'ring' }, D.avatar(me, 'xl', true)), h('span', { class: 'cam' }, D.ic('camera', 'sm'))),
        h('div', { class: 'sp-b' }, h('b', {}, me.full_name, D.verified(me)), h('small', {}, '@' + me.username), h('span', { class: 'on-line' }, h('i', {}), 'Online')),
        h('button', { class: 'btn btn-outline btn-pill btn-sm', type: 'button', onclick: () => D.go('profile') }, D.t('Edit Profile'), D.ic('chevron-right', 'sm')));
      const premium = h('button', { class: 'set-premium', type: 'button', onclick: () => D.premium() }, h('span', { class: 'gem' }, D.ic('gem', 'lg')), h('span', {}, h('b', {}, 'Dyson Premium ', D.ic('crown', 'sm')), h('small', {}, D.t('Unlock more amazing features'))), h('span', { class: 'btn btn-primary btn-pill btn-sm' }, D.t('Upgrade Now'), D.ic('chevron-right', 'sm')));
      const list = h('div', { class: 'set-list' }, SECTIONS.map(([k, ic, t, s, tag]) => h('a', { class: 'set-item' + (sub === k ? ' on' : ''), href: '#settings/' + k },
        h('span', { class: 'si' }, D.ic(ic)), h('span', { class: 'sb' }, h('b', {}, D.t(t), tag ? h('em', { class: 'new' }, tag) : ''), k === 'about' ? h('small', {}, `Version ${D.version} • Build ${D.build}`) : h('small', {}, D.t(s))),
        k === 'appearance' ? h('span', { class: 'chip theme-chip' }, D.ic(document.documentElement.dataset.theme === 'dark' ? 'moon' : 'sun', 'sm'), document.documentElement.dataset.theme === 'dark' ? 'Dark' : 'Light') : k === 'language' ? h('span', { class: 'chip' }, ({ en: 'English', sw: 'Kiswahili', fr: 'Français', es: 'Español' })[P().get('lang')] || 'English') : '',
        D.ic('chevron-right', 'sm'))));
      const logout = h('button', { class: 'set-logout', type: 'button', onclick: async () => { if (await D.confirm('Log out?', 'You can sign back in any time.', 'Log out', true)) D.logout(); } }, D.ic('logout'), D.t('Log Out'));
      const left = h('div', { class: 'set-left' }, profileCard, premium, list, logout);

      const head = D.vhead({ title: D.t('Settings'), sub: D.t('Manage your Dyson experience'), back: true, actions: [D.bellBtn()] });
      wrap.append(left, detail);
      ctx.stage.replaceChildren(h('div', { class: 'page settings' }, head, wrap));
      this._detail = detail; this._wrap = wrap; this._list = list;
      this._off = D.on('theme', () => { const c = $('.theme-chip', list); if (c) { const d = document.documentElement.dataset.theme === 'dark'; c.replaceChildren(D.ic(d ? 'moon' : 'sun', 'sm'), d ? 'Dark' : 'Light'); } });
      this.paint(sub);
    },
    update(ctx) {
      const desktop = matchMedia('(min-width:900px)').matches, sub = ctx.route.a || (desktop ? 'account' : '');
      this._wrap.dataset.sub = ctx.route.a || ''; this.paint(sub);
      D.$$('.set-item', this._list).forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#settings/' + sub));
    },
    paint(sub) {
      const d = this._detail; if (d._cleanup) { d._cleanup(); d._cleanup = null; }
      d.replaceChildren();
      const sec = SECTIONS.find((s) => s[0] === sub);
      if (!sec) return;
      const body = h('div', { class: 'set-body' });
      d.append(h('div', { class: 'set-dhead' }, h('button', { class: 'icon-btn ring back-btn', type: 'button', 'aria-label': 'Back to settings', onclick: () => D.go('settings') }, D.ic('back')), h('span', { class: 'si big' }, D.ic(sec[1])), h('div', {}, h('h2', {}, D.t(sec[2])), sec[3] ? h('p', { class: 'muted' }, D.t(sec[3])) : '')), body);
      Promise.resolve(PAGES[sub](body)).catch((e) => body.append(D.empty('alert', 'Could not load', D.err(e)))).then(() => { d._cleanup = body._cleanup; });
      document.getElementById('stage').scrollTop = 0;
    },
    leave() { if (this._off) this._off(); if (this._detail && this._detail._cleanup) this._detail._cleanup(); },
  });
})();
