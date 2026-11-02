-- =============================================================================
-- DYSON 9 — SUPABASE MIGRATION  (run AFTER supabase_setup_dyson8a.sql)
-- Dashboard > SQL Editor > New query > paste > Run.  Safe to re-run.
--
-- What this does
--   * Fixes the recursive Row-Level-Security policies from 8a (they caused
--     "infinite recursion detected in policy" on conversation_members).
--   * Adds the tables the new interface needs: blocks, follows, posts,
--     notifications, call_logs, events, businesses, workspace, vault, live, ...
--   * Turns every chat into one model (direct | group | community).
--   * Adds the realtime publication entries (8a never added them, so live
--     message delivery silently did nothing).
--   * Private storage policies for chat media, the vault and covers.
-- Nothing from 8a is dropped: existing users, profiles and messages are kept.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. Columns added to existing tables
-- -----------------------------------------------------------------------------
alter table public.profiles add column if not exists cover_url text;
alter table public.profiles add column if not exists verified boolean default false;
alter table public.profiles add column if not exists website text;
alter table public.profiles add column if not exists location text;

alter table public.user_preferences add column if not exists extra jsonb default '{}'::jsonb;

alter table public.privacy_settings add column if not exists read_receipts boolean default true;
alter table public.privacy_settings add column if not exists discoverable boolean default true;

alter table public.conversations add column if not exists kind text default 'direct';
alter table public.conversations add column if not exists title text;
alter table public.conversations add column if not exists description text;
alter table public.conversations add column if not exists avatar_url text;
alter table public.conversations add column if not exists cover_url text;
alter table public.conversations add column if not exists is_public boolean default false;
alter table public.conversations add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.conversations add column if not exists pinned_message uuid;
update public.conversations set kind = case when is_group then 'group' else 'direct' end where kind is null;

alter table public.conversation_members add column if not exists role text default 'member';
alter table public.conversation_members add column if not exists receipt_at timestamptz default now();

alter table public.messages add column if not exists edited_at timestamptz;
alter table public.messages add column if not exists deleted_at timestamptz;
alter table public.messages add column if not exists meta jsonb;

alter table public.statuses add column if not exists highlight boolean default false;
alter table public.statuses add column if not exists bg text;

-- -----------------------------------------------------------------------------
-- 2. New tables
-- -----------------------------------------------------------------------------
create table if not exists public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (blocker_id, blocked_id)
);

create table if not exists public.follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists idx_follows_followee on public.follows(followee_id);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text default '',
  media_path text,
  media_mime text,
  created_at timestamptz default now()
);
create index if not exists idx_posts_user on public.posts(user_id, created_at desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete cascade,
  kind text not null,
  title text,
  body text,
  link text,
  read boolean default false,
  created_at timestamptz default now()
);
create index if not exists idx_notif_user on public.notifications(user_id, created_at desc);

create table if not exists public.call_logs (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid not null references auth.users(id) on delete cascade,
  callee_id uuid not null references auth.users(id) on delete cascade,
  is_video boolean default false,
  status text default 'ringing',            -- ringing | answered | missed | declined | ended
  started_at timestamptz default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_s integer default 0
);
create index if not exists idx_calls_caller on public.call_logs(caller_id, started_at desc);
create index if not exists idx_calls_callee on public.call_logs(callee_id, started_at desc);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references auth.users(id) on delete cascade,
  community_id uuid references public.conversations(id) on delete set null,
  title text not null,
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  is_public boolean default true,
  created_at timestamptz default now()
);
create index if not exists idx_events_start on public.events(starts_at);

create table if not exists public.event_rsvps (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  response text not null default 'going',    -- going | maybe | no
  created_at timestamptz default now(),
  primary key (event_id, user_id)
);

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade unique,
  name text not null,
  category text,
  description text,
  phone text,
  email text,
  address text,
  hours text,
  logo_url text,
  created_at timestamptz default now()
);

create table if not exists public.business_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  title text not null,
  description text,
  price numeric(12,2),
  currency text default 'USD',
  image_path text,
  created_at timestamptz default now()
);

