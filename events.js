/* DYSON events.js — create events, RSVP (going / maybe / can't), add to calendar (.ics), community events. */
(function () {
  const { h, $, sb } = D;
  const E = (D.events = {});
  const when = (e) => { const s = new Date(e.starts_at); return s.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + D.fmtTime(s); };
  const ics = (e) => {
    const f = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const esc = (s) => String(s || '').replace(/[\\;,]/g, (m) => '\\' + m).replace(/\n/g, '\\n');
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DYSON//EN', 'BEGIN:VEVENT', 'UID:' + e.id + '@dyson', 'DTSTAMP:' + f(Date.now()), 'DTSTART:' + f(e.starts_at), 'DTEND:' + f(e.ends_at || new Date(+new Date(e.starts_at) + 36e5)), 'SUMMARY:' + esc(e.title), 'LOCATION:' + esc(e.location), 'DESCRIPTION:' + esc(e.description), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  };

  E.card = (e, reload) => {
    const d = new Date(e.starts_at), mine = e.organizer_id === D.uid;
    const rsvp = async (resp) => {
      const same = e.my_response === resp;
      const { error } = same ? await sb.from('event_rsvps').delete().match({ event_id: e.id, user_id: D.uid }) : await sb.from('event_rsvps').upsert({ event_id: e.id, user_id: D.uid, response: resp });
      if (error) return D.toast(D.err(error), 'error'); D.toast(same ? 'RSVP removed' : resp === 'going' ? 'You are going 🎉' : 'Saved', 'success', 1500); reload();
    };
    const b = (resp, label) => h('button', { class: 'chip' + (e.my_response === resp ? ' on' : ''), type: 'button', onclick: () => rsvp(resp) }, label);
    return h('article', { class: 'ecard' },
      h('div', { class: 'edate' }, h('b', {}, d.getDate()), h('small', {}, d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase())),
      h('div', { class: 'ebody' }, h('h3', {}, e.title), h('p', { class: 'muted' }, D.ic('clock', 'sm'), when(e)), e.location ? h('p', { class: 'muted' }, D.ic('map-pin', 'sm'), e.location) : '',
        e.description ? h('p', { class: 'edesc' }, e.description) : '', h('p', { class: 'hint' }, `${e.going} going · by ${mine ? 'you' : e.organizer_name || 'someone'}`),
        h('div', { class: 'echips' }, b('going', 'Going'), b('maybe', 'Maybe'), b('no', 'Can’t go'),
          h('button', { class: 'chip', type: 'button', onclick: () => D.download(e.title.replace(/\W+/g, '-') + '.ics', new Blob([ics(e)], { type: 'text/calendar' })) }, D.ic('calendar', 'sm'), 'Add to calendar'),
          mine ? h('button', { class: 'chip', type: 'button', onclick: async () => { if (!(await D.confirm('Delete event?', 'It will be removed for everyone.', 'Delete', true))) return; const { error } = await sb.from('events').delete().eq('id', e.id); if (error) return D.toast(D.err(error), 'error'); reload(); } }, D.ic('trash', 'sm'), 'Delete') : '')));
  };

  E.openCreate = (opts = {}, done) => {
    const soon = new Date(Date.now() + 864e5); soon.setMinutes(0, 0, 0); const iso = (d) => new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
    const t = h('input', { class: 'input', placeholder: 'Event name', maxlength: 80 }), loc = h('input', { class: 'input', placeholder: 'Where? (place or link)', maxlength: 120 });
    const s = h('input', { class: 'input', type: 'datetime-local', value: iso(soon) }), en = h('input', { class: 'input', type: 'datetime-local' });
    const d = h('textarea', { class: 'input', rows: 3, placeholder: 'What should people know?', maxlength: 500 });
    const pub = h('input', { type: 'checkbox' }); pub.checked = !opts.community_id;
    const go = h('button', { class: 'btn btn-primary', type: 'button' }, 'Create event');
    const mo = D.modal({ title: 'New event', body: [D.field('Name', t), D.field('Starts', s), D.field('Ends (optional)', en), D.field('Location', loc), D.field('Details', d), h('label', { class: 'check' }, pub, opts.community_id ? 'Anyone can see this event (not just community members)' : 'Public — everyone on Dyson can see it')], actions: [h('button', { class: 'btn', type: 'button', onclick: () => mo.close() }, 'Cancel'), go] });
    go.onclick = async () => {
      if (t.value.trim().length < 2) return D.toast('Give the event a name.', 'info'); if (!s.value) return D.toast('Pick a start time.', 'info');
      if (en.value && new Date(en.value) <= new Date(s.value)) return D.toast('End must be after the start.', 'error');
      D.busy(go, true, 'Creating…');
      const { data, error } = await sb.from('events').insert({ organizer_id: D.uid, community_id: opts.community_id || null, title: t.value.trim(), description: d.value.trim() || null, location: loc.value.trim() || null, starts_at: new Date(s.value).toISOString(), ends_at: en.value ? new Date(en.value).toISOString() : null, is_public: pub.checked }).select('id').single();
      if (error) { D.busy(go, false); return D.toast(D.err(error), 'error'); }
      await sb.from('event_rsvps').upsert({ event_id: data.id, user_id: D.uid, response: 'going' });
      mo.close(); D.toast('Event created', 'success'); D.refreshBadges(); done && done();
    };
  };

  E.forCommunity = async (cid, joined) => {
    const box = h('div', { class: 'ev-list' });
    const load = async () => {
      const { data, error } = await sb.rpc('list_events', { only_mine: false });
      if (error) return box.replaceChildren(D.empty('alert', 'Could not load events', D.err(error)));
      const rows = (data || []).filter((e) => e.community_id === cid);
      box.replaceChildren(...(rows.length ? rows.map((e) => E.card(e, load)) : [h('p', { class: 'hint pad' }, 'No upcoming events yet.')]));
    };
    load();
    return h('div', {}, joined ? h('button', { class: 'btn btn-sm btn-primary', type: 'button', style: { marginBottom: '10px' }, onclick: () => E.openCreate({ community_id: cid }, load) }, D.ic('plus', 'sm'), 'New event') : '', box);
  };

  D.register('events', {
    layout: 'page',
    render(ctx) {
      let tab = 'all'; const list = h('div', { class: 'ev-list' }, D.spinner()), tabs = h('div', { class: 'filters' });
      const load = async () => {
        const { data, error } = await sb.rpc('list_events', { only_mine: tab === 'mine' });
        if (error) return list.replaceChildren(D.empty('alert', 'Could not load events', D.err(error)));
        list.replaceChildren(...((data || []).length ? data.map((e) => E.card(e, load)) : [D.empty('calendar', tab === 'mine' ? 'Nothing planned' : 'No upcoming events', tab === 'mine' ? 'RSVP “Going” to an event and it shows up here.' : 'Create the first one and invite people.', h('button', { class: 'btn btn-primary btn-pill', type: 'button', onclick: () => E.openCreate({}, load) }, 'Create event'))]));
        D.refreshBadges();
      };
      const paintTabs = () => tabs.replaceChildren(...[['all', 'Upcoming'], ['mine', 'My events']].map(([k, l]) => h('button', { class: 'filter' + (tab === k ? ' on' : ''), type: 'button', onclick: () => { tab = k; paintTabs(); load(); } }, l)));
      ctx.stage.replaceChildren(h('div', { class: 'page narrow' }, D.vhead({ title: D.t('Events'), sub: 'Meet-ups, launches and plans', back: true, actions: [h('button', { class: 'btn btn-primary btn-pill', type: 'button', onclick: () => E.openCreate({}, load) }, D.ic('plus', 'sm'), 'New')] }), tabs, list));
      paintTabs(); load(); this._o = [D.on('events:change', load)];
    },
    leave() { (this._o || []).forEach((f) => f && f()); },
  });
})();
