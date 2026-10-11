-- Lunapark / Bug Rush scores. Only safe bug identities leave this schema.

create table public.arcade_scores (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  game          text not null default 'bug_rush' check (game in ('bug_rush')),
  score         integer not null check (score between 0 and 100000),
  duration_ms   integer not null check (duration_ms between 40000 and 70000),
  client_run_id uuid not null,
  played_at     timestamptz not null default now(),
  unique (user_id, client_run_id)
);

create index arcade_scores_game_time_idx on public.arcade_scores (game, played_at desc);
create index arcade_scores_user_best_idx on public.arcade_scores (user_id, game, score desc);

alter table public.arcade_scores enable row level security;
revoke all on public.arcade_scores from anon, authenticated;

create or replace function public.submit_arcade_score(
  p_game text,
  p_score integer,
  p_duration_ms integer,
  p_client_run_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid());
begin
  if caller is null then raise exception 'not signed in'; end if;
  if p_game <> 'bug_rush' then raise exception 'unknown game'; end if;
  if p_score < 0 or p_score > 100000 then raise exception 'invalid score'; end if;
  if p_duration_ms < 40000 or p_duration_ms > 70000 then raise exception 'invalid run duration'; end if;
  if not exists (select 1 from public.profiles where id = caller) then raise exception 'profile required'; end if;
  if not exists (select 1 from public.bugs where user_id = caller) then raise exception 'bug required'; end if;
  if (select count(*) from public.arcade_scores where user_id = caller and played_at > now() - interval '1 minute') >= 5 then
    raise exception 'too many score submissions';
  end if;

  insert into public.arcade_scores (user_id, game, score, duration_ms, client_run_id)
  values (caller, p_game, p_score, p_duration_ms, p_client_run_id)
  on conflict (user_id, client_run_id) do nothing;
end;
$$;

create or replace function public.get_arcade_leaderboard(
  p_game text default 'bug_rush',
  p_period text default 'week',
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  cutoff timestamptz;
  result jsonb;
begin
  if caller is null then raise exception 'not signed in'; end if;
  if p_game <> 'bug_rush' then raise exception 'unknown game'; end if;
  if p_period = 'today' then cutoff := date_trunc('day', now() at time zone 'Europe/Prague') at time zone 'Europe/Prague';
  elsif p_period = 'week' then cutoff := date_trunc('week', now() at time zone 'Europe/Prague') at time zone 'Europe/Prague';
  elsif p_period = 'all' then cutoff := '-infinity'::timestamptz;
  else raise exception 'invalid period';
  end if;

  with best as (
    select distinct on (s.user_id) s.user_id, s.score, s.played_at
    from public.arcade_scores s
    where s.game = p_game and s.played_at >= cutoff
    order by s.user_id, s.score desc, s.played_at asc
  ), ranked as (
    select b.*, row_number() over (order by b.score desc, b.played_at asc) as rank
    from best b
  ), leaders as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'rank', r.rank,
      'score', r.score,
      'played_at', r.played_at,
      'is_me', r.user_id = caller,
      'bug_number', bug.bug_number,
      'bug_name', bug.name,
      'bug_config', bug.config
    ) order by r.rank), '[]'::jsonb) as value
    from ranked r
    join public.bugs bug on bug.user_id = r.user_id
    where r.rank <= greatest(1, least(coalesce(p_limit, 20), 50))
  ), mine as (
    select jsonb_build_object('rank', r.rank, 'score', r.score) as value
    from ranked r where r.user_id = caller
  )
  select jsonb_build_object(
    'leaders', (select value from leaders),
    'me', coalesce((select value from mine), 'null'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.submit_arcade_score(text, integer, integer, uuid) from public, anon;
revoke all on function public.get_arcade_leaderboard(text, text, integer) from public, anon;
grant execute on function public.submit_arcade_score(text, integer, integer, uuid) to authenticated;
grant execute on function public.get_arcade_leaderboard(text, text, integer) to authenticated;