create table if not exists public.workspace_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'task',         -- task | note
  title text not null,
  body text,
  done boolean default false,
  due_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists idx_ws_user on public.workspace_items(user_id, created_at desc);

create table if not exists public.vault_meta (
  user_id uuid primary key references auth.users(id) on delete cascade,
  salt text not null,
  check_iv text not null,
  check_blob text not null,
  created_at timestamptz default now()
);

create table if not exists public.vault_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  mime text,
  size bigint,
  path text not null,
  iv text not null,
  created_at timestamptz default now()
);
create index if not exists idx_vault_user on public.vault_files(user_id, created_at desc);

create table if not exists public.live_streams (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  video boolean default true,
  active boolean default true,
  started_at timestamptz default now(),
  ended_at timestamptz
);
create index if not exists idx_live_active on public.live_streams(active, started_at desc);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  body text not null,
  created_at timestamptz default now()
);

create table if not exists public.premium_waitlist (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text default 'premium',
  created_at timestamptz default now()
);

-- -----------------------------------------------------------------------------
-- 3. Helper functions (SECURITY DEFINER so policies never recurse)
-- -----------------------------------------------------------------------------
create or replace function public.is_member(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversation_members where conversation_id = cid and user_id = auth.uid());
$$;

create or replace function public.is_conv_admin(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversation_members where conversation_id = cid and user_id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_blocked_pair(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;

-- A direct chat is closed if either side blocked the other.
create or replace function public.can_post(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_member(cid) and not exists (
    select 1 from conversations c
    join conversation_members o on o.conversation_id = c.id and o.user_id <> auth.uid()
    where c.id = cid and c.kind = 'direct' and public.is_blocked_pair(auth.uid(), o.user_id)
  );
$$;

create or replace function public.is_contact_of(owner uuid, other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from contacts where user_id = owner and contact_id = other);
$$;

-- -----------------------------------------------------------------------------
-- 4. Row-Level-Security: replace the recursive 8a policies
-- -----------------------------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

drop policy if exists "Conversations member access" on public.conversations;
drop policy if exists "conv_select" on public.conversations;
drop policy if exists "conv_update" on public.conversations;
create policy "conv_select" on public.conversations for select to authenticated
  using (public.is_member(id) or is_public = true);
create policy "conv_update" on public.conversations for update to authenticated
  using (public.is_conv_admin(id));

drop policy if exists "Conversation members access" on public.conversation_members;
drop policy if exists "cm_select" on public.conversation_members;
drop policy if exists "cm_update_self" on public.conversation_members;
drop policy if exists "cm_delete" on public.conversation_members;
create policy "cm_select" on public.conversation_members for select to authenticated
  using (public.is_member(conversation_id) or user_id = auth.uid());
create policy "cm_update_self" on public.conversation_members for update to authenticated
  using (user_id = auth.uid() or public.is_conv_admin(conversation_id));
create policy "cm_delete" on public.conversation_members for delete to authenticated
  using (user_id = auth.uid() or public.is_conv_admin(conversation_id));

drop policy if exists "Messages select policy" on public.messages;
drop policy if exists "Messages insert policy" on public.messages;
drop policy if exists "Messages update policy" on public.messages;
drop policy if exists "msg_select" on public.messages;
drop policy if exists "msg_insert" on public.messages;
drop policy if exists "msg_update" on public.messages;
create policy "msg_select" on public.messages for select to authenticated
  using (public.is_member(conversation_id) or exists (
    select 1 from conversations c where c.id = conversation_id and c.is_public = true and c.kind = 'community'));
create policy "msg_insert" on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.can_post(conversation_id));
create policy "msg_update" on public.messages for update to authenticated
  using (sender_id = auth.uid());
create policy "msg_delete" on public.messages for delete to authenticated
  using (sender_id = auth.uid());

-- Reactions
drop policy if exists "react_all" on public.message_reactions;
create policy "react_all" on public.message_reactions for all to authenticated
  using (exists (select 1 from messages m where m.id = message_id and public.is_member(m.conversation_id)))
  with check (user_id = auth.uid() and exists (select 1 from messages m where m.id = message_id and public.is_member(m.conversation_id)));

-- Profiles: allow own insert/update (already present) — nothing to change.

-- Statuses: allow owner update (highlights)
drop policy if exists "Statuses update own" on public.statuses;
create policy "Statuses update own" on public.statuses for update to authenticated using (user_id = auth.uid());
drop policy if exists "Status views own" on public.status_views;
create policy "Status views own" on public.status_views for all to authenticated
  using (viewer_id = auth.uid() or exists (select 1 from statuses s where s.id = status_id and s.user_id = auth.uid()))
  with check (viewer_id = auth.uid());
drop policy if exists "Status privacy own" on public.status_privacy;
create policy "Status privacy own" on public.status_privacy for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- New tables
alter table public.blocks enable row level security;
drop policy if exists "blocks_own" on public.blocks;
create policy "blocks_own" on public.blocks for all to authenticated
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

alter table public.follows enable row level security;
drop policy if exists "follows_read" on public.follows;
drop policy if exists "follows_write" on public.follows;
drop policy if exists "follows_delete" on public.follows;
create policy "follows_read" on public.follows for select to authenticated using (true);
create policy "follows_write" on public.follows for insert to authenticated with check (follower_id = auth.uid());
create policy "follows_delete" on public.follows for delete to authenticated using (follower_id = auth.uid());

alter table public.posts enable row level security;
drop policy if exists "posts_read" on public.posts;
drop policy if exists "posts_write" on public.posts;
create policy "posts_read" on public.posts for select to authenticated using (true);
create policy "posts_write" on public.posts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.notifications enable row level security;
drop policy if exists "notif_own" on public.notifications;
create policy "notif_own" on public.notifications for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.call_logs enable row level security;
drop policy if exists "calls_read" on public.call_logs;
drop policy if exists "calls_insert" on public.call_logs;
drop policy if exists "calls_update" on public.call_logs;
create policy "calls_read" on public.call_logs for select to authenticated
  using (caller_id = auth.uid() or callee_id = auth.uid());
create policy "calls_insert" on public.call_logs for insert to authenticated
  with check (caller_id = auth.uid() and not public.is_blocked_pair(caller_id, callee_id));
create policy "calls_update" on public.call_logs for update to authenticated
  using (caller_id = auth.uid() or callee_id = auth.uid());

alter table public.events enable row level security;
drop policy if exists "events_read" on public.events;
drop policy if exists "events_write" on public.events;
create policy "events_read" on public.events for select to authenticated
  using (is_public = true or organizer_id = auth.uid() or (community_id is not null and public.is_member(community_id)));
create policy "events_write" on public.events for all to authenticated
  using (organizer_id = auth.uid()) with check (organizer_id = auth.uid());

alter table public.event_rsvps enable row level security;
drop policy if exists "rsvp_read" on public.event_rsvps;
drop policy if exists "rsvp_write" on public.event_rsvps;
create policy "rsvp_read" on public.event_rsvps for select to authenticated using (true);
create policy "rsvp_write" on public.event_rsvps for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.businesses enable row level security;
drop policy if exists "biz_read" on public.businesses;
drop policy if exists "biz_write" on public.businesses;
create policy "biz_read" on public.businesses for select to authenticated using (true);
create policy "biz_write" on public.businesses for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table public.business_items enable row level security;
drop policy if exists "bitem_read" on public.business_items;
drop policy if exists "bitem_write" on public.business_items;
create policy "bitem_read" on public.business_items for select to authenticated using (true);
create policy "bitem_write" on public.business_items for all to authenticated
  using (exists (select 1 from businesses b where b.id = business_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from businesses b where b.id = business_id and b.owner_id = auth.uid()));

alter table public.workspace_items enable row level security;
drop policy if exists "ws_own" on public.workspace_items;
create policy "ws_own" on public.workspace_items for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.vault_meta enable row level security;
drop policy if exists "vm_own" on public.vault_meta;
create policy "vm_own" on public.vault_meta for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.vault_files enable row level security;
drop policy if exists "vf_own" on public.vault_files;
create policy "vf_own" on public.vault_files for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.live_streams enable row level security;
drop policy if exists "live_read" on public.live_streams;
drop policy if exists "live_write" on public.live_streams;
create policy "live_read" on public.live_streams for select to authenticated using (true);
create policy "live_write" on public.live_streams for all to authenticated
  using (host_id = auth.uid()) with check (host_id = auth.uid());

alter table public.support_tickets enable row level security;
drop policy if exists "tickets_own" on public.support_tickets;
create policy "tickets_own" on public.support_tickets for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.premium_waitlist enable row level security;
drop policy if exists "waitlist_own" on public.premium_waitlist;
create policy "waitlist_own" on public.premium_waitlist for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 5. RPC functions used by the app
-- -----------------------------------------------------------------------------

-- Chat list (direct + group + community) with unread counts
drop function if exists public.get_chats();
create or replace function public.get_chats()
returns table (
  conversation_id uuid, kind text, title text, avatar_url text,
  other_id uuid, full_name text, username text, other_avatar text, verified boolean,
  last_content text, last_type text, last_sender uuid, last_at timestamptz,
  unread bigint, favorite boolean, muted boolean, member_count bigint, role text
) language sql stable security definer set search_path = public as $$
  select
    c.id, coalesce(c.kind, case when c.is_group then 'group' else 'direct' end), c.title, c.avatar_url,
    o.user_id, p.full_name, p.username, p.avatar_url, p.verified,
    lm.content, lm.msg_type, lm.sender_id, coalesce(lm.created_at, c.created_at),
    (select count(*) from messages m
       where m.conversation_id = c.id and m.sender_id <> auth.uid() and m.deleted_at is null
         and m.created_at > me.last_read_at),
    me.favorite, me.muted,
    (select count(*) from conversation_members x where x.conversation_id = c.id),
    me.role
  from conversations c
  join conversation_members me on me.conversation_id = c.id and me.user_id = auth.uid()
  left join lateral (
    select user_id from conversation_members x
    where x.conversation_id = c.id and x.user_id <> auth.uid() and coalesce(c.kind,'direct') = 'direct' limit 1
  ) o on true
  left join profiles p on p.id = o.user_id
  left join lateral (
    select content, msg_type, sender_id, created_at from messages m
    where m.conversation_id = c.id order by created_at desc limit 1
  ) lm on true
  order by coalesce(lm.created_at, c.created_at) desc;
$$;

-- Start (or reuse) a direct chat — honours "who can message me" and blocks
create or replace function public.start_direct_conversation(other_user_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_conv uuid; v_rule text;
begin
  if other_user_id = auth.uid() then raise exception 'You cannot chat with yourself'; end if;
  if public.is_blocked_pair(auth.uid(), other_user_id) then raise exception 'Access restricted by security policy.'; end if;

  select cm1.conversation_id into v_conv
  from conversation_members cm1
  join conversation_members cm2 on cm1.conversation_id = cm2.conversation_id
  join conversations c on c.id = cm1.conversation_id
  where cm1.user_id = auth.uid() and cm2.user_id = other_user_id and coalesce(c.kind,'direct') = 'direct'
  limit 1;
  if v_conv is not null then return v_conv; end if;

  select who_can_message into v_rule from privacy_settings where user_id = other_user_id;
  if coalesce(v_rule,'everyone') = 'contacts' and not public.is_contact_of(other_user_id, auth.uid()) then
    raise exception 'This person only accepts messages from their contacts.';
  end if;

  insert into conversations (is_group, kind, created_by) values (false, 'direct', auth.uid()) returning id into v_conv;
  insert into conversation_members (conversation_id, user_id) values (v_conv, auth.uid()), (v_conv, other_user_id);
  return v_conv;
end $$;

-- Create a group chat or a community
drop function if exists public.create_conversation(text, text, text, boolean, uuid[]);
create or replace function public.create_conversation(p_kind text, p_title text, p_description text, p_public boolean, p_members uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; m uuid;
begin
  if p_kind not in ('group','community') then raise exception 'Invalid chat type'; end if;
  insert into conversations (is_group, kind, title, description, is_public, created_by)
  values (true, p_kind, p_title, p_description, coalesce(p_public, false), auth.uid()) returning id into v_id;
  insert into conversation_members (conversation_id, user_id, role) values (v_id, auth.uid(), 'admin');
  if p_members is not null then
    foreach m in array p_members loop
      if m <> auth.uid() and not public.is_blocked_pair(auth.uid(), m) then
        insert into conversation_members (conversation_id, user_id) values (v_id, m) on conflict do nothing;
      end if;
    end loop;
  end if;
  return v_id;
end $$;

create or replace function public.add_conversation_members(cid uuid, p_members uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare m uuid;
begin
  if not public.is_conv_admin(cid) then raise exception 'Only admins can add people'; end if;
  foreach m in array p_members loop
    if not public.is_blocked_pair(auth.uid(), m) then
      insert into conversation_members (conversation_id, user_id) values (cid, m) on conflict do nothing;
    end if;
  end loop;
end $$;

create or replace function public.join_community(cid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from conversations where id = cid and is_public = true and kind = 'community') then
    raise exception 'This community is private';
  end if;
  insert into conversation_members (conversation_id, user_id) values (cid, auth.uid()) on conflict do nothing;
  insert into notifications (user_id, actor_id, kind, title, link)
    select created_by, auth.uid(), 'community', 'joined your community', 'communities/' || cid::text
    from conversations where id = cid and created_by is not null and created_by <> auth.uid();
end $$;

create or replace function public.leave_conversation(cid uuid)
returns void language sql security definer set search_path = public as $$
  delete from conversation_members where conversation_id = cid and user_id = auth.uid();
$$;

-- Public communities (for Discover / Communities)
drop function if exists public.discover_communities(text);
create or replace function public.discover_communities(q text default '')
returns table (id uuid, title text, description text, avatar_url text, cover_url text, member_count bigint, joined boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.title, c.description, c.avatar_url, c.cover_url,
    (select count(*) from conversation_members x where x.conversation_id = c.id),
    exists (select 1 from conversation_members x where x.conversation_id = c.id and x.user_id = auth.uid())
  from conversations c
  where c.kind = 'community' and c.is_public = true
    and (q = '' or c.title ilike '%' || q || '%' or coalesce(c.description,'') ilike '%' || q || '%')
  order by 6 desc limit 50;
$$;

drop function if exists public.conversation_people(uuid);
create or replace function public.conversation_people(cid uuid)
returns table (user_id uuid, full_name text, username text, avatar_url text, verified boolean, role text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.username, p.avatar_url, p.verified, m.role
  from conversation_members m join profiles p on p.id = m.user_id
  where m.conversation_id = cid and (public.is_member(cid) or exists (select 1 from conversations c where c.id = cid and c.is_public))
  order by (m.role = 'admin') desc, p.full_name;
$$;

-- Read state; receipts only move when the user allows read receipts
create or replace function public.mark_read(cid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_rr boolean;
begin
  select coalesce(read_receipts, true) into v_rr from privacy_settings where user_id = auth.uid();
  update conversation_members
    set last_read_at = now(), receipt_at = case when coalesce(v_rr, true) then now() else receipt_at end
  where conversation_id = cid and user_id = auth.uid();
end $$;

drop function if exists public.search_messages(text);
create or replace function public.search_messages(q text)
returns table (conversation_id uuid, content text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.conversation_id, m.content, m.created_at
  from messages m
  where public.is_member(m.conversation_id) and m.deleted_at is null and m.content ilike '%' || q || '%'
  order by m.created_at desc limit 50;
$$;

-- Presence that respects privacy
drop function if exists public.get_presence(uuid[]);
create or replace function public.get_presence(ids uuid[])
returns table (user_id uuid, online boolean, last_seen timestamptz)
language sql stable security definer set search_path = public as $$
  select u.id,
    case when coalesce(ps.online,'everyone') = 'everyone' or (ps.online = 'contacts' and public.is_contact_of(u.id, auth.uid()))
         then coalesce(pr.online, false) and pr.last_seen > now() - interval '90 seconds' else false end,
    case when coalesce(ps.last_seen,'everyone') = 'everyone' or (ps.last_seen = 'contacts' and public.is_contact_of(u.id, auth.uid()))
         then pr.last_seen else null end
  from unnest(ids) as u(id)
  left join user_presence pr on pr.user_id = u.id
  left join privacy_settings ps on ps.user_id = u.id;
$$;

-- People search (honours "appear in Discover")
drop function if exists public.search_people(text);
create or replace function public.search_people(q text)
returns table (id uuid, full_name text, username text, avatar_url text, about text, verified boolean, followers bigint, i_follow boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.username, p.avatar_url, p.about, p.verified,
    (select count(*) from follows f where f.followee_id = p.id),
    exists (select 1 from follows f where f.followee_id = p.id and f.follower_id = auth.uid())
  from profiles p
  left join privacy_settings ps on ps.user_id = p.id
  where p.id <> auth.uid() and coalesce(ps.discoverable, true)
    and not public.is_blocked_pair(auth.uid(), p.id)
    and (length(q) < 2 or p.username ilike '%' || q || '%' or p.full_name ilike '%' || q || '%')
  order by 7 desc, p.full_name limit 30;
$$;

-- Public profile with counters
drop function if exists public.get_profile(text, uuid);
create or replace function public.get_profile(uname text default null, uid uuid default null)
returns table (id uuid, full_name text, username text, avatar_url text, cover_url text, about text, bio text, verified boolean,
  website text, location text, followers bigint, following bigint, posts bigint, i_follow boolean, follows_me boolean, blocked boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.username, p.avatar_url, p.cover_url, p.about, p.bio, p.verified, p.website, p.location,
    (select count(*) from follows f where f.followee_id = p.id),
    (select count(*) from follows f where f.follower_id = p.id),
    (select count(*) from posts x where x.user_id = p.id),
    exists (select 1 from follows f where f.followee_id = p.id and f.follower_id = auth.uid()),
    exists (select 1 from follows f where f.follower_id = p.id and f.followee_id = auth.uid()),
    exists (select 1 from blocks b where b.blocker_id = auth.uid() and b.blocked_id = p.id)
  from profiles p
  where (uid is not null and p.id = uid) or (uid is null and lower(p.username) = lower(coalesce(uname,'')))
  limit 1;
$$;

create or replace function public.username_available(uname text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from profiles where lower(username) = lower(uname) and id <> auth.uid());
$$;

-- Statuses (24 h) + highlights, honouring each author's audience setting
drop function if exists public.get_statuses();
create or replace function public.get_statuses()
returns table (id uuid, user_id uuid, status_type text, content text, media_path text, media_mime text, caption text,
  created_at timestamptz, full_name text, username text, avatar_url text, viewed boolean, highlight boolean, bg text, view_count bigint)
language sql stable security definer set search_path = public as $$
  select s.id, s.user_id, s.status_type, s.content, s.media_path, s.media_mime, s.caption, s.created_at,
    p.full_name, p.username, p.avatar_url,
    exists (select 1 from status_views v where v.status_id = s.id and v.viewer_id = auth.uid()),
    coalesce(s.highlight,false), s.bg,
    (select count(*) from status_views v where v.status_id = s.id)
  from statuses s join profiles p on p.id = s.user_id
  left join status_privacy sp on sp.user_id = s.user_id
  where s.created_at > now() - interval '24 hours'
    and not public.is_blocked_pair(auth.uid(), s.user_id)
    and (s.user_id = auth.uid()
      or coalesce(sp.audience,'shared') = 'shared' and (public.is_contact_of(auth.uid(), s.user_id) or public.is_contact_of(s.user_id, auth.uid())
            or exists (select 1 from follows f where f.follower_id = auth.uid() and f.followee_id = s.user_id)
            or exists (select 1 from conversation_members a join conversation_members b on a.conversation_id = b.conversation_id
                       where a.user_id = auth.uid() and b.user_id = s.user_id))
      or coalesce(sp.audience,'shared') = 'contacts' and public.is_contact_of(s.user_id, auth.uid()))
  order by s.created_at asc;
$$;

create or replace function public.profile_highlights(uid uuid)
returns table (id uuid, status_type text, content text, media_path text, caption text, bg text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.id, s.status_type, s.content, s.media_path, s.caption, s.bg, s.created_at
  from statuses s where s.user_id = uid and s.highlight = true order by s.created_at desc;
$$;

-- Contacts (8a versions kept; add_contact upgraded to match e-mail too)
drop function if exists public.add_contact(text, text);
create or replace function public.add_contact(p_name text, p_phone text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_target uuid;
begin
  if p_phone ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_target := p_phone::uuid;
  else
    select user_id into v_target from user_private where phone = p_phone limit 1;
    if v_target is null then select id into v_target from profiles where lower(username) = lower(ltrim(p_phone,'@')) limit 1; end if;
    if v_target is null then select id into v_target from auth.users where lower(email) = lower(p_phone) limit 1; end if;
  end if;
  if v_target is null then raise exception 'User not found'; end if;
  insert into contacts (user_id, contact_id, saved_name, saved_phone)
  values (auth.uid(), v_target, p_name, p_phone)
  on conflict (user_id, contact_id) do update set saved_name = excluded.saved_name;
  return v_target;
end $$;

-- Calls
drop function if exists public.get_call_logs();
create or replace function public.get_call_logs()
returns table (id uuid, direction text, is_video boolean, status text, started_at timestamptz, duration_s integer,
  other_id uuid, full_name text, username text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select l.id, case when l.caller_id = auth.uid() then 'outgoing' else 'incoming' end,
    l.is_video, l.status, l.started_at, coalesce(l.duration_s,0),
    p.id, p.full_name, p.username, p.avatar_url
  from call_logs l
  join profiles p on p.id = case when l.caller_id = auth.uid() then l.callee_id else l.caller_id end
  where l.caller_id = auth.uid() or l.callee_id = auth.uid()
  order by l.started_at desc limit 100;
$$;

-- Events
drop function if exists public.list_events(boolean);
create or replace function public.list_events(only_mine boolean default false)
returns table (id uuid, title text, description text, location text, starts_at timestamptz, ends_at timestamptz, organizer_id uuid,
  organizer_name text, community_id uuid, going bigint, my_response text)
language sql stable security definer set search_path = public as $$
  select e.id, e.title, e.description, e.location, e.starts_at, e.ends_at, e.organizer_id, p.full_name, e.community_id,
    (select count(*) from event_rsvps r where r.event_id = e.id and r.response = 'going'),
    (select response from event_rsvps r where r.event_id = e.id and r.user_id = auth.uid())
  from events e join profiles p on p.id = e.organizer_id
  where e.starts_at > now() - interval '12 hours'
    and (e.is_public or e.organizer_id = auth.uid() or (e.community_id is not null and public.is_member(e.community_id)))
    and (not only_mine or e.organizer_id = auth.uid() or exists (select 1 from event_rsvps r where r.event_id = e.id and r.user_id = auth.uid() and r.response = 'going'))
  order by e.starts_at asc limit 100;
$$;

-- Account deletion (removes the auth user; everything cascades)
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from auth.users where id = auth.uid();
end $$;

-- -----------------------------------------------------------------------------
-- 6. Notification triggers
-- -----------------------------------------------------------------------------
create or replace function public.notify_follow() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, actor_id, kind, title, link)
  values (new.followee_id, new.follower_id, 'follow', 'started following you', 'profile/' || new.follower_id::text);
  return new;
end $$;
drop trigger if exists trg_notify_follow on public.follows;
create trigger trg_notify_follow after insert on public.follows for each row execute function public.notify_follow();

create or replace function public.notify_rsvp() returns trigger language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_title text;
begin
  select organizer_id, title into v_org, v_title from events where id = new.event_id;
  if v_org is not null and v_org <> new.user_id and new.response = 'going' then
    insert into notifications (user_id, actor_id, kind, title, body, link)
    values (v_org, new.user_id, 'event', 'is going to your event', v_title, 'events');
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_rsvp on public.event_rsvps;
create trigger trg_notify_rsvp after insert on public.event_rsvps for each row execute function public.notify_rsvp();

create or replace function public.notify_missed_call() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'missed' and (old.status is distinct from 'missed') then
    insert into notifications (user_id, actor_id, kind, title, body, link)
    values (new.callee_id, new.caller_id, 'call', 'Missed ' || case when new.is_video then 'video' else 'voice' end || ' call', null, 'calls');
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_missed on public.call_logs;
create trigger trg_notify_missed after update on public.call_logs for each row execute function public.notify_missed_call();

create or replace function public.notify_live() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, actor_id, kind, title, body, link)
  select f.follower_id, new.host_id, 'live', 'is live now', new.title, 'live/' || new.id::text
  from follows f where f.followee_id = new.host_id;
  return new;
end $$;
drop trigger if exists trg_notify_live on public.live_streams;
create trigger trg_notify_live after insert on public.live_streams for each row execute function public.notify_live();


-- -----------------------------------------------------------------------------
-- 7. Realtime publication (needed for live messages, calls log, notifications)
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['messages','message_reactions','conversation_members','notifications','call_logs','statuses','live_streams','follows','events','event_rsvps']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; when undefined_object then null;
    end;
  end loop;
end $$;
alter table public.messages replica identity full;
alter table public.conversation_members replica identity full;

-- -----------------------------------------------------------------------------
-- 8. Storage
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('avatars','avatars', true)      on conflict (id) do update set public = true;
insert into storage.buckets (id, name, public) values ('chat-media','chat-media', false) on conflict (id) do update set public = false;
insert into storage.buckets (id, name, public) values ('status-media','status-media', false) on conflict (id) do update set public = false;
insert into storage.buckets (id, name, public) values ('post-media','post-media', true)  on conflict (id) do update set public = true;
insert into storage.buckets (id, name, public) values ('vault','vault', false)           on conflict (id) do update set public = false;

drop policy if exists "Authenticated users can upload chat media" on storage.objects;
drop policy if exists "Chat media is accessible by authenticated users" on storage.objects;
drop policy if exists "dyson_chat_media_rw" on storage.objects;
drop policy if exists "dyson_status_media_rw" on storage.objects;
drop policy if exists "dyson_post_media" on storage.objects;
drop policy if exists "dyson_post_media_read" on storage.objects;
drop policy if exists "dyson_vault_rw" on storage.objects;
drop policy if exists "dyson_avatar_write" on storage.objects;

-- chat-media paths look like  <conversation_id>/<file>
create policy "dyson_chat_media_rw" on storage.objects for all to authenticated
  using (bucket_id = 'chat-media' and public.is_member(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'chat-media' and public.is_member(((storage.foldername(name))[1])::uuid));

-- status-media paths look like  <user_id>/<file>; any signed-in user may read (audience is enforced by get_statuses)
create policy "dyson_status_media_rw" on storage.objects for all to authenticated
  using (bucket_id = 'status-media')
  with check (bucket_id = 'status-media' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "dyson_post_media" on storage.objects for insert to authenticated
  with check (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "dyson_post_media_read" on storage.objects for select using (bucket_id = 'post-media');

create policy "dyson_avatar_write" on storage.objects for all to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- vault paths look like  <user_id>/<file>; only the owner (files are also encrypted in the browser)
create policy "dyson_vault_rw" on storage.objects for all to authenticated
  using (bucket_id = 'vault' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'vault' and (storage.foldername(name))[1] = auth.uid()::text);

-- =============================================================================
-- DONE.
-- =============================================================================
