-- Rebel features, wave 2:
--   1. infections: every member gets 3 invite codes; a claimed code (or the intro exploit) puts an application first in the queue
--   2. community health: the site decays after 3 quiet days, any activity repairs it
--   3. tech sins: anonymous confession wall with "me too"
--   4. industry bug bounty: radar items of kind 'bounty'
--   5. anti-CFP: submissions of kind 'anti_cfp'
--   6. time capsule: sealed predictions, opened in autumn 2027
--   7. ragequit: dramatic self-delete that can leave an anonymous ghost bug and a message
-- Everything goes through security definer functions. Tables are closed to the browser.

-- 1. Infections ------------------------------------------------------------

alter table public.profiles
  add column infected_by     uuid references public.profiles (id) on delete set null,
  add column entry_route     text check (entry_route in ('invite', 'exploit')),
  add column entry_priority  boolean not null default false,
  add column infection_bonus integer not null default 0 check (infection_bonus between 0 and 50);

create table public.infections (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique check (code ~ '^[A-Z0-9]{8}$'),
  inviter    uuid not null references public.profiles (id) on delete cascade,
  claimed_by uuid unique references public.profiles (id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);
create index infections_inviter_idx on public.infections (inviter);
alter table public.infections enable row level security;
revoke all on public.infections from anon, authenticated;

-- a member creates one more code, up to 3 (+ admin bonus)
create or replace function public.create_infection()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  allowed integer;
  used integer;
  new_code text;
begin
  if caller is null then raise exception 'not signed in'; end if;
  if not public.is_member() then raise exception 'members only'; end if;
  select 3 + coalesce(p.infection_bonus, 0) into allowed from public.profiles p where p.id = caller;
  select count(*) into used from public.infections i where i.inviter = caller;
  if used >= allowed then raise exception 'no infections left'; end if;
  loop
    new_code := upper(left(replace(gen_random_uuid()::text, '-', ''), 8));
    exit when not exists (select 1 from public.infections i where i.code = new_code);
  end loop;
  insert into public.infections (code, inviter) values (new_code, caller);
  return new_code;
end;
$$;

-- my codes and what happened to them (invitee shown only by their public bug)
create or replace function public.my_infections()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'allowed', 3 + coalesce((select p.infection_bonus from public.profiles p where p.id = (select auth.uid())), 0),
    'codes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', i.code,
        'created_at', i.created_at,
        'claimed', i.claimed_by is not null,
        'claimed_at', i.claimed_at,
        'joined', coalesce(p.membership_status = 'approved', false),
        'bug_number', case when b.is_public then b.bug_number end,
        'bug_name', case when b.is_public then b.name end
      ) order by i.created_at)
      from public.infections i
      left join public.profiles p on p.id = i.claimed_by
      left join public.bugs b on b.user_id = i.claimed_by
      where i.inviter = (select auth.uid())
    ), '[]'::jsonb)
  );
$$;

