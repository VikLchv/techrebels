-- techRebels: cookieless website analytics.
-- The site logs anonymous events (page views, clicks, scroll depth, form steps).
-- No cookies, no IP, no email: a random per-tab session id only.
-- Anyone may INSERT (that is how the browser logs), nobody but admins may read.

create table public.analytics_events (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  session_id text not null check (char_length(session_id) between 8 and 40),
  event      text not null check (event ~ '^[a-z0-9_:.-]{1,60}$'),
  path       text not null check (char_length(path) <= 200),
  label      text check (label is null or char_length(label) <= 120),
  section    text check (section is null or char_length(section) <= 60),
  props      jsonb not null default '{}'::jsonb check (jsonb_typeof(props) = 'object' and pg_column_size(props) <= 1000),
  viewport   text check (viewport is null or viewport in ('mobile', 'tablet', 'desktop')),
  referrer   text check (referrer is null or char_length(referrer) <= 200)
);

create index analytics_events_created_idx on public.analytics_events (created_at desc);
create index analytics_events_event_idx on public.analytics_events (event, created_at desc);

alter table public.analytics_events enable row level security;

create policy "analytics: anyone can log" on public.analytics_events
  for insert to anon, authenticated
  with check (true);

create policy "analytics: admins read" on public.analytics_events
  for select to authenticated
  using ((select public.is_admin()));

grant insert (session_id, event, path, label, section, props, viewport, referrer)
  on public.analytics_events to anon, authenticated;
grant select on public.analytics_events to authenticated;

-- Identity columns draw from a sequence: let the inserting roles use it.
-- (Also covers bugs.bug_number from the init migration.)
do $$
begin
  execute format('grant usage on sequence %s to anon, authenticated', pg_get_serial_sequence('public.analytics_events', 'id'));
  execute format('grant usage on sequence %s to authenticated', pg_get_serial_sequence('public.bugs', 'bug_number'));
end;
$$;

-- What gets clicked most. Admins only. Usage: select * from analytics_top(30);
create or replace function public.analytics_top(days integer default 30)
returns table (event text, label text, section text, clicks bigint, sessions bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
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
