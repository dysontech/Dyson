/* DYSON ai.js — Dyson Assistant (Beta).
   Works out of the box with no API key:
     • Summarise a chat  → analyses your real messages (participants, topics, open questions, dates, links)
     • Draft a message   → composes from purpose + tone + details, then sends or copies
     • Translate         → MyMemory public translation API (internet needed)
     • Find information  → your messages, people, and Wikipedia
     • Quick maths, date & time
   Optional: set DYSON_CONFIG.AI_ENDPOINT to your own endpoint (see edge-function-ai.ts) for open-ended LLM answers. */
(function () {
  const { h, $, sb } = D;
  const A = (D.ai = {});
  const LANGS = [['en', 'English'], ['sw', 'Kiswahili'], ['fr', 'French'], ['es', 'Spanish'], ['de', 'German'], ['pt', 'Portuguese'], ['ar', 'Arabic'], ['hi', 'Hindi'], ['zh-CN', 'Chinese'], ['ja', 'Japanese'], ['ru', 'Russian'], ['it', 'Italian'], ['tr', 'Turkish']];
  D.LANGS = LANGS;
  const STOP = new Set('the a an and or but if then so of to in on at for from with by is are was were be been it its this that these those i you he she we they me my your our their us them do does did not no yes ok okay just have has had will would can could should about what when where who how why there here as up out get got going go like also too very really more some any all one im ive dont cant lol hey hi hello thanks thank please'.split(' '));
  const wiki = () => (['en', 'sw', 'fr', 'es', 'de', 'pt', 'ar', 'hi', 'ja', 'ru', 'it', 'tr'].includes(D.prefs.data.aiLang) ? D.prefs.data.aiLang : 'en') + '.wikipedia.org';

  /* ---------- tools ---------- */
  async function lookup(q) {
    const host = wiki();
    const r = await fetch(`https://${host}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&origin=*&srlimit=3`).then((x) => x.json());
    const hit = r.query && r.query.search && r.query.search[0]; if (!hit) return null;
    const s = await fetch(`https://${host}/api/rest_v1/page/summary/${encodeURIComponent(hit.title)}`).then((x) => x.json());
    return { title: s.title || hit.title, extract: s.extract || '', url: (s.content_urls && s.content_urls.desktop && s.content_urls.desktop.page) || `https://${host}/wiki/${encodeURIComponent(hit.title)}`, thumb: s.thumbnail && s.thumbnail.source };
  }
  async function translate(text, to) {
    const parts = text.match(/[^.!?\n]+[.!?\n]*/g) || [text], chunks = [];
    let cur = ''; parts.forEach((p) => { if ((cur + p).length > 450) { chunks.push(cur); cur = p; } else cur += p; }); if (cur) chunks.push(cur);
    const out = [];
    for (const c of chunks) {
      const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(c)}&langpair=${encodeURIComponent('Autodetect|' + to)}`).then((x) => x.json());
      if (!r.responseData || r.responseStatus >= 400) throw new Error(r.responseDetails || 'Translation service unavailable');
      out.push(r.responseData.translatedText);
    }
    return out.join(' ');
  }
  function calc(expr) {
    if (!/^[\d\s+\-*/().%^,]+$/.test(expr) || !/\d/.test(expr)) return null;
    try { const v = Function('"use strict";return (' + expr.replace(/,/g, '').replace(/\^/g, '**') + ')')(); return typeof v === 'number' && isFinite(v) ? v : null; } catch (e) { return null; }
  }
  async function summarise(c) {
    const { data, error } = await sb.from('messages').select('sender_id,content,msg_type,created_at').eq('conversation_id', c.conversation_id).is('deleted_at', null).order('created_at', { ascending: false }).limit(250);
    if (error) throw error;
    const msgs = (data || []).reverse(); if (!msgs.length) return 'There are no messages in this chat yet.';
    let people = {}; if (c.kind !== 'direct') { const { data: pp } = await sb.rpc('conversation_people', { cid: c.conversation_id }); (pp || []).forEach((p) => { people[p.user_id] = p.full_name; }); }
    const nameOf = (id) => (id === D.uid ? 'You' : c.kind === 'direct' ? D.nm(c) : people[id] || 'Someone');
    const counts = {}, words = {}, media = { image: 0, video: 0, audio: 0, file: 0 }; const texts = [];
    msgs.forEach((m) => { const n = nameOf(m.sender_id); counts[n] = (counts[n] || 0) + 1; if (media[m.msg_type] != null) media[m.msg_type]++; if (m.msg_type === 'text' && m.content) { texts.push(m); m.content.toLowerCase().replace(/https?:\/\/\S+/g, ' ').match(/[a-zà-ÿ']{4,}/g)?.forEach((w) => { if (!STOP.has(w)) words[w] = (words[w] || 0) + 1; }); } });
    const topics = Object.entries(words).sort((a, b) => b[1] - a[1]).slice(0, 6).map((x) => x[0]);
    const score = (t) => (/\?/.test(t) ? 2 : 0) + (/\b\d{1,2}[:.]\d{2}\b|\b(mon|tues|wednes|thurs|fri|satur|sun)day\b|\b(tomorrow|tonight|today|next week|deadline|at \d)/i.test(t) ? 3 : 0) + (/https?:\/\//.test(t) ? 2 : 0) + (/\b(need|must|please|remember|don't forget|important|urgent|agree|decid|confirm)/i.test(t) ? 2 : 0) + Math.min(2, t.length / 80);
    const key = texts.map((m) => ({ m, s: score(m.content) })).filter((x) => x.s >= 2).sort((a, b) => b.s - a.s).slice(0, 5).sort((a, b) => new Date(a.m.created_at) - new Date(b.m.created_at));
    const last = texts[texts.length - 1];
    const lines = [`Summary of “${D.nm(c)}” — ${msgs.length} recent messages, ${D.fmtDay(msgs[0].created_at)} to ${D.fmtDay(msgs.at(-1).created_at)}.`, '',
      'Who’s talking: ' + Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([n, k]) => `${n} (${k})`).join(', ')];
    if (topics.length) lines.push('Main topics: ' + topics.join(', '));
    const mm = Object.entries(media).filter((x) => x[1]).map(([k, v]) => `${v} ${k === 'audio' ? 'voice/audio' : k}${v > 1 ? 's' : ''}`); if (mm.length) lines.push('Shared: ' + mm.join(', '));
    if (key.length) { lines.push('', 'Key points & open questions:'); key.forEach((x) => lines.push(`• ${nameOf(x.m.sender_id)}: ${x.m.content.length > 140 ? x.m.content.slice(0, 137) + '…' : x.m.content}`)); }
    if (last) lines.push('', `Latest: ${nameOf(last.sender_id)} — “${last.content.length > 120 ? last.content.slice(0, 117) + '…' : last.content}” (${D.fmtList(last.created_at)})`);
    return lines.join('\n');
  }
  const BODY = {
    followup: ['I wanted to follow up on {d|our last conversation}. Have you had a chance to look at it?', 'Just checking in on {d|what we discussed}. Let me know if you need anything from me.'],
    thanks: ['Thank you so much for {d|your help}. I really appreciate it.', 'I’m grateful for {d|everything you did}. It made a real difference.'],
    apology: ['I’m sorry about {d|the mix-up}. That’s on me, and I’ll make it right.', 'Please accept my apologies for {d|the inconvenience}. It won’t happen again.'],
    meeting: ['Could we find time to meet about {d|a quick catch-up}? I’m flexible this week.', 'I’d like to set up a call to discuss {d|next steps}. What time suits you?'],
    reminder: ['A quick reminder about {d|our plan}. Please let me know if anything changes.', 'Friendly nudge regarding {d|the deadline}. Shout if you need a hand.'],
    congrats: ['Congratulations on {d|your achievement}! You earned it.', 'Huge congratulations on {d|the news}! So happy for you.'],
    intro: ['I’d like to introduce myself{ — d}. I’d love to connect.', 'I’m reaching out about {d|a possible collaboration}. Would you be open to a chat?'],
    birthday: ['Happy birthday{ — d}! Wishing you a wonderful year ahead.', 'Many happy returns! I hope your day is full of joy{, d}.'],
    late: ['I’m running a little late{ because d}. I’ll be there as soon as I can.', 'Sorry, I’ll be about {d|10 minutes} late. Thanks for waiting.'],
  };
  const PURPOSES = [['followup', 'Follow up'], ['thanks', 'Say thank you'], ['apology', 'Apologise'], ['meeting', 'Request a meeting'], ['reminder', 'Reminder'], ['congrats', 'Congratulate'], ['intro', 'Introduce myself'], ['birthday', 'Birthday wish'], ['late', 'Running late']];
  function compose(purpose, tone, name, details, variant) {
    const d = (details || '').trim().replace(/[.!?]+$/, '');
    let b = BODY[purpose][variant % 2].replace(/\{d\|([^}]*)\}/g, (_, def) => d || def).replace(/\{([^}]*?)d([^}]*)\}/g, (_, pre, post) => (d ? pre + d + post : ''));
    if (tone === 'short') b = b.split(/(?<=[.!?])\s/)[0];
    const to = name && name.trim() ? name.trim() : '';
    const greet = tone === 'professional' ? `Dear ${to || 'there'},` : `Hi${to ? ' ' + to : ''},`;
    const close = tone === 'professional' ? `Kind regards,\n${D.me.full_name}` : tone === 'short' ? 'Thanks!' : 'Talk soon! 😊';
    if (tone === 'professional') b = b.replace(/I’m/g, 'I am').replace(/I’d/g, 'I would').replace(/won’t/g, 'will not').replace(/That’s/g, 'That is').replace(/Shout if/g, 'Please let me know if').replace(/Friendly nudge/g, 'A gentle reminder');
    return tone === 'short' ? `${greet} ${b} ${close}` : `${greet}\n\n${b}\n\n${close}`;
  }

  /* ---------- history ---------- */
  const HK = () => 'dyson-ai-' + D.uid;
  const loadHist = () => { if (!D.prefs.data.aiHistory) return []; try { return JSON.parse(localStorage.getItem(HK()) || '[]'); } catch (e) { return []; } };
  const saveHist = (h2) => { if (D.prefs.data.aiHistory) { try { localStorage.setItem(HK(), JSON.stringify(h2.slice(-60))); } catch (e) { /* full */ } } };
  A.clearHistory = () => { localStorage.removeItem(HK()); };

  /* ---------- view ---------- */
  D.register('ai', {
    layout: 'page',
    render(ctx) {
      if (!D.prefs.data.aiOn) {
        ctx.stage.replaceChildren(h('div', { class: 'page narrow' }, D.vhead({ title: D.t('AI Assistant'), back: true }), D.empty('spark', 'AI Assistant is turned off', 'Turn it on to get summaries, drafts, translations and smart replies.', h('button', { class: 'btn btn-primary btn-pill', type: 'button', onclick: () => { D.prefs.set('aiOn', true); D.emit('route', D.route()); } }, 'Turn on'))));
        return;
      }
      let hist = loadHist(), busy = false;
      const log = h('div', { class: 'ai-log', role: 'log', 'aria-live': 'polite' });
      const hero = h('div', { class: 'ai-hero' },
        h('div', { class: 'ai-bot' }, h('span', { class: 'ai-halo' }), D.ic('bot', 'xl')),
        h('h2', {}, 'Hello! 👋'), h('p', { class: 'muted' }, 'How can I help you today?'));
      const actions = h('div', { class: 'ai-actions' },
        act('note', 'Summarise this chat', 'Pick a conversation and get the gist', toolSummarise), act('edit', 'Draft a message', 'Follow-ups, thanks, reminders and more', toolDraft),
        act('languages', 'Translate this text', 'Into 13 languages', toolTranslate), act('search', 'Find information…', 'Your messages, people and the web', () => toolFind()));
      function act(icon, t, s, fn) { return h('button', { class: 'ai-act', type: 'button', onclick: fn }, h('span', { class: 'ai-act-ic' }, D.ic(icon)), h('span', {}, h('b', {}, t), h('small', {}, s)), D.ic('chevron-right', 'sm')); }
      const input = h('input', { class: 'input', placeholder: 'Ask me anything…', 'aria-label': 'Ask the assistant', maxlength: 600 });
      const send = h('button', { class: 'send', type: 'button', 'aria-label': 'Send' }, D.ic('send'));
      const bar = h('form', { class: 'ai-bar', onsubmit: (e) => { e.preventDefault(); ask(input.value); } }, input, send);
      send.type = 'submit';
      const body = h('div', { class: 'ai-body' }, hero, actions, log);

      const scroll = () => { ctx.stage.scrollTo({ top: ctx.stage.scrollHeight, behavior: 'smooth' }); };
      const bubble = (role, content) => h('div', { class: 'ai-msg ' + role }, role === 'ai' ? h('span', { class: 'avatar-ai sm-av' }, D.ic('spark', 'sm')) : '', h('div', { class: 'ai-b' }, content));
      const say = (role, text, extra) => { const el = bubble(role, [h('p', {}, text.split('\n').flatMap((l, i, a) => (i < a.length - 1 ? [l, h('br')] : [l]))), extra || '']); log.append(el); collapse(); scroll(); return el; };
      const card = (title, content) => { const el = bubble('ai', h('div', { class: 'ai-card' }, h('b', {}, title), content)); log.append(el); collapse(); scroll(); return el; };
      const collapse = () => { hero.classList.add('small'); actions.classList.add('small'); };
      const remember = (role, text) => { hist.push({ role, text }); saveHist(hist); };
      hist.forEach((m) => log.append(bubble(m.role, h('p', {}, m.text)))); if (hist.length) collapse();
      const typing = () => { const t = bubble('ai', h('span', { class: 'typing inline' }, h('i'), h('i'), h('i'))); log.append(t); scroll(); return t; };

      function chatPicker(title, onPick) {
        const rows = D.store.convs.slice(0, 12);
        if (!rows.length) return say('ai', 'You have no chats yet. Start a conversation first and I can summarise it.');
        card(title, h('div', { class: 'rows tight' }, rows.map((c) => h('button', { class: 'row', type: 'button', onclick: () => onPick(c) }, D.chatAvatar(c, 'sm'), h('div', { class: 'row-b' }, h('b', {}, D.nm(c)), h('small', {}, c.last_content || 'No messages')), D.ic('chevron-right', 'sm')))));
      }
      async function toolSummarise() {
        say('user', 'Summarise a chat');
        chatPicker('Which conversation?', async (c) => {
          const t = typing();
          try { const s = await summarise(c); t.remove(); say('ai', s); remember('ai', s); } catch (e) { t.remove(); say('ai', 'I could not read that chat: ' + D.err(e)); }
        });
      }
      function toolDraft() {
        say('user', 'Draft a message');
        const purpose = h('select', { class: 'select' }, PURPOSES.map(([v, l]) => h('option', { value: v }, l)));
        const tone = D.seg([['friendly', 'Friendly'], ['professional', 'Professional'], ['short', 'Short']], 'friendly', (v) => { toneV = v; });
        let toneV = 'friendly', variant = 0;
        const name = h('input', { class: 'input', placeholder: 'Who is it for? (optional)' }), det = h('input', { class: 'input', placeholder: 'Details, e.g. “the project schedule” (optional)' });
        const outTa = h('textarea', { class: 'input', rows: 6, hidden: '' });
        const regen = () => { outTa.value = compose(purpose.value, toneV, name.value, det.value, variant++); outTa.hidden = false; btns.hidden = false; };
        const btns = h('div', { class: 'two', hidden: '' },
          h('button', { class: 'btn btn-sm', type: 'button', onclick: () => D.copy(outTa.value, 'Draft copied') }, D.ic('copy', 'sm'), 'Copy'),
          h('button', { class: 'btn btn-sm', type: 'button', onclick: regen }, D.ic('refresh', 'sm'), 'Another version'),
          h('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: () => sendTo(outTa.value) }, D.ic('send', 'sm'), 'Send to a chat'));
        card('Draft a message', h('div', { class: 'ai-form' }, D.field('Purpose', purpose), D.field('Tone', tone), D.field('To', name), D.field('About', det), h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: regen }, 'Write it'), outTa, btns));
      }
      function sendTo(text) {
        if (!text.trim()) return;
        chatPicker('Send to which chat?', async (c) => {
          const { error } = await sb.from('messages').insert({ conversation_id: c.conversation_id, sender_id: D.uid, content: text, msg_type: 'text' });
          if (error) return D.toast(D.err(error), 'error'); D.toast('Sent to ' + D.nm(c), 'success'); D.refreshChats();
        });
      }
      function toolTranslate(prefill) {
        say('user', 'Translate some text');
        const src = h('textarea', { class: 'input', rows: 4, placeholder: 'Paste or type the text to translate' }); if (typeof prefill === 'string') src.value = prefill;
        const to = h('select', { class: 'select' }, LANGS.map(([v, l]) => h('option', { value: v, selected: v === D.prefs.data.aiLang }, l)));
        const out = h('div', { class: 'ai-out', hidden: '' });
        const go = h('button', { class: 'btn btn-primary btn-block', type: 'button' }, 'Translate');
        go.onclick = async () => {
          if (!src.value.trim()) return; D.busy(go, true, 'Translating…');
          try { const r = await translate(src.value.trim(), to.value);
            out.replaceChildren(h('p', {}, r), h('div', { class: 'two' }, h('button', { class: 'btn btn-sm', type: 'button', onclick: () => D.copy(r, 'Translation copied') }, D.ic('copy', 'sm'), 'Copy'),
              'speechSynthesis' in window ? h('button', { class: 'btn btn-sm', type: 'button', onclick: () => { const u = new SpeechSynthesisUtterance(r); u.lang = to.value; speechSynthesis.cancel(); speechSynthesis.speak(u); } }, D.ic('volume', 'sm'), 'Listen') : '',
              h('button', { class: 'btn btn-sm', type: 'button', onclick: () => sendTo(r) }, D.ic('send', 'sm'), 'Send'))); out.hidden = false; remember('ai', r); }
          catch (e) { out.replaceChildren(h('p', { class: 'bad' }, 'Could not translate: ' + (e.message || 'service unavailable') + '. Check your connection and try again.')); out.hidden = false; }
          D.busy(go, false);
        };
        card('Translate', h('div', { class: 'ai-form' }, D.field('Text (language detected automatically)', src), D.field('Translate into', to), go, out));
        if (typeof prefill === 'string' && prefill) go.click();
      }
      async function toolFind(q) {
        const inp = h('input', { class: 'input', placeholder: 'What are you looking for?' }), out = h('div', { class: 'ai-out' }); inp.value = q || '';
        const run = async () => {
          const s = inp.value.trim(); if (s.length < 2) return; out.replaceChildren(D.spinner());
          const [m, p, w] = await Promise.all([sb.rpc('search_messages', { q: s }), sb.rpc('search_people', { q: s }), lookup(s).catch(() => null)]);
          const parts = [];
          if ((m.data || []).length) parts.push(h('b', { class: 'hits-h' }, 'In your messages'), ...m.data.slice(0, 4).map((x) => { const c = D.store.convs.find((k) => k.conversation_id === x.conversation_id); return h('button', { class: 'row', type: 'button', onclick: () => D.go((c && c.kind === 'community' ? 'communities/' : 'chats/') + x.conversation_id) }, h('div', { class: 'row-b' }, h('b', {}, c ? D.nm(c) : 'Chat'), h('small', {}, x.content)), D.ic('chevron-right', 'sm')); }));
          if ((p.data || []).length) parts.push(h('b', { class: 'hits-h' }, 'People'), ...p.data.slice(0, 3).map((u) => h('button', { class: 'row', type: 'button', onclick: () => D.go('profile/' + u.id) }, D.avatar(u, 'sm'), h('div', { class: 'row-b' }, h('b', {}, u.full_name), h('small', {}, '@' + u.username)))));
          if (w && w.extract) parts.push(h('b', { class: 'hits-h' }, 'From Wikipedia'), h('div', { class: 'wiki' }, w.thumb ? h('img', { src: w.thumb, alt: '' }) : '', h('div', {}, h('b', {}, w.title), h('p', {}, w.extract.length > 480 ? w.extract.slice(0, 477) + '…' : w.extract), h('a', { href: w.url, target: '_blank', rel: 'noopener noreferrer' }, 'Read more'))));
          out.replaceChildren(...(parts.length ? parts : [h('p', { class: 'muted' }, 'I found nothing for “' + s + '”. Try different words.')]));
        };
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
        card('Find information', h('div', { class: 'ai-form' }, h('div', { class: 'sheet-row' }, inp, h('button', { class: 'btn btn-primary', type: 'button', onclick: run }, 'Search')), out));
        if (q) run(); else inp.focus();
      }

      async function ask(raw) {
        const text = raw.trim(); if (!text || busy) return; input.value = ''; busy = true;
        say('user', text); remember('user', text);
        const l = text.toLowerCase();
        try {
          let m;
          if (/^(translate)\b/.test(l)) { const t = text.replace(/^translate\s*/i, ''); toolTranslate(t); }
          else if (/\b(summari[sz]e|summary|recap)\b/.test(l)) toolSummarise();
          else if (/^(draft|write|compose)\b.*(message|text|reply|email|note)|^draft\b/.test(l)) toolDraft();
          else if (/^(find|search|look up|lookup)\b/.test(l)) toolFind(text.replace(/^(find|search( for)?|look ?up)\s*/i, ''));
          else if ((m = calc(text.replace(/^(what('| i)s|calculate|calc|=)\s*/i, '').replace(/[?=]+$/, '')))) { const s = `${text.replace(/[?=]+$/, '')} = ${Number.isInteger(m) ? m : +m.toFixed(8)}`; say('ai', s); remember('ai', s); }
          else if (/\b(what('| i)?s the )?(time|date|day)\b/.test(l) && text.length < 40) { const d = new Date(), s = `It is ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} on ${d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.`; say('ai', s); remember('ai', s); }
          else if (/^(hi|hello|hey|good (morning|afternoon|evening)|habari|salut|hola)\b/.test(l) && text.length < 30) { const s = `Hello ${D.me.full_name.split(' ')[0]}! I can summarise a chat, draft a message, translate text or look something up. What would you like?`; say('ai', s); remember('ai', s); }
          else {
            const t = typing(); let reply = null;
            if (D.cfg.AI_ENDPOINT) { reply = await remote(text).catch((e) => { console.warn('AI endpoint', e); return null; }); }
            if (!reply) { const w = await lookup(text.replace(/^(what|who|when|where|why|how)( is| are| was| were| does| do|'s)?( a| an| the)?\s*/i, '').replace(/[?]+$/, '') || text).catch(() => null); if (w && w.extract) reply = `${w.title}: ${w.extract.length > 600 ? w.extract.slice(0, 597) + '…' : w.extract}\n\nSource: ${w.url}`; }
            t.remove();
            if (!reply) reply = 'I am not sure about that one. I can summarise a chat, draft a message, translate text or search your messages, people and Wikipedia — try one of the buttons above.';
            say('ai', reply); remember('ai', reply);
          }
        } catch (e) { say('ai', 'Something went wrong: ' + D.err(e)); }
        busy = false;
      }
      async function remote(text) {
        const { data: { session } } = await sb.auth.getSession();
        const r = await fetch(D.cfg.AI_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session ? session.access_token : ''), apikey: D.cfg.SUPABASE_ANON_KEY }, body: JSON.stringify({ messages: hist.slice(-12).map((x) => ({ role: x.role === 'ai' ? 'assistant' : 'user', content: x.text })).concat([{ role: 'user', content: text }]), language: D.prefs.data.aiLang }) });
        if (!r.ok) throw new Error('HTTP ' + r.status); const j = await r.json(); return j.reply || null;
      }

      ctx.stage.replaceChildren(h('div', { class: 'ai-page' },
        D.vhead({ title: D.t('AI Assistant'), sub: 'Beta', back: true, actions: [h('button', { class: 'icon-btn ring', type: 'button', 'aria-label': 'Clear conversation', onclick: async () => { if (await D.confirm('Clear this conversation?', 'This only removes the assistant history on this device.', 'Clear')) { A.clearHistory(); D.emit('route', D.route()); } } }, D.ic('trash'))] }), body), bar);
      ctx.stage.classList.add('has-bar');
      if (hist.length) setTimeout(scroll, 50);
    },
    leave() { const s = document.getElementById('stage'); if (s) s.classList.remove('has-bar'); },
  });
})();
