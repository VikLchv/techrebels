-- techRebels: initial schema
-- Members, their bugs (one per member), topic voting, guest suggestions, merch interest.
--
-- Security model
-- * RLS is enabled on every table. A table without a policy is closed.
-- * New tables are NOT auto-exposed to the Data API, so every grant below is explicit.
-- * Column-level grants decide which columns a member may write. Server-owned columns
--   (ids, bug_number, timestamps, consent_at, email) are never writable from the client.
-- * anon gets no table access at all. The public Swarm is served by get_swarm() and
--   swarm_count(), which return only safe columns, and by a Realtime broadcast.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  email               text,
  display_name        text check (display_name is null or char_length(display_name) <= 40),
  role                text,
  marketing_consent   boolean not null default false,
  consent_at          timestamptz,
  privacy_accepted_at timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.bugs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  bug_number integer not null unique generated always as identity (start with 100),
  name       text not null check (char_length(btrim(name)) between 1 and 22),
  role       text not null check (role in (
               'dev', 'ai', 'data', 'design', 'product', 'marketing',
               'sales', 'people', 'founder', 'security', 'ops', 'curious')),
  species    smallint not null check (species between 0 and 35),
  config     jsonb not null check (jsonb_typeof(config) = 'object' and pg_column_size(config) <= 4000),
  is_public  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.topics (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(btrim(title)) between 3 and 80),
  description text check (description is null or char_length(description) <= 300),
  status      text not null default 'open' check (status in ('open', 'planned', 'done')),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.topic_votes (
  topic_id   uuid not null references public.topics (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (topic_id, user_id)
);

create table public.guest_suggestions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  guest_name text not null check (char_length(btrim(guest_name)) between 2 and 80),
  why        text check (why is null or char_length(why) <= 300),
  link       text check (link is null or (char_length(link) <= 300 and link ~* '^https?://')),
  created_at timestamptz not null default now()
);

create table public.merch_interest (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item       text not null check (item in ('tee', 'hoodie', 'cap', 'tote')),
  size       text check (size is null or size in ('XS', 'S', 'M', 'L', 'XL', 'XXL')),
  created_at timestamptz not null default now(),
  unique (user_id, item)
);

create index bugs_public_created_idx on public.bugs (created_at desc) where is_public;
create index topic_votes_user_idx on public.topic_votes (user_id);
create index guest_suggestions_user_idx on public.guest_suggestions (user_id);
create index merch_interest_user_idx on public.merch_interest (user_id);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger bugs_updated_at before update on public.bugs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- is_admin(): used inside policies
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()));
$$;

-- ---------------------------------------------------------------------------
-- Profiles: created automatically when someone signs up
-- The app passes consent in signInWithOtp({ options: { data: { privacy_accepted: true, marketing_consent: true|false } } })
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  wants_news boolean := coalesce(new.raw_user_meta_data ->> 'marketing_consent', '') = 'true';
  accepted   boolean := coalesce(new.raw_user_meta_data ->> 'privacy_accepted', '') = 'true';
begin
  insert into public.profiles (id, email, marketing_consent, consent_at, privacy_accepted_at)
  values (
    new.id,
    new.email,
    wants_news,
    case when wants_news then now() end,
    case when accepted then now() end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- consent_at always records when marketing consent last changed
create or replace function public.track_consent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.marketing_consent is distinct from old.marketing_consent then
    new.consent_at = now();
  end if;
  return new;
end;
$$;

create trigger profiles_track_consent before update on public.profiles
  for each row execute function public.track_consent();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.admins            enable row level security;
alter table public.profiles          enable row level security;
alter table public.bugs              enable row level security;
alter table public.topics            enable row level security;
alter table public.topic_votes       enable row level security;
alter table public.guest_suggestions enable row level security;
alter table public.merch_interest    enable row level security;

-- admins: no policies on purpose. Managed only from the SQL editor.

-- profiles
create policy "profiles: read own, admins read all" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- bugs (the public reads them through get_swarm, never directly)
create policy "bugs: read own, admins read all" on public.bugs
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "bugs: insert own" on public.bugs
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "bugs: update own" on public.bugs
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "bugs: delete own" on public.bugs
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- topics
create policy "topics: members read" on public.topics
  for select to authenticated
  using (true);
create policy "topics: members suggest" on public.topics
  for insert to authenticated
  with check (created_by = (select auth.uid()) and status = 'open');
create policy "topics: admins update" on public.topics
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "topics: admins delete" on public.topics
  for delete to authenticated
  using ((select public.is_admin()));

-- topic_votes (members see only their own votes; totals come from topic_scores())
create policy "votes: read own" on public.topic_votes
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy "votes: cast own" on public.topic_votes
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "votes: remove own" on public.topic_votes
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- guest_suggestions
create policy "guests: read own, admins read all" on public.guest_suggestions
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "guests: suggest" on public.guest_suggestions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- merch_interest
create policy "merch: read own, admins read all" on public.merch_interest
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "merch: add own" on public.merch_interest
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "merch: change own" on public.merch_interest
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "merch: remove own" on public.merch_interest
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Grants (explicit, column level where members write)
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name, role, marketing_consent) on public.profiles to authenticated;

