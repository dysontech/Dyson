/* DYSON workspace.js — personal tasks (with due dates) and notes, stored privately in workspace_items. */
(function () {
  const { h, $, sb } = D;

  D.register('workspace', {
    layout: 'page',
    render(ctx) {
      let tab = 'tasks', filter = 'open', items = [];
      const tabs = h('div', { class: 'filters' }), body = h('div', {});
      const paintTabs = () => tabs.replaceChildren(...[['tasks', 'Tasks'], ['notes', 'Notes']].map(([k, l]) => h('button', { class: 'filter' + (tab === k ? ' on' : ''), type: 'button', onclick: () => { tab = k; paintTabs(); paint(); } }, l, h('b', {}, items.filter((i) => i.kind === (k === 'tasks' ? 'task' : 'note') && !i.done).length || ''))));
      async function load() {
        const { data, error } = await sb.from('workspace_items').select('*').order('created_at', { ascending: false }).limit(500);
        if (error) return body.replaceChildren(D.empty('alert', 'Could not load', D.err(error))); items = data || []; paintTabs(); paint();
      }
      function paint() { tab === 'tasks' ? paintTasks() : paintNotes(); }

      function paintTasks() {
        const inp = h('input', { class: 'input', placeholder: 'Add a task and press Enter', maxlength: 140, 'aria-label': 'New task' }), due = h('input', { class: 'input due', type: 'date', 'aria-label': 'Due date' });
        const add = async () => { const t = inp.value.trim(); if (!t) return; inp.value = ''; const { data, error } = await sb.from('workspace_items').insert({ user_id: D.uid, kind: 'task', title: t, due_at: due.value ? new Date(due.value + 'T23:59:00').toISOString() : null }).select('*').single(); if (error) return D.toast(D.err(error), 'error'); due.value = ''; items.unshift(data); paintTabs(); paintTasks(); };
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
        const tasks = items.filter((i) => i.kind === 'task'), shown = tasks.filter((t) => (filter === 'open' ? !t.done : filter === 'done' ? t.done : true)).sort((a, b) => (a.due_at ? +new Date(a.due_at) : 9e15) - (b.due_at ? +new Date(b.due_at) : 9e15));
        const seg = D.seg([['open', 'Open'], ['done', 'Done'], ['all', 'All']], filter, (v) => { filter = v; paintTasks(); });
        const list = h('div', { class: 'rows' }, shown.length ? shown.map((t) => {
          const late = t.due_at && !t.done && new Date(t.due_at) < new Date();
          const cb = h('input', { type: 'checkbox', 'aria-label': 'Done' }); cb.checked = t.done;
          cb.onchange = async () => { t.done = cb.checked; const { error } = await sb.from('workspace_items').update({ done: t.done }).eq('id', t.id); if (error) D.toast(D.err(error), 'error'); paintTabs(); paintTasks(); };
          return h('div', { class: 'row task' + (t.done ? ' done' : '') }, h('label', { class: 'tick' }, cb, h('span', {})), h('div', { class: 'row-b' }, h('b', {}, t.title), t.due_at ? h('small', { class: late ? 'bad' : '' }, (late ? 'Overdue · ' : 'Due ') + new Date(t.due_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })) : ''),
            h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Delete task', onclick: async () => { await sb.from('workspace_items').delete().eq('id', t.id); items = items.filter((x) => x.id !== t.id); paintTabs(); paintTasks(); } }, D.ic('trash', 'sm')));
        }) : [D.empty('check-square', filter === 'done' ? 'Nothing completed yet' : 'All clear', filter === 'open' ? 'Add a task above to get started.' : '')]);
        body.replaceChildren(h('div', { class: 'sheet-row' }, inp, due, h('button', { class: 'btn btn-primary', type: 'button', onclick: add }, D.ic('plus', 'sm'), 'Add')), h('div', { style: { margin: '12px 0' } }, seg), list);
      }

      function noteModal(n) {
        const t = h('input', { class: 'input', value: (n && n.title) || '', placeholder: 'Title', maxlength: 80 }), b = h('textarea', { class: 'input', rows: 8, placeholder: 'Write your note…' }); b.value = (n && n.body) || '';
        const go = h('button', { class: 'btn btn-primary', type: 'button' }, 'Save');
        const mo = D.modal({ title: n ? 'Edit note' : 'New note', wide: true, body: [D.field('Title', t), D.field('Note', b)], actions: [n ? h('button', { class: 'btn btn-danger', type: 'button', onclick: async () => { await sb.from('workspace_items').delete().eq('id', n.id); mo.close(); load(); } }, 'Delete') : h('button', { class: 'btn', type: 'button', onclick: () => mo.close() }, 'Cancel'), go] });
        go.onclick = async () => { if (!t.value.trim() && !b.value.trim()) return mo.close(); D.busy(go, true, 'Saving…'); const row = { title: t.value.trim() || 'Untitled', body: b.value }; const { error } = await (n ? sb.from('workspace_items').update(row).eq('id', n.id) : sb.from('workspace_items').insert(Object.assign({ user_id: D.uid, kind: 'note' }, row))); if (error) { D.busy(go, false); return D.toast(D.err(error), 'error'); } mo.close(); load(); };
      }
      function paintNotes() {
        const notes = items.filter((i) => i.kind === 'note');
        body.replaceChildren(h('div', { class: 'sheet-row', style: { marginBottom: '12px' } }, h('button', { class: 'btn btn-primary', type: 'button', onclick: () => noteModal(null) }, D.ic('plus', 'sm'), 'New note')),
          notes.length ? h('div', { class: 'notes' }, notes.map((n) => h('button', { class: 'note', type: 'button', onclick: () => noteModal(n) }, h('b', {}, n.title), h('p', {}, (n.body || '').slice(0, 160)), h('small', {}, D.fmtList(n.created_at))))) : D.empty('note', 'No notes yet', 'Capture ideas, lists and meeting notes. Only you can see them.'));
      }
      ctx.stage.replaceChildren(h('div', { class: 'page narrow' }, D.vhead({ title: D.t('Workspace'), sub: 'Private tasks and notes', back: true }), tabs, body)); body.replaceChildren(D.spinner()); load();
    },
  });
})();
