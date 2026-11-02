/* DYSON contacts: saved names (shown instead of profile names), add / edit / remove / export. */
(function () {
  const { h, sb } = D;
  const C = (D.contacts = { list: [], map: new Map() });

  C.load = async () => {
    try {
      const { data, error } = await sb.rpc('list_contacts');
      if (error) throw error;
      C.list = data || [];
      C.map = new Map(C.list.filter((c) => c.contact_id).map((c) => [c.contact_id, c.saved_name]));
      D.emit('contacts');
    } catch (e) { console.warn('contacts', e); }
  };
  C.name = (id) => C.map.get(id);
  C.has = (id) => C.map.has(id);

  C.save = async (name, handle) => {
    const { error } = await sb.rpc('add_contact', { p_name: name, p_phone: handle });
    if (error) throw error;
    await C.load();
  };

  C.add = (prefill = {}) => {
    const name = h('input', { class: 'input', placeholder: 'Contact name', maxlength: 60, autocomplete: 'off' });
    const who = h('input', { class: 'input', placeholder: '@username, email or phone number', autocomplete: 'off' });
    name.value = prefill.name || ''; who.value = prefill.handle || '';
    const msg = h('div', { class: 'form-msg error', hidden: '' });
    const ok = h('button', { class: 'btn btn-primary', type: 'button' }, 'Save contact');
    const mo = D.modal({
      title: 'New contact',
      body: [msg, D.field('Name', name), D.field('Find them by', who, 'Use their Dyson @username, their account email or the phone number on their account.')],
      actions: [h('button', { class: 'btn', type: 'button', onclick: () => mo.close() }, 'Cancel'), ok],
    });
    ok.onclick = async () => {
      msg.hidden = true;
      if (!name.value.trim() || !who.value.trim()) { msg.textContent = 'Enter a name and who to look up.'; msg.hidden = false; return; }
      D.busy(ok, true, 'Saving…');
      try { await C.save(name.value.trim(), who.value.trim()); D.toast('Contact saved', 'success'); mo.close(); D.loadChats(); }
      catch (e) { msg.textContent = /not found/i.test(e.message || '') ? 'No Dyson user matches that username, email or phone.' : D.err(e); msg.hidden = false; }
      D.busy(ok, false);
    };
  };

  C.manage = () => {
    const q = h('input', { class: 'input', type: 'search', placeholder: 'Search contacts' });
    const box = h('div', { class: 'rows' });
    const draw = () => {
      const s = q.value.trim().toLowerCase();
      const rows = C.list.filter((c) => !s || (c.saved_name + ' ' + (c.username || '')).toLowerCase().includes(s));
      box.replaceChildren(...(rows.length ? rows.map((c) => h('div', { class: 'row' },
        D.avatar({ full_name: c.saved_name, avatar_url: c.avatar_url }, 'md'),
        h('div', { class: 'row-b' }, h('b', {}, c.saved_name), h('small', {}, c.username ? '@' + c.username : 'Not on Dyson yet')),
        c.contact_id ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Message', onclick: () => { sh.close(); D.openChatWith(c.contact_id); } }, D.ic('chat')) : '',
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Rename', onclick: async () => {
          const v = await D.ask('Rename contact', { value: c.saved_name }); if (!v) return;
          const { error } = await sb.rpc('update_contact', { cid: c.contact_id, p_name: v }); if (error) return D.toast(D.err(error), 'error'); await C.load(); draw(); D.loadChats();
        } }, D.ic('pen')),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Remove', onclick: async () => {
          if (!(await D.confirm('Remove contact?', `${c.saved_name} will no longer be saved in your contacts.`, 'Remove', true))) return;
          const { error } = await sb.rpc('remove_contact', { cid: c.contact_id }); if (error) return D.toast(D.err(error), 'error'); await C.load(); draw(); D.loadChats();
        } }, D.ic('trash')))) : [D.empty('contacts', 'No contacts yet', 'Save people to see their names here and control who can message you.')]));
    };
    q.addEventListener('input', draw);
    const exp = h('button', { class: 'btn btn-sm', type: 'button', onclick: () => {
      const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      const csv = ['name,username'].concat(C.list.map((c) => esc(c.saved_name) + ',' + esc(c.username || ''))).join('\n');
      D.download('dyson-contacts.csv', new Blob([csv], { type: 'text/csv' }));
    } }, D.ic('download', 'sm'), 'Export CSV');
    const sh = D.sheet([h('div', { class: 'sheet-row' }, q, h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => { sh.close(); C.add(); } }, D.ic('user-plus', 'sm'), 'Add')), box, h('div', { style: { marginTop: '12px' } }, exp)], { title: 'Contacts' });
    draw();
  };
})();
