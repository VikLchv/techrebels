-- analytics_top(): also allow the Supabase SQL editor (no logged-in user there).
-- API calls come in through the "authenticator" login role; for those, admins only, as before.
create or replace function public.analytics_top(days integer default 30)
returns table (event text, label text, section text, clicks bigint, sessions bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if session_user = 'authenticator' and not public.is_admin() then
    raise exception 'admins only';
  end if;
  return query
    select e.event, e.label, e.section, count(*)::bigint, count(distinct e.session_id)::bigint
    from public.analytics_events e
    where e.created_at >= now() - make_interval(days => greatest(coalesce(days, 30), 1))
    group by e.event, e.label, e.section
    order by count(*) desc
    limit 200;
end;
$$;

revoke all on function public.analytics_top(integer) from public, anon;
grant execute on function public.analytics_top(integer) to authenticated;
