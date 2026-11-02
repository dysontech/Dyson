/* DYSON notify.js — notifications centre (followers, events, missed calls, live, communities). */
(function () {
  const { h, $, sb } = D;
  const ICON = { follow: 'user-plus', event: 'calendar', call: 'phone-missed', live: 'radio', community: 'users' };

  D.register('notifications', {
    layout: 'page',
    render(ctx) {
      const list = h('div', { class: 'rows notifs' }, D.spinner());
      const load = async () => {
        const { data, error } = await sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(80);
        if (error) return list.replaceChildren(D.empty('alert', 'Could not load', D.err(error)));
        const rows = data || [], ids = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))];
        const { data: ps } = ids.length ? await sb.from('profiles').select('id,full_name,avatar_url').in('id', ids) : { data: [] }; const pm = new Map((ps || []).map((p) => [p.id, p]));
        D.setBadge('notif', rows.filter((r) => !r.read).length);
        list.replaceChildren(...(rows.length ? rows.map((n) => {
          const a = pm.get(n.actor_id);
          return h('button', { class: 'row notif' + (n.read ? '' : ' unread'), type: 'button', onclick: async () => { if (!n.read) { await sb.from('notifications').update({ read: true }).eq('id', n.id); D.refreshBadges(); } if (n.link) D.go(n.link); else load(); } },
            h('span', { class: 'n-av' }, a ? D.avatar(a, 'md') : h('span', { class: 'avatar md', style: { background: 'var(--elev)' } }, D.ic(ICON[n.kind] || 'bell')), h('span', { class: 'n-ic' }, D.ic(ICON[n.kind] || 'bell', 'sm'))),
            h('div', { class: 'row-b' }, h('b', {}, a ? a.full_name + ' ' : '', h('span', { class: 'plain' }, n.title || '')), n.body ? h('small', {}, n.body) : '', h('small', {}, D.ago(n.created_at) === 'now' ? 'Just now' : D.ago(n.created_at) + ' ago')), n.read ? '' : h('i', { class: 'udot' }));
        }) : [D.empty('bell', 'You are all caught up', 'New followers, events, missed calls and live streams will show here.')]));
      };
      const mark = async () => { const { error } = await sb.from('notifications').update({ read: true }).eq('user_id', D.uid).eq('read', false); if (error) return D.toast(D.err(error), 'error'); D.toast('All marked as read', 'success', 1400); load(); };
      const clear = async () => { if (!(await D.confirm('Clear all notifications?', 'This removes them from your list.', 'Clear', true))) return; await sb.from('notifications').delete().eq('user_id', D.uid); load(); };
      ctx.stage.replaceChildren(h('div', { class: 'page narrow' }, D.vhead({ title: D.t('Notifications'), back: true, actions: [h('button', { class: 'btn btn-sm', type: 'button', onclick: mark }, D.ic('check-double', 'sm'), 'Mark all read'), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Clear all', onclick: clear }, D.ic('trash'))] }), list));
      load(); this._o = [D.on('notif:new', load)];
    },
    leave() { (this._o || []).forEach((f) => f && f()); },
  });
})();