-- an applicant claims a code: they get priority in the review queue
create or replace function public.claim_infection(p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  clean text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  inf public.infections%rowtype;
begin
  if caller is null then raise exception 'not signed in'; end if;
  if exists (select 1 from public.profiles p where p.id = caller and (p.membership_status = 'approved' or p.entry_route is not null)) then
    raise exception 'already inside or already infected';
  end if;
  select * into inf from public.infections i where i.code = clean for update;
  if not found or inf.claimed_by is not null then raise exception 'this code does not work'; end if;
  if inf.inviter = caller then raise exception 'you cannot infect yourself'; end if;
  update public.infections set claimed_by = caller, claimed_at = now() where id = inf.id;
  update public.profiles set infected_by = inf.inviter, entry_route = 'invite', entry_priority = true where id = caller;
end;
$$;

-- the intro exploit: a code hidden in the site source. It only buys priority, never membership.
create or replace function public.claim_exploit(p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null then raise exception 'not signed in'; end if;
  if upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')) <> 'R00TREBEL' then
    raise exception 'nice try';
  end if;
  update public.profiles
  set entry_route = 'exploit', entry_priority = true
  where id = caller and entry_route is null and membership_status <> 'approved';
end;
$$;

-- the public infection graph: who infected whom, by public bug numbers only
create or replace function public.infection_tree()
returns table (from_bug integer, to_bug integer, at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select bi.bug_number, bc.bug_number, i.claimed_at
  from public.infections i
  join public.bugs bi on bi.user_id = i.inviter and bi.is_public
  join public.bugs bc on bc.user_id = i.claimed_by and bc.is_public
  where i.claimed_by is not null
  order by i.claimed_at;
$$;

create or replace function public.grant_infections(p_member uuid, p_extra integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  update public.profiles set infection_bonus = greatest(0, least(50, p_extra)) where id = p_member;
end;
$$;

-- 2. Tech sins -------------------------------------------------------------

create table public.tech_sins (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  body       text not null check (char_length(body) between 8 and 280),
  hidden     boolean not null default false,
  created_at timestamptz not null default now()
);
create index tech_sins_created_idx on public.tech_sins (created_at desc) where not hidden;
create index tech_sins_user_idx on public.tech_sins (user_id, created_at desc);

create table public.sin_reactions (
  sin_id     uuid not null references public.tech_sins (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (sin_id, user_id)
);
create index sin_reactions_user_idx on public.sin_reactions (user_id);

alter table public.tech_sins enable row level security;
alter table public.sin_reactions enable row level security;
revoke all on public.tech_sins, public.sin_reactions from anon, authenticated;

create or replace function public.confess_sin(p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  clean text := btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
  new_id uuid;
begin
  if caller is null then raise exception 'sign in to confess'; end if;
  if char_length(clean) < 8 then raise exception 'confess a little more'; end if;
  if (select count(*) from public.tech_sins s where s.user_id = caller and s.created_at > now() - interval '24 hours') >= 3 then
    raise exception 'three sins a day is enough';
  end if;
  insert into public.tech_sins (user_id, body) values (caller, left(clean, 280)) returning id into new_id;
  return new_id;
end;
$$;

-- anonymous feed: never returns who wrote it
create or replace function public.sins_feed(p_limit integer default 80)
returns table (id uuid, body text, created_at timestamptz, same bigint, me_too boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.body, s.created_at, count(r.user_id)::bigint,
         coalesce(bool_or(r.user_id = (select auth.uid())), false)
  from public.tech_sins s
  left join public.sin_reactions r on r.sin_id = s.id
  where not s.hidden
  group by s.id
  order by s.created_at desc
  limit least(greatest(coalesce(p_limit, 80), 1), 200);
$$;

create or replace function public.toggle_me_too(p_sin uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null then raise exception 'sign in first'; end if;
  if not exists (select 1 from public.tech_sins s where s.id = p_sin and not s.hidden) then raise exception 'sin not found'; end if;
  delete from public.sin_reactions where sin_id = p_sin and user_id = caller;
  if found then return false; end if;
  insert into public.sin_reactions (sin_id, user_id) values (p_sin, caller);
  return true;
end;
$$;

create or replace function public.moderate_sin(p_sin uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  update public.tech_sins set hidden = p_hidden where id = p_sin;
end;
$$;

-- 3. Industry bug bounty (radar items of kind 'bounty') ---------------------

alter table public.topics drop constraint topics_kind_check;
alter table public.topics add constraint topics_kind_check check (kind in ('topic', 'person', 'bounty'));

-- the Radar keeps its topics and people; bounties get their own board
create or replace function public.radar_topics()
returns table (id uuid, kind text, pillar text, category text, title text, description text, votes bigint, voted boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.kind, t.pillar, t.category, t.title, t.description,
         count(v.user_id)::bigint,
         coalesce(bool_or(v.user_id = (select auth.uid())), false)
  from public.topics t
  left join public.topic_votes v on v.topic_id = t.id
  where t.approved and t.status <> 'done' and t.kind <> 'bounty'
  group by t.id
  order by count(v.user_id) desc, t.created_at;
$$;

create or replace function public.bounty_board()
returns table (id uuid, title text, description text, votes bigint, voted boolean, status text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.title, t.description,
         count(v.user_id)::bigint,
         coalesce(bool_or(v.user_id = (select auth.uid())), false),
         t.status, t.created_at
  from public.topics t
  left join public.topic_votes v on v.topic_id = t.id
  where t.approved and t.kind = 'bounty'
  group by t.id
  order by (t.status = 'done'), count(v.user_id) desc, t.created_at;
$$;

-- 4. Anti-CFP --------------------------------------------------------------

alter table public.submissions drop constraint submissions_kind_check;
alter table public.submissions add constraint submissions_kind_check
  check (kind in ('speaker', 'crew', 'partner', 'guest_tip', 'anti_cfp'));

-- 5. Time capsule ----------------------------------------------------------

create table public.capsule_predictions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  body       text not null check (char_length(body) between 10 and 280),
  created_at timestamptz not null default now()
);
create index capsule_predictions_user_idx on public.capsule_predictions (user_id);
alter table public.capsule_predictions enable row level security;
revoke all on public.capsule_predictions from anon, authenticated;

create or replace function public.capsule_opens_at()
returns timestamptz
language sql
immutable
set search_path = ''
as $$ select timestamptz '2027-10-01 17:00:00+02' $$;

create or replace function public.seal_prediction(p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  clean text := btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
begin
  if caller is null then raise exception 'sign in first'; end if;
  if not public.is_member() then raise exception 'members only'; end if;
  if now() >= public.capsule_opens_at() then raise exception 'the capsule is already open'; end if;
  if char_length(clean) < 10 then raise exception 'predict a little more'; end if;
  if (select count(*) from public.capsule_predictions c where c.user_id = caller) >= 5 then
    raise exception 'five predictions per rebel';
  end if;
  insert into public.capsule_predictions (user_id, body) values (caller, left(clean, 280));
end;
$$;

create or replace function public.my_predictions()
returns table (body text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.body, c.created_at from public.capsule_predictions c
  where c.user_id = (select auth.uid()) order by c.created_at;
$$;

create or replace function public.capsule_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'predictions', (select count(*) from public.capsule_predictions),
    'rebels', (select count(distinct user_id) from public.capsule_predictions),
    'opens_at', public.capsule_opens_at(),
    'open', now() >= public.capsule_opens_at()
  );
$$;

-- after the opening date, everyone sees every prediction, signed by public bug only
create or replace function public.capsule_open()
returns table (body text, created_at timestamptz, bug_number integer, bug_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if now() < public.capsule_opens_at() then raise exception 'sealed until autumn 2027'; end if;
  return query
    select c.body, c.created_at,
           case when b.is_public then b.bug_number end,
           case when b.is_public then b.name end
    from public.capsule_predictions c
    left join public.bugs b on b.user_id = c.user_id
    order by c.created_at;
end;
$$;

-- 6. Ragequit --------------------------------------------------------------

create table public.ragequit_ghosts (
  id         bigint generated always as identity primary key,
  bug_number integer,
  config     jsonb,
  message    text check (message is null or char_length(message) <= 140),
  left_at    timestamptz not null default now()
);
alter table public.ragequit_ghosts enable row level security;
revoke all on public.ragequit_ghosts from anon, authenticated;

-- deletes the caller's account. With p_keep_ghost the bug drawing (no name) and the message stay behind.
create or replace function public.ragequit(p_message text default null, p_keep_ghost boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  clean text := nullif(left(btrim(regexp_replace(coalesce(p_message, ''), '\s+', ' ', 'g')), 140), '');
begin
  if caller is null then raise exception 'not signed in'; end if;
  if public.is_admin() then raise exception 'admins cannot ragequit, another admin has to remove the role first'; end if;
  if p_keep_ghost then
    insert into public.ragequit_ghosts (bug_number, config, message)
    select b.bug_number, b.config, clean from public.bugs b where b.user_id = caller
    union all
    select null, null, clean where not exists (select 1 from public.bugs b where b.user_id = caller);
  end if;
  delete from auth.users where id = caller;
end;
$$;

create or replace function public.ghost_wall(p_limit integer default 40)
returns table (bug_number integer, config jsonb, message text, left_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select g.bug_number, g.config, g.message, g.left_at
  from public.ragequit_ghosts g
  order by g.left_at desc
  limit least(greatest(coalesce(p_limit, 40), 1), 100);
$$;

-- 7. Community health ------------------------------------------------------
-- quiet for 3 days: the site starts to decay; fully broken after ~2 weeks of silence

create or replace function public.community_health()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with last as (
    select greatest(
      (select max(created_at) from public.bugs),
      (select max(created_at) from public.topic_votes),
      (select max(played_at) from public.arcade_scores),
      (select max(created_at) from public.tech_sins),
      (select max(created_at) from public.sin_reactions),
      (select max(created_at) from public.capsule_predictions),
      (select max(created_at) from public.submissions)
    ) as at
  ), quiet as (
    select at, extract(epoch from (now() - coalesce(at, now() - interval '30 days'))) / 86400.0 as days from last
  )
  select jsonb_build_object(
    'last_activity', at,
    'days_quiet', round(days::numeric, 2),
    'decay', round(least(1, greatest(0, (days - 3) / 11.0))::numeric, 3)
  ) from quiet;
$$;

-- Grants -------------------------------------------------------------------

revoke all on function public.create_infection()                 from public, anon;
revoke all on function public.my_infections()                    from public, anon;
revoke all on function public.claim_infection(text)              from public, anon;
revoke all on function public.claim_exploit(text)                from public, anon;
revoke all on function public.infection_tree()                   from public;
revoke all on function public.grant_infections(uuid, integer)    from public, anon;
revoke all on function public.confess_sin(text)                  from public, anon;
revoke all on function public.sins_feed(integer)                 from public;
revoke all on function public.toggle_me_too(uuid)                from public, anon;
revoke all on function public.moderate_sin(uuid, boolean)        from public, anon;
revoke all on function public.bounty_board()                     from public;
revoke all on function public.seal_prediction(text)              from public, anon;
revoke all on function public.my_predictions()                   from public, anon;
revoke all on function public.capsule_stats()                    from public;
revoke all on function public.capsule_open()                     from public;
revoke all on function public.ragequit(text, boolean)            from public, anon;
revoke all on function public.ghost_wall(integer)                from public;
revoke all on function public.community_health()                 from public;

grant execute on function public.create_infection()              to authenticated;
grant execute on function public.my_infections()                 to authenticated;
grant execute on function public.claim_infection(text)           to authenticated;
grant execute on function public.claim_exploit(text)             to authenticated;
grant execute on function public.infection_tree()                to anon, authenticated;
grant execute on function public.grant_infections(uuid, integer) to authenticated;
grant execute on function public.confess_sin(text)               to authenticated;
grant execute on function public.sins_feed(integer)              to anon, authenticated;
grant execute on function public.toggle_me_too(uuid)             to authenticated;
grant execute on function public.moderate_sin(uuid, boolean)     to authenticated;
grant execute on function public.radar_topics()                  to anon, authenticated;
grant execute on function public.bounty_board()                  to anon, authenticated;
grant execute on function public.seal_prediction(text)           to authenticated;
grant execute on function public.my_predictions()                to authenticated;
grant execute on function public.capsule_stats()                 to anon, authenticated;
grant execute on function public.capsule_open()                  to anon, authenticated;
grant execute on function public.ragequit(text, boolean)         to authenticated;
grant execute on function public.ghost_wall(integer)             to anon, authenticated;
grant execute on function public.community_health()              to anon, authenticated;
