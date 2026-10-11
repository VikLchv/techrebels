-- Bug Rush v2: endless runs with three lives can last longer and score higher.

alter table public.arcade_scores drop constraint arcade_scores_score_check;
alter table public.arcade_scores drop constraint arcade_scores_duration_ms_check;
alter table public.arcade_scores
  add constraint arcade_scores_score_check check (score between 0 and 10000000),
  add constraint arcade_scores_duration_ms_check check (duration_ms between 1000 and 21600000);

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
  if p_score < 0 or p_score > 10000000 then raise exception 'invalid score'; end if;
  if p_duration_ms < 1000 or p_duration_ms > 21600000 then raise exception 'invalid run duration'; end if;
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

revoke all on function public.submit_arcade_score(text, integer, integer, uuid) from public, anon;
grant execute on function public.submit_arcade_score(text, integer, integer, uuid) to authenticated;

