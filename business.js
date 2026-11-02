/* DYSON business.js — create a business profile, manage a product/service catalog, browse the directory. */
(function () {
  const { h, $, sb } = D;
  const B = (D.business = {});
  const CATS = ['Retail', 'Food & drink', 'Services', 'Beauty', 'Education', 'Health', 'Tech', 'Fashion', 'Travel', 'Creative', 'Other'];
  const money = (n, c) => { try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: c || 'USD', maximumFractionDigits: 2 }).format(n); } catch (e) { return (c || '') + ' ' + n; } };
  const img = (it) => (it.image_path ? D.publicUrl('post-media', it.image_path) : '');

  B.open = async (id) => {
    const [{ data: b }, { data: items }] = await Promise.all([sb.from('businesses').select('*').eq('id', id).maybeSingle(), sb.from('business_items').select('*').eq('business_id', id).order('created_at', { ascending: false })]);
    if (!b) return D.toast('Business not found.', 'error');
    const own = b.owner_id === D.uid;
    const mo = D.modal({ title: b.name, wide: true, body: [
      h('div', { class: 'biz-head' }, D.avatar({ full_name: b.name, avatar_url: b.logo_url }, 'xl'), h('div', {}, h('span', { class: 'tag' }, b.category || 'Business'), h('p', {}, b.description || ''))),
      h('div', { class: 'biz-info' }, b.address ? h('p', {}, D.ic('map-pin', 'sm'), b.address) : '', b.hours ? h('p', {}, D.ic('clock', 'sm'), b.hours) : '', b.phone ? h('a', { href: 'tel:' + b.phone }, D.ic('phone', 'sm'), b.phone) : '', b.email ? h('a', { href: 'mailto:' + b.email }, D.ic('mail', 'sm'), b.email) : ''),
      h('h4', { style: { margin: '14px 0 8px' } }, 'Catalog'),
      h('div', { class: 'biz-items' }, (items || []).length ? items.map((it) => h('div', { class: 'biz-item' }, it.image_path ? h('img', { src: img(it), alt: '', loading: 'lazy', onclick: () => D.viewMedia({ url: img(it) }) }) : h('div', { class: 'noimg' }, D.ic('bag', 'lg')), h('b', {}, it.title), it.description ? h('small', {}, it.description) : '', it.price != null ? h('span', { class: 'price' }, money(it.price, it.currency)) : '')) : [h('p', { class: 'hint' }, 'No items listed yet.')])],
      actions: own ? [h('button', { class: 'btn', type: 'button', onclick: () => mo.close() }, 'Close')] : [h('button', { class: 'btn btn-outline', type: 'button', onclick: () => { mo.close(); D.calls.start({ id: b.owner_id, full_name: b.name, avatar_url: b.logo_url }, false); } }, D.ic('phone', 'sm'), 'Call'), h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { mo.close(); D.openChatWith(b.owner_id); } }, D.ic('chat', 'sm'), 'Message')] });
  };

  function editBusiness(b, done) {
    const f = { name: h('input', { class: 'input', value: (b && b.name) || '', maxlength: 60 }), cat: h('select', { class: 'select' }, CATS.map((c) => h('option', { selected: b && b.category === c }, c))), desc: h('textarea', { class: 'input', rows: 3, maxlength: 400 }), phone: h('input', { class: 'input', type: 'tel', value: (b && b.phone) || '' }), email: h('input', { class: 'input', type: 'email', value: (b && b.email) || '' }), addr: h('input', { class: 'input', value: (b && b.address) || '' }), hours: h('input', { class: 'input', value: (b && b.hours) || '', placeholder: 'Mon–Sat 8am–6pm' }) };
    f.desc.value = (b && b.description) || ''; let logo = b && b.logo_url;
    const lp = h('button', { class: 'btn btn-sm', type: 'button', onclick: async () => { const [x] = await D.pickFile('image/*'); if (!x) return; const bad = D.checkImage(x); if (bad) return D.toast(bad, 'error'); const c = await D.crop(x); if (!c) return; try { const path = `${D.uid}/biz-logo-${Date.now()}.jpg`; await D.upload('avatars', path, c, { upsert: true }); logo = D.publicUrl('avatars', path); lp.textContent = 'Logo ✓'; } catch (e) { D.toast(D.err(e), 'error'); } } }, D.ic('camera', 'sm'), logo ? 'Change logo' : 'Add logo');
    const go = h('button', { class: 'btn btn-primary', type: 'button' }, b ? 'Save' : 'Create business');
    const mo = D.modal({ title: b ? 'Edit business' : 'Create business profile', wide: true, body: [D.field('Business name', f.name), D.field('Category', f.cat), D.field('About', f.desc), lp, h('div', { style: { height: '12px' } }), D.field('Phone', f.phone), D.field('Email', f.email), D.field('Address', f.addr), D.field('Opening hours', f.hours)], actions: [h('button', { class: 'btn', type: 'button', onclick: () => mo.close() }, 'Cancel'), go] });
    go.onclick = async () => {
      if (f.name.value.trim().length < 2) return D.toast('Enter a business name.', 'info'); D.busy(go, true, 'Saving…');
      const row = { owner_id: D.uid, name: f.name.value.trim(), category: f.cat.value, description: f.desc.value.trim(), phone: f.phone.value.trim() || null, email: f.email.value.trim() || null, address: f.addr.value.trim() || null, hours: f.hours.value.trim() || null, logo_url: logo || null };
      const { error } = await sb.from('businesses').upsert(row, { onConflict: 'owner_id' }); if (error) { D.busy(go, false); return D.toast(D.err(error), 'error'); }
      mo.close(); D.toast('Business saved', 'success'); done();
    };
  }

  function editItem(b, it, done) {
    const t = h('input', { class: 'input', value: (it && it.title) || '', placeholder: 'Item name', maxlength: 80 }), p = h('input', { class: 'input', type: 'number', min: 0, step: '0.01', value: it && it.price != null ? it.price : '', placeholder: 'Price' }), c = h('input', { class: 'input', value: (it && it.currency) || 'USD', maxlength: 3, style: { textTransform: 'uppercase' } });
    const d = h('textarea', { class: 'input', rows: 2, maxlength: 200, placeholder: 'Short description' }); d.value = (it && it.description) || ''; let path = it && it.image_path;
    const ip = h('button', { class: 'btn btn-sm', type: 'button', onclick: async () => { const [x] = await D.pickFile('image/*'); if (!x) return; const bad = D.checkImage(x); if (bad) return D.toast(bad, 'error'); try { const pth = `${D.uid}/biz-${D.uuid()}.${(x.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')}`; await D.upload('post-media', pth, x); path = pth; ip.textContent = 'Photo ✓'; } catch (e) { D.toast(D.err(e), 'error'); } } }, D.ic('image', 'sm'), path ? 'Change photo' : 'Add photo');
    const go = h('button', { class: 'btn btn-primary', type: 'button' }, 'Save item');
    const mo = D.modal({ title: it ? 'Edit item' : 'Add item', body: [D.field('Name', t), h('div', { class: 'two' }, D.field('Price', p), D.field('Currency', c)), D.field('Description', d), ip], actions: [h('button', { class: 'btn', type: 'button', onclick: () => mo.close() }, 'Cancel'), go] });
    go.onclick = async () => {
      if (!t.value.trim()) return D.toast('Name the item.', 'info'); D.busy(go, true, 'Saving…');
      const row = { business_id: b.id, title: t.value.trim(), description: d.value.trim() || null, price: p.value === '' ? null : Number(p.value), currency: (c.value || 'USD').toUpperCase(), image_path: path || null };
      const { error } = await (it ? sb.from('business_items').update(row).eq('id', it.id) : sb.from('business_items').insert(row)); if (error) { D.busy(go, false); return D.toast(D.err(error), 'error'); } mo.close(); done();
    };
  }

  D.register('business', {
    layout: 'page',
    render(ctx) {
      let tab = 'mine'; const body = h('div', {}), tabs = h('div', { class: 'filters' });
      const paintTabs = () => tabs.replaceChildren(...[['mine', 'My business'], ['dir', 'Directory']].map(([k, l]) => h('button', { class: 'filter' + (tab === k ? ' on' : ''), type: 'button', onclick: () => { tab = k; paintTabs(); paint(); } }, l)));
      async function paint() {
        body.replaceChildren(D.spinner());
        if (tab === 'dir') {
          const { data } = await sb.from('businesses').select('*').order('created_at', { ascending: false }).limit(50);
          return body.replaceChildren(h('div', { class: 'dgrid' }, (data || []).length ? data.map((b) => h('div', { class: 'dcard', onclick: () => B.open(b.id), role: 'link', tabindex: 0 }, D.avatar({ full_name: b.name, avatar_url: b.logo_url }, 'lg'), h('b', {}, b.name), h('small', { class: 'dc-sub' }, b.category || 'Business'), h('small', { class: 'dc-desc' }, b.description || ''))) : [D.empty('briefcase', 'No businesses yet', 'Be the first to list one.')]));
        }
        const { data: b } = await sb.from('businesses').select('*').eq('owner_id', D.uid).maybeSingle();
        if (!b) return body.replaceChildren(D.empty('briefcase', 'Put your business on Dyson', 'Create a profile with your catalog, hours and contact. Customers can message or call you in one tap.', h('button', { class: 'btn btn-primary btn-pill', type: 'button', onclick: () => editBusiness(null, paint) }, 'Create business profile')));
        const { data: items } = await sb.from('business_items').select('*').eq('business_id', b.id).order('created_at', { ascending: false });
        body.replaceChildren(
          h('div', { class: 'biz-card' }, D.avatar({ full_name: b.name, avatar_url: b.logo_url }, 'xl'), h('div', { class: 'grow' }, h('h2', {}, b.name), h('span', { class: 'tag' }, b.category || 'Business'), h('p', { class: 'muted' }, b.description || 'No description yet.')), h('div', { class: 'two' }, h('button', { class: 'btn btn-sm', type: 'button', onclick: () => B.open(b.id) }, D.ic('eye', 'sm'), 'Preview'), h('button', { class: 'btn btn-sm', type: 'button', onclick: () => editBusiness(b, paint) }, D.ic('pen', 'sm'), 'Edit'))),
          h('div', { class: 'sheet-row', style: { margin: '18px 0 10px', alignItems: 'center' } }, h('h3', { style: { flex: 1 } }, `Catalog (${(items || []).length})`), h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => editItem(b, null, paint) }, D.ic('plus', 'sm'), 'Add item')),
          h('div', { class: 'biz-items' }, (items || []).length ? items.map((it) => h('div', { class: 'biz-item' }, it.image_path ? h('img', { src: img(it), alt: '', loading: 'lazy' }) : h('div', { class: 'noimg' }, D.ic('bag', 'lg')), h('b', {}, it.title), it.price != null ? h('span', { class: 'price' }, money(it.price, it.currency)) : '',
            h('div', { class: 'two' }, h('button', { class: 'btn btn-sm', type: 'button', onclick: () => editItem(b, it, paint) }, 'Edit'), h('button', { class: 'btn btn-sm btn-danger', type: 'button', onclick: async () => { if (!(await D.confirm('Delete item?', it.title, 'Delete', true))) return; await sb.from('business_items').delete().eq('id', it.id); paint(); } }, 'Delete')))) : [h('p', { class: 'hint' }, 'Add your first product or service.')]));
      }
      ctx.stage.replaceChildren(h('div', { class: 'page' }, D.vhead({ title: D.t('Business'), sub: 'Your storefront on Dyson', back: true }), tabs, body)); paintTabs(); paint();
    },
  });
})();
