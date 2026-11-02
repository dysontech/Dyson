/* DYSON vault.js — Dyson Vault: files are encrypted in your browser (AES-256-GCM, key from your passphrase via
   PBKDF2-SHA256, 250k iterations) BEFORE upload. Supabase only ever stores ciphertext. Lose the passphrase → files are unrecoverable. */
(function () {
  const { h, $, sb } = D;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = (buf) => { let s = ''; new Uint8Array(buf).forEach((b) => { s += String.fromCharCode(b); }); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const MAX = 50 * 1024 * 1024;
  let key = null;

  async function derive(pass, salt) {
    const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  const iconFor = (m = '', n = '') => (m.startsWith('image/') ? 'image' : m.startsWith('video/') ? 'video' : m.startsWith('audio/') ? 'music' : /pdf|doc|sheet|text|presentation/.test(m) || /\.(pdf|docx?|xlsx?|pptx?|txt|csv)$/i.test(n) ? 'note' : 'file');

  async function decryptFile(f) {
    const { data, error } = await sb.storage.from('vault').download(f.path); if (error) throw error;
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(f.iv) }, key, await data.arrayBuffer());
    return new Blob([plain], { type: f.mime || 'application/octet-stream' });
  }

  D.register('vault', {
    layout: 'page',
    async render(ctx) {
      const root = h('div', { class: 'page narrow vault' }, D.spinner());
      ctx.stage.replaceChildren(root);
      const { data: meta, error } = await sb.from('vault_meta').select('*').eq('user_id', D.uid).maybeSingle();
      if (error) return root.replaceChildren(D.vhead({ title: D.t('Dyson Vault'), back: true }), D.empty('alert', 'Vault unavailable', D.err(error)));
      const hero = (sub) => h('div', { class: 'vault-hero' }, h('div', { class: 'vault-art' }, h('span', { class: 'orb' }), D.ic('cloud', 'xl')), h('h2', {}, 'Dyson Vault'), h('p', { class: 'muted' }, sub));
      const checks = h('ul', { class: 'vchecks' }, ['Secure Storage', 'End-to-End Privacy', 'Access Anywhere'].map((t) => h('li', {}, h('span', {}, D.ic('check', 'sm')), t)));

      /* --- create or unlock --- */
      if (!key) {
        const pass = h('input', { class: 'input', type: 'password', placeholder: meta ? 'Vault passphrase' : 'Choose a passphrase (8+ characters)', autocomplete: meta ? 'current-password' : 'new-password' });
        const pass2 = h('input', { class: 'input', type: 'password', placeholder: 'Repeat passphrase', autocomplete: 'new-password' });
        const msg = h('div', { class: 'form-msg error', hidden: '' });
        const go = h('button', { class: 'btn btn-primary btn-block btn-pill', type: 'submit' }, meta ? 'Unlock vault' : 'Create my vault');
        const form = h('form', { class: 'vault-form', onsubmit: async (e) => {
          e.preventDefault(); msg.hidden = true;
          try {
            D.busy(go, true, meta ? 'Unlocking…' : 'Creating…');
            if (!meta) {
              if (pass.value.length < 8) throw new Error('Use at least 8 characters.'); if (pass.value !== pass2.value) throw new Error('Passphrases do not match.');
              const salt = crypto.getRandomValues(new Uint8Array(16)), k = await derive(pass.value, salt), iv = crypto.getRandomValues(new Uint8Array(12));
              const blob = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, enc.encode('dyson-vault-ok'));
              const { error: er } = await sb.from('vault_meta').insert({ user_id: D.uid, salt: b64(salt), check_iv: b64(iv), check_blob: b64(blob) }); if (er) throw er;
              key = k; D.toast('Vault created. Remember your passphrase — it cannot be recovered.', 'success', 6000);
            } else {
              const k = await derive(pass.value, unb64(meta.salt));
              try { const ok = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(meta.check_iv) }, k, unb64(meta.check_blob)); if (dec.decode(ok) !== 'dyson-vault-ok') throw 0; } catch (x) { throw new Error('Wrong passphrase.'); }
              key = k;
            }
            D.emit('route', D.route());
          } catch (er) { msg.textContent = er.message || D.err(er); msg.hidden = false; D.busy(go, false); }
        } }, msg, pass, meta ? '' : pass2, go,
          meta ? h('button', { class: 'link-btn', type: 'button', onclick: resetVault }, 'Forgot passphrase? Reset vault') : h('p', { class: 'hint' }, 'Your passphrase never leaves this device. If you forget it, your files cannot be recovered.'));
        root.replaceChildren(D.vhead({ title: D.t('Dyson Vault'), back: true }), hero('Your private space for important files and memories.'), checks, form);
        return;
      }

      /* --- unlocked --- */
      let files = [], q = '';
      const list = h('div', { class: 'rows' }), total = h('small', { class: 'hint' }, '');
      const search = h('input', { class: 'input', type: 'search', placeholder: 'Search files' }); search.addEventListener('input', () => { q = search.value.toLowerCase(); paint(); });
      const paint = () => {
        const rows = files.filter((f) => !q || f.name.toLowerCase().includes(q));
        total.textContent = `${files.length} file${files.length === 1 ? '' : 's'} · ${D.bytes(files.reduce((s, f) => s + Number(f.size || 0), 0))} (encrypted)`;
        list.replaceChildren(...(rows.length ? rows.map((f) => h('div', { class: 'row' }, h('span', { class: 'ficon' }, D.ic(iconFor(f.mime, f.name))), h('div', { class: 'row-b' }, h('b', {}, f.name), h('small', {}, `${D.bytes(f.size)} · ${D.fmtDay(f.created_at)}`)),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Open', onclick: () => open(f) }, D.ic('eye')), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Download', onclick: () => save(f) }, D.ic('download')),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Delete', onclick: () => del(f) }, D.ic('trash')))) : [D.empty('folder', files.length ? 'No matches' : 'Your vault is empty', files.length ? '' : 'Upload files — they are encrypted before they leave your device.')]));
      };
      const load = async () => { const { data, error: er } = await sb.from('vault_files').select('*').eq('user_id', D.uid).order('created_at', { ascending: false }); if (er) return list.replaceChildren(D.empty('alert', 'Could not load files', D.err(er))); files = data || []; paint(); };
      async function open(f) { try { D.toast('Decrypting…', 'info', 1200); const b = await decryptFile(f), u = URL.createObjectURL(b); if (f.mime && (f.mime.startsWith('image/') || f.mime.startsWith('video/'))) D.viewMedia({ url: u, type: f.mime.startsWith('video') ? 'video' : 'image', name: f.name }); else window.open(u, '_blank', 'noopener'); } catch (e) { D.toast('Could not decrypt this file.', 'error'); } }
      async function save(f) { try { D.download(f.name, await decryptFile(f)); } catch (e) { D.toast('Could not decrypt this file.', 'error'); } }
      async function del(f) { if (!(await D.confirm('Delete file?', `“${f.name}” will be permanently deleted.`, 'Delete', true))) return; await sb.storage.from('vault').remove([f.path]); const { error: er } = await sb.from('vault_files').delete().eq('id', f.id); if (er) return D.toast(D.err(er), 'error'); files = files.filter((x) => x.id !== f.id); paint(); }
      const upload = async () => {
        const picked = await D.pickFile('', true); if (!picked.length) return;
        const bar = h('div', { class: 'prog' }, h('i')), lbl = h('small', { class: 'hint' }, ''); const mo = D.modal({ title: 'Encrypting & uploading', body: [lbl, bar] });
        let n = 0;
        for (const f of picked) {
          n++; lbl.textContent = `${n}/${picked.length} · ${f.name}`; bar.firstChild.style.width = ((n - 1) / picked.length) * 100 + '%';
          if (f.size > MAX) { D.toast(`${f.name} is over 50 MB — skipped.`, 'error'); continue; }
          try {
            const iv = crypto.getRandomValues(new Uint8Array(12)), cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, await f.arrayBuffer());
            const path = `${D.uid}/${D.uuid()}`; const { error: ue } = await sb.storage.from('vault').upload(path, new Blob([cipher]), { contentType: 'application/octet-stream' }); if (ue) throw ue;
            const { error: ie } = await sb.from('vault_files').insert({ user_id: D.uid, name: f.name, mime: f.type, size: f.size, path, iv: b64(iv) }); if (ie) { await sb.storage.from('vault').remove([path]); throw ie; }
          } catch (e) { D.toast(`${f.name}: ${D.err(e)}`, 'error'); }
        }
        mo.close(); D.toast('Upload complete', 'success'); load();
      };
      async function resetVault() {
        if (!(await D.confirm('Reset vault?', 'This permanently deletes ALL vault files and the passphrase. It cannot be undone.', 'Delete everything', true))) return;
        const { data } = await sb.from('vault_files').select('path').eq('user_id', D.uid); if (data && data.length) await sb.storage.from('vault').remove(data.map((x) => x.path));
        await sb.from('vault_files').delete().eq('user_id', D.uid); await sb.from('vault_meta').delete().eq('user_id', D.uid); key = null; D.toast('Vault reset', 'success'); D.emit('route', D.route());
      }
      root.replaceChildren(D.vhead({ title: D.t('Dyson Vault'), back: true, actions: [h('button', { class: 'icon-btn ring', type: 'button', 'aria-label': 'Lock vault', onclick: () => { key = null; D.emit('route', D.route()); } }, D.ic('lock')), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'More', onclick: (e) => D.popMenu([{ icon: 'trash', label: 'Reset vault…', danger: 1, fn: resetVault }], e.currentTarget) }, D.ic('more'))] }),
        hero('Unlocked — files are encrypted on your device.'), checks,
        h('div', { class: 'vault-cta' }, h('button', { class: 'btn btn-primary btn-pill', type: 'button', onclick: upload }, D.ic('upload', 'sm'), 'Upload Files'), h('button', { class: 'btn btn-outline btn-pill', type: 'button', onclick: () => { search.focus(); list.scrollIntoView({ behavior: 'smooth' }); } }, D.ic('folder', 'sm'), 'Browse Files')),
        h('div', { class: 'sheet-row', style: { margin: '18px 0 6px' } }, search), total, list);
      load();
    },
  });
})();