grant select on public.bugs to authenticated;
grant insert (name, role, species, config, is_public) on public.bugs to authenticated;
grant update (name, role, species, config, is_public) on public.bugs to authenticated;
grant delete on public.bugs to authenticated;

grant select on public.topics to authenticated;
grant insert (title, description) on public.topics to authenticated;
grant update (title, description, status) on public.topics to authenticated;
grant delete on public.topics to authenticated;

grant select on public.topic_votes to authenticated;
grant insert (topic_id) on public.topic_votes to authenticated;
grant delete on public.topic_votes to authenticated;

grant select on public.guest_suggestions to authenticated;
grant insert (guest_name, why, link) on public.guest_suggestions to authenticated;

grant select on public.merch_interest to authenticated;
grant insert (item, size) on public.merch_interest to authenticated;
grant update (size) on public.merch_interest to authenticated;
grant delete on public.merch_interest to authenticated;

-- ---------------------------------------------------------------------------
-- Public read functions
-- ---------------------------------------------------------------------------

-- The Swarm: public bugs, safe columns only. since = only bugs created after this time (event screen).
create or replace function public.get_swarm(since timestamptz default null, max_rows integer default 500)
returns table (bug_number integer, name text, role text, species smallint, config jsonb, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select b.bug_number, b.name, b.role, b.species, b.config, b.created_at
  from public.bugs b
  where b.is_public
    and (since is null or b.created_at >= since)
  order by b.created_at desc
  limit least(greatest(coalesce(max_rows, 500), 1), 1000);
$$;

create or replace function public.swarm_count(since timestamptz default null)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) from public.bugs b
  where b.is_public and (since is null or b.created_at >= since);
$$;

-- Vote totals for members, plus whether the caller voted
create or replace function public.topic_scores()
returns table (topic_id uuid, votes bigint, voted boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id,
         count(v.user_id),
         coalesce(bool_or(v.user_id = (select auth.uid())), false)
  from public.topics t
  left join public.topic_votes v on v.topic_id = t.id
  where (select auth.uid()) is not null
  group by t.id;
$$;

-- Members can delete their account and everything tied to it
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = (select auth.uid());
end;
$$;

-- Admin overview numbers
create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admins only';
  end if;
  return jsonb_build_object(
    'members',        (select count(*) from public.profiles),
    'bugs',           (select count(*) from public.bugs),
    'marketing_opt_in', (select count(*) from public.profiles where marketing_consent),
    'bugs_by_role',   (select coalesce(jsonb_object_agg(role, n), '{}'::jsonb)
                         from (select role, count(*) n from public.bugs group by role) r),
    'merch',          (select coalesce(jsonb_agg(m), '[]'::jsonb)
                         from (select item, size, count(*) n from public.merch_interest
                               group by item, size order by item, size) m)
  );
end;
$$;

-- Functions are executable by PUBLIC by default in Postgres: lock them down first.
revoke all on function public.set_updated_at()           from public, anon, authenticated;
revoke all on function public.handle_new_user()          from public, anon, authenticated;
revoke all on function public.track_consent()            from public, anon, authenticated;
revoke all on function public.is_admin()                 from public, anon;
revoke all on function public.get_swarm(timestamptz, integer) from public;
revoke all on function public.swarm_count(timestamptz)   from public;
revoke all on function public.topic_scores()             from public, anon;
revoke all on function public.delete_my_account()        from public, anon;
revoke all on function public.admin_stats()              from public, anon;

grant execute on function public.is_admin()                     to authenticated;
grant execute on function public.get_swarm(timestamptz, integer) to anon, authenticated;
grant execute on function public.swarm_count(timestamptz)       to anon, authenticated;
grant execute on function public.topic_scores()                 to authenticated;
grant execute on function public.delete_my_account()            to authenticated;
grant execute on function public.admin_stats()                  to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: every new public bug is broadcast on the public "swarm" channel
-- (event "new_bug", safe columns only). Listening needs no table access.
-- ---------------------------------------------------------------------------

create or replace function public.broadcast_new_bug()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.is_public then
    return new;
  end if;
  -- a failed broadcast must never block saving the bug
  begin
    perform realtime.send(
      jsonb_build_object(
        'bug_number', new.bug_number,
        'name',       new.name,
        'role',       new.role,
        'species',    new.species,
        'config',     new.config,
        'created_at', new.created_at
      ),
      'new_bug',
      'swarm',
      false
    );
  exception when others then
    raise warning 'swarm broadcast failed: %', sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.broadcast_new_bug() from public, anon, authenticated;

create trigger bugs_broadcast_new
  after insert on public.bugs
  for each row execute function public.broadcast_new_bug();
