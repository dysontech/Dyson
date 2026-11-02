# DYSON 9 — Connect without limits

Static web app (HTML + CSS + JS, no build step) on **Supabase**. One flat folder — upload it as-is to any HTTPS static host
(Netlify, Vercel, Cloudflare Pages, GitHub Pages, Supabase Hosting…).

## Setup (10 minutes)

1. **Database.** Supabase → SQL Editor:
   1. If this is a brand-new project, run `supabase_setup_dyson8a.sql` (from your old zip) first.
   2. Then run **`supabase_setup_dyson9.sql`** (safe to re-run). It fixes the recursive security policies from 8a,
      adds the new tables, storage buckets/policies and turns on realtime.
2. **Config.** `config.js` already holds your Supabase URL + anon key. Never put a service-role key in it.
3. **Auth** (Supabase → Authentication):
   - URL configuration: add your site URL and `…/start.html` to *Redirect URLs*.
   - Email provider on. To let people in instantly, turn **off** "Confirm email"; leave on for verified sign-ups.
   - Google (optional): enable the provider and paste your Google OAuth client.
4. **Host over HTTPS** (needed for camera, microphone, calls, install-to-home-screen, notifications).
5. Open `index.html`.

## What each screen does (all wired to Supabase)

| Screen | Works how |
|---|---|
| Chats | Direct chats, groups, replies, edit/delete, forward, reactions, pin, voice notes, photos/video/files (drag-drop, paste), typing, read receipts, in-chat search, export |
| Communities | Public/private, join/leave, invite link, members, media, events tab, pinned post |
| Calls | Real WebRTC voice/video, signalling over Supabase Realtime, call history (missed/outgoing/incoming), mute/camera/flip/reactions |
| Status | Photo/video/text, 24 h, viewer, reply, view count, highlights, audience control |
| AI Assistant | Summarise a chat (analyses your real messages), draft message, translate (MyMemory), find info (messages, people, Wikipedia), maths/time. Optional LLM via `edge-function-ai.ts` |
| Profile | Followers/following, posts, media, highlights, edit profile/cover/avatar, share link |
| Dyson Vault | Files are AES-256-GCM encrypted **in the browser** before upload; passphrase never leaves the device |
| Discover | People, communities, businesses, live streams |
| Dyson Live | Host streams camera/mic to viewers over WebRTC with live chat + hearts |
| Events | Create, RSVP, add to calendar (.ics), community events |
| Business | Business profile + catalog + directory, message/call the owner |
| Workspace | Private tasks (due dates) and notes |
| Notifications | Followers, events, missed calls, live, communities (database triggers) |
| Settings | Account & Security (email, password, PIN lock, sign out everywhere, export, delete account) · Privacy (last seen, online, read receipts, who can message, discoverable, blocked) · Notifications · Appearance (theme, 7 accents, wallpaper, text size) · Data & Storage (usage, cache) · Chats · Calls (devices, test) · AI · Language (EN/SW/FR/ES) · Help (FAQ + support tickets) · About (install, updates) |

## Files (flat)

`index.html` welcome · `start.html/js` sign-in/up · `app.html` shell ·
`core.js` foundation · `app.js` router/shell/search · `convo.js` conversation engine · `chats.js` lists, groups, info ·
`calls.js` · `status.js` · `ai.js` · `profile.js` · `settings.js` · `vault.js` · `discover.js` · `live.js` · `events.js` ·
`business.js` · `workspace.js` · `notify.js` · `home.js` · `contacts.js` · `emoji.js` · `crop.js` · `lock.js` · `i18n.js` ·
`style.css` + `views.css` · `icons.svg` · `sw.js` + `manifest.webmanifest` · legal/help pages ·
`supabase_setup_dyson9.sql` · `edge-function-ai.ts` (optional).

## Honest limits

- **Calls/Live need the other person's app open** — there is no push-notification server. Calls use STUN only; for users on
  strict mobile networks add a TURN server in `config.js` (`ICE_SERVERS`). Live is host→viewer mesh: fine for ~8 viewers, not thousands. No group calls.
- **Phone sign-in** is number + password mapped to an internal email; it does **not** send an SMS code.
- **Premium** is a waitlist only — no payments are processed.
- **Vault:** forget the passphrase and the files are gone (by design).
- **AI:** without `AI_ENDPOINT` the assistant uses built-in tools and free public APIs, not a large language model.
- Old `chat_groups*` tables from 8a are no longer used (groups are now regular conversations); nothing was dropped.
- This build was verified in a headless browser against a mocked Supabase (every screen + 39 interaction checks). It has
  **not** been run against your live Supabase project — run the SQL, then click through once and report anything odd.
