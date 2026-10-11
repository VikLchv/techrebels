-- Phase 4: bug buddies and squads.
--
-- Flow:
-- 1. Members opt in through profiles.matching_consent.
-- 2. An admin generates a private draft with generate_matching_draft().
-- 3. The crew reviews groups, adds optional Slack links and sets approved = true.
-- 4. publish_matching_round() publishes the round atomically.
-- 5. Members only read their own published groups through my_matches().

create table public.matching_rounds (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(btrim(name)) between 3 and 80),
  status       text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by   uuid default auth.uid() references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  published_at timestamptz
);

create table public.matching_groups (
  id         uuid primary key default gen_random_uuid(),
  round_id   uuid not null references public.matching_rounds (id) on delete cascade,
  kind       text not null check (kind in ('buddy', 'squad')),
  label      text not null check (char_length(btrim(label)) between 1 and 80),
  reason     text check (reason is null or char_length(reason) <= 300),
  slack_url  text check (slack_url is null or (char_length(slack_url) <= 500 and slack_url ~* '^https://')),
  approved   boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.matching_members (
  group_id  uuid not null references public.matching_groups (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  round_id  uuid not null references public.matching_rounds (id) on delete cascade,
  kind      text not null check (kind in ('buddy', 'squad')),
  score     integer not null default 0 check (score >= 0),
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- Keep the round and kind in sync with the selected group. This makes it
-- possible to enforce one buddy group and one squad per member per round.
create or replace function public.set_matching_member_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select g.round_id, g.kind into new.round_id, new.kind
  from public.matching_groups g where g.id = new.group_id;
  if new.round_id is null then raise exception 'matching group not found'; end if;
  return new;
end;
$$;

create trigger matching_members_set_scope
  before insert or update of group_id on public.matching_members
  for each row execute function public.set_matching_member_scope();

create unique index matching_one_kind_per_round_idx
  on public.matching_groups (round_id, kind, label);
create index matching_groups_round_idx on public.matching_groups (round_id, kind);
create index matching_members_user_idx on public.matching_members (user_id, group_id);
create unique index matching_member_once_per_kind_idx
  on public.matching_members (round_id, kind, user_id);

alter table public.matching_rounds  enable row level security;
alter table public.matching_groups  enable row level security;
alter table public.matching_members enable row level security;

-- The tables are an admin workspace. Members use my_matches(), which exposes only
-- their published groups and a deliberately small, consented member payload.
create policy "matching rounds: admins manage" on public.matching_rounds
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "matching groups: admins manage" on public.matching_groups
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "matching members: admins manage" on public.matching_members
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

grant select, insert, update, delete on public.matching_rounds to authenticated;
grant select, insert, update, delete on public.matching_groups to authenticated;
grant select, insert, update, delete on public.matching_members to authenticated;

-- Private score used by the draft generator. Shared topics matter most, followed
-- by ambitions and activities. Mentor/mentee complementarity gets a small boost.
create or replace function public.matching_pair_score(a uuid, b uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((select count(*) from (
      select unnest(pa.topics) intersect select unnest(pb.topics)
    ) x), 0)::integer * 5
    + coalesce((select count(*) from (
      select unnest(pa.ambitions) intersect select unnest(pb.ambitions)
    ) x), 0)::integer * 4
    + coalesce((select count(*) from (
      select unnest(pa.activities) intersect select unnest(pb.activities)
    ) x), 0)::integer * 3
    + case when
        ('Mentoring others' = any(pa.activities) and 'Being mentored' = any(pb.activities))
        or ('Being mentored' = any(pa.activities) and 'Mentoring others' = any(pb.activities))
      then 4 else 0 end
  from public.profiles pa
  cross join public.profiles pb
  where pa.id = a and pb.id = b;
$$;

create or replace function public.matching_pair_reason(a uuid, b uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with p as (
    select pa.topics at, pb.topics bt,
           pa.activities aa, pb.activities ba,
           pa.ambitions am, pb.ambitions bm
    from public.profiles pa cross join public.profiles pb
    where pa.id = a and pb.id = b
  ), shared as (
    select
      array(select x from (select unnest(at) x intersect select unnest(bt)) q order by x limit 2) topics,
      array(select x from (select unnest(aa) x intersect select unnest(ba)) q order by x limit 2) activities,
      array(select x from (select unnest(am) x intersect select unnest(bm)) q order by x limit 2) ambitions,
      (('Mentoring others' = any(aa) and 'Being mentored' = any(ba))
       or ('Being mentored' = any(aa) and 'Mentoring others' = any(ba))) mentor
    from p
  )
  select coalesce(nullif(concat_ws(' · ',
    case when cardinality(topics) > 0 then 'Shared topics: ' || array_to_string(topics, ', ') end,
    case when cardinality(ambitions) > 0 then 'Shared direction: ' || array_to_string(ambitions, ', ') end,
    case when cardinality(activities) > 0 then 'Both into: ' || array_to_string(activities, ', ') end,
    case when mentor then 'Mentor–mentee fit' end
  ), ''), 'A fresh perspective outside your usual orbit.')
  from shared;
$$;

-- Create one private draft containing buddy groups and squads. Re-running this
-- creates a new round; it never changes an already published round.
create or replace function public.generate_matching_draft(
  round_name text,
  target_squad_size integer default 5
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_round uuid;
  new_group uuid;
  best_group uuid;
  candidate_ids uuid[];
  remaining uuid[];
  squad_ids uuid[] := '{}';
  a uuid;
  b uuid;
  member_id uuid;
  candidate_count integer;
  squad_count integer;
  squad_capacity integer;
  i integer;
begin
  if session_user = 'authenticator' and not public.is_admin() then
    raise exception 'admins only';
  end if;
  if char_length(btrim(coalesce(round_name, ''))) not between 3 and 80 then
    raise exception 'round name must be 3 to 80 characters';
  end if;
  if target_squad_size not between 3 and 10 then
    raise exception 'target squad size must be between 3 and 10';
  end if;

  select array_agg(p.id order by p.created_at, p.id)
  into candidate_ids
  from public.profiles p
  where p.matching_consent and p.full_name is not null;

  candidate_count := coalesce(cardinality(candidate_ids), 0);
  if candidate_count < 2 then
    raise exception 'at least two opted-in members with names are required';
  end if;

  insert into public.matching_rounds (name) values (btrim(round_name)) returning id into new_round;

  -- Greedy buddy matching: always take the strongest remaining fit. If the
  -- round has an odd number, the final buddy group is a trio.
  remaining := candidate_ids;
  while coalesce(cardinality(remaining), 0) > 1 loop
    a := remaining[1];
    remaining := array_remove(remaining, a);

    insert into public.matching_groups (round_id, kind, label)
    values (new_round, 'buddy', 'Bug buddies ' || lpad((
      select (count(*) + 1)::text from public.matching_groups
      where round_id = new_round and kind = 'buddy'
    ), 2, '0')) returning id into new_group;

    if cardinality(remaining) = 2 then
      insert into public.matching_members (group_id, user_id, score)
      values (new_group, a, greatest(public.matching_pair_score(a, remaining[1]), public.matching_pair_score(a, remaining[2]))),
             (new_group, remaining[1], public.matching_pair_score(a, remaining[1])),
             (new_group, remaining[2], public.matching_pair_score(a, remaining[2]));
      remaining := '{}';
    else
      select x.id into b
      from unnest(remaining) as x(id)
      order by public.matching_pair_score(a, x.id) desc, md5(x.id::text || a::text)
      limit 1;
      insert into public.matching_members (group_id, user_id, score)
      values (new_group, a, public.matching_pair_score(a, b)),
             (new_group, b, public.matching_pair_score(a, b));
      remaining := array_remove(remaining, b);
    end if;
  end loop;

  -- Seed squads, then place each remaining member into the squad where their
  -- average pair score is highest while keeping group sizes balanced.
  squad_count := greatest(1, ceil(candidate_count::numeric / target_squad_size)::integer);
  squad_capacity := ceil(candidate_count::numeric / squad_count)::integer;

  for i in 1..squad_count loop
    insert into public.matching_groups (round_id, kind, label)
    values (new_round, 'squad', 'Squad ' || lpad(i::text, 2, '0')) returning id into new_group;
    squad_ids := array_append(squad_ids, new_group);
    insert into public.matching_members (group_id, user_id)
    values (new_group, candidate_ids[i]);
  end loop;

  if candidate_count > squad_count then
    foreach member_id in array candidate_ids[squad_count + 1:candidate_count] loop
      select g.id into best_group
      from public.matching_groups g
      join public.matching_members mm on mm.group_id = g.id
      where g.round_id = new_round and g.kind = 'squad'
      group by g.id
      having count(*) < squad_capacity
      order by avg(public.matching_pair_score(member_id, mm.user_id)) desc,
               count(*) asc,
               md5(g.id::text || member_id::text)
      limit 1;
      insert into public.matching_members (group_id, user_id)
      values (best_group, member_id);
    end loop;
  end if;

  -- Store each squad member's average compatibility score for admin review.
  update public.matching_members target
  set score = coalesce((
    select round(avg(public.matching_pair_score(target.user_id, other.user_id)))::integer
    from public.matching_members other
    where other.group_id = target.group_id and other.user_id <> target.user_id
  ), 0)
  where target.group_id = any(squad_ids);

  return new_round;
end;
$$;

create or replace function public.publish_matching_round(round_to_publish uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if session_user = 'authenticator' and not public.is_admin() then
    raise exception 'admins only';
  end if;
  if not exists (select 1 from public.matching_rounds where id = round_to_publish and status = 'draft') then
    raise exception 'draft round not found';
  end if;
  if exists (select 1 from public.matching_groups where round_id = round_to_publish and not approved) then
    raise exception 'every group must be approved before publishing';
  end if;
  if not exists (select 1 from public.matching_groups where round_id = round_to_publish) then
    raise exception 'cannot publish an empty round';
  end if;

  update public.matching_rounds set status = 'archived'
  where status = 'published' and id <> round_to_publish;
  update public.matching_rounds
  set status = 'published', published_at = now()
  where id = round_to_publish;
end;
$$;

-- Member-safe read API. It returns only the caller's latest published groups.
-- Other members expose their name and public bug only while their matching
-- consent remains enabled; private profile answers never leave this function.
create or replace function public.my_matches()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  active_round public.matching_rounds%rowtype;
  payload jsonb;
begin
  if caller is null then raise exception 'not signed in'; end if;
  if not coalesce((select matching_consent from public.profiles where id = caller), false) then
    return jsonb_build_object('status', 'opted_out', 'round', null, 'buddy', null, 'squad', null);
  end if;

  select r.* into active_round
  from public.matching_rounds r
  join public.matching_groups g on g.round_id = r.id
  join public.matching_members mm on mm.group_id = g.id and mm.user_id = caller
  where r.status = 'published' and g.approved
  order by r.published_at desc
  limit 1;

  if active_round.id is null then
    return jsonb_build_object('status', 'waiting', 'round', null, 'buddy', null, 'squad', null);
  end if;

  select jsonb_build_object(
    'status', 'matched',
    'round', jsonb_build_object('id', active_round.id, 'name', active_round.name, 'published_at', active_round.published_at),
    'buddy', (
      select jsonb_build_object(
        'label', g.label, 'reason', g.reason, 'slack_url', g.slack_url,
        'members', coalesce(jsonb_agg(jsonb_build_object(
          'is_me', p.id = caller,
          'name', p.full_name,
          'bug_number', b.bug_number,
          'bug_name', b.name,
          'bug_config', b.config,
          'why', case when p.id = caller then null else public.matching_pair_reason(caller, p.id) end
        ) order by p.id = caller desc, p.full_name), '[]'::jsonb)
      )
      from public.matching_groups g
      join public.matching_members mine on mine.group_id = g.id and mine.user_id = caller
      join public.matching_members mm on mm.group_id = g.id
      join public.profiles p on p.id = mm.user_id and p.matching_consent
      left join public.bugs b on b.user_id = p.id and b.is_public
      where g.round_id = active_round.id and g.kind = 'buddy' and g.approved
      group by g.id
      limit 1
    ),
    'squad', (
      select jsonb_build_object(
        'label', g.label, 'reason', g.reason, 'slack_url', g.slack_url,
        'members', coalesce(jsonb_agg(jsonb_build_object(
          'is_me', p.id = caller,
          'name', p.full_name,
          'bug_number', b.bug_number,
          'bug_name', b.name,
          'bug_config', b.config,
          'why', case when p.id = caller then null else public.matching_pair_reason(caller, p.id) end
        ) order by p.id = caller desc, p.full_name), '[]'::jsonb)
      )
      from public.matching_groups g
      join public.matching_members mine on mine.group_id = g.id and mine.user_id = caller
      join public.matching_members mm on mm.group_id = g.id
      join public.profiles p on p.id = mm.user_id and p.matching_consent
      left join public.bugs b on b.user_id = p.id and b.is_public
      where g.round_id = active_round.id and g.kind = 'squad' and g.approved
      group by g.id
      limit 1
    )
  ) into payload;
  return payload;
end;
$$;

-- Helper functions are deliberately not callable through the API.
revoke all on function public.matching_pair_score(uuid, uuid) from public, anon, authenticated;
revoke all on function public.matching_pair_reason(uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_matching_member_scope() from public, anon, authenticated;
revoke all on function public.generate_matching_draft(text, integer) from public, anon;
revoke all on function public.publish_matching_round(uuid) from public, anon;
revoke all on function public.my_matches() from public, anon;

grant execute on function public.generate_matching_draft(text, integer) to authenticated;
grant execute on function public.publish_matching_round(uuid) to authenticated;
grant execute on function public.my_matches() to authenticated;
