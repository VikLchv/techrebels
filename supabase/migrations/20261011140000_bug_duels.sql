-- Bug Duels: challenge another member's bug to Bug Rush on the same seeded map.
-- Both play whenever they like within 48 hours. Each run stores its score and a compact
-- movement path, so the other player races against a ghost. Higher score wins;
-- if only one played when time runs out, they win by forfeit.

create table public.bug_duels (
  id                 uuid primary key default gen_random_uuid(),
  seed               integer not null default (floor(random() * 2147483647))::integer,
  challenger         uuid not null references public.profiles (id) on delete cascade,
  opponent           uuid not null references public.profiles (id) on delete cascade,
  created_at         timestamptz not null default now(),
  expires_at         timestamptz not null default now() + interval '48 hours',
  challenger_score   integer check (challenger_score between 0 and 10000000),
  challenger_path    integer[] check (challenger_path is null or cardinality(challenger_path) <= 6000),
  challenger_ms      integer,
  challenger_played  timestamptz,
  opponent_score     integer check (opponent_score between 0 and 10000000),
  opponent_path      integer[] check (opponent_path is null or cardinality(opponent_path) <= 6000),
  opponent_ms        integer,
  opponent_played    timestamptz,
  check (challenger <> opponent)
);
create index bug_duels_challenger_idx on public.bug_duels (challenger, created_at desc);
create index bug_duels_opponent_idx on public.bug_duels (opponent, created_at desc);
alter table public.bug_duels enable row level security;
revoke all on public.bug_duels from anon, authenticated;

-- challenge a bug by its number; returns the new duel id
create or replace function public.create_duel(p_bug_number integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target uuid;
  new_id uuid;
begin
  if caller is null then raise exception 'not signed in'; end if;
  if not public.is_member() then raise exception 'members only'; end if;
  select b.user_id into target
  from public.bugs b
  join public.profiles p on p.id = b.user_id
  where b.bug_number = p_bug_number and b.is_public and p.membership_status = 'approved';
  if target is null then raise exception 'no such bug in the swarm'; end if;
  if target = caller then raise exception 'you cannot duel yourself'; end if;
  if exists (
    select 1 from public.bug_duels d
    where now() < d.expires_at
      and (d.challenger_played is null or d.opponent_played is null)
      and ((d.challenger = caller and d.opponent = target) or (d.challenger = target and d.opponent = caller))
  ) then raise exception 'you already have an open duel with this bug'; end if;
  if (select count(*) from public.bug_duels d where d.challenger = caller and d.created_at > now() - interval '24 hours') >= 10 then
    raise exception 'ten challenges a day is plenty';
  end if;
  insert into public.bug_duels (challenger, opponent) values (caller, target) returning id into new_id;
  return new_id;
end;
$$;

-- every duel I am part of, newest first. The other side's score stays hidden until I have
-- played (or the duel is over); their path is visible so I can race their ghost.
create or replace function public.my_duels()
returns table (
  id uuid, seed integer, i_challenged boolean, created_at timestamptz, expires_at timestamptz,
  other_bug_number integer, other_bug_name text, other_bug_config jsonb,
  my_score integer, my_played boolean,
  other_score integer, other_played boolean, other_path integer[],
  status text, result text
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select d.*, (d.challenger = (select auth.uid())) as me_first
    from public.bug_duels d
    where (select auth.uid()) in (d.challenger, d.opponent)
  ), sides as (
    select m.id, m.seed, m.me_first, m.created_at, m.expires_at,
      case when m.me_first then m.opponent else m.challenger end as other_id,
      case when m.me_first then m.challenger_score else m.opponent_score end as my_s,
      case when m.me_first then m.challenger_played else m.opponent_played end as my_p,
      case when m.me_first then m.opponent_score else m.challenger_score end as other_s,
      case when m.me_first then m.opponent_played else m.challenger_played end as other_p,
      case when m.me_first then m.opponent_path else m.challenger_path end as other_path
    from mine m
  ), judged as (
    select s.*,
      case
        when s.my_p is not null and s.other_p is not null then 'done'
        when now() >= s.expires_at then 'expired'
        else 'open'
      end as st
    from sides s
  )
  select j.id, j.seed, j.me_first, j.created_at, j.expires_at,
    b.bug_number, b.name, b.config,
    j.my_s, j.my_p is not null,
    case when j.my_p is not null or j.st <> 'open' then j.other_s end,
    j.other_p is not null,
    j.other_path,
    j.st,
    case
      when j.st = 'open' then null
      when j.my_p is null and j.other_p is null then 'void'
      when j.my_p is null then 'lost'
      when j.other_p is null then 'won'
      when j.my_s > j.other_s then 'won'
      when j.my_s < j.other_s then 'lost'
      else 'draw'
    end
  from judged j
  left join public.bugs b on b.user_id = j.other_id
  order by (j.st = 'open') desc, j.created_at desc
  limit 60;
$$;

-- submit my one and only run for a duel
create or replace function public.submit_duel_run(p_duel uuid, p_score integer, p_duration_ms integer, p_path integer[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  d public.bug_duels%rowtype;
begin
  if caller is null then raise exception 'not signed in'; end if;
  select * into d from public.bug_duels where id = p_duel for update;
  if not found or caller not in (d.challenger, d.opponent) then raise exception 'not your duel'; end if;
  if now() >= d.expires_at then raise exception 'this duel has expired'; end if;
  if p_score < 0 or p_score > 10000000 or p_duration_ms < 1000 or p_duration_ms > 3600000 then raise exception 'that run does not look real'; end if;
  if p_path is not null and cardinality(p_path) > 6000 then raise exception 'path too long'; end if;
  if caller = d.challenger then
    if d.challenger_played is not null then raise exception 'you already played this duel'; end if;
    update public.bug_duels set challenger_score = p_score, challenger_ms = p_duration_ms, challenger_path = p_path, challenger_played = now() where id = p_duel;
  else
    if d.opponent_played is not null then raise exception 'you already played this duel'; end if;
    update public.bug_duels set opponent_score = p_score, opponent_ms = p_duration_ms, opponent_path = p_path, opponent_played = now() where id = p_duel;
  end if;
end;
$$;

revoke all on function public.create_duel(integer) from public, anon;
revoke all on function public.my_duels() from public, anon;
revoke all on function public.submit_duel_run(uuid, integer, integer, integer[]) from public, anon;
grant execute on function public.create_duel(integer) to authenticated;
grant execute on function public.my_duels() to authenticated;
grant execute on function public.submit_duel_run(uuid, integer, integer, integer[]) to authenticated;

-- duels count as community activity, so playing them repairs a decaying site
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
      (select max(created_at) from public.submissions),
      (select max(greatest(challenger_played, opponent_played, created_at)) from public.bug_duels)
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
