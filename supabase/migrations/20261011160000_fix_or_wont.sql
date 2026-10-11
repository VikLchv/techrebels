-- Fix or Won't Fix: a swipe game. Each ticket gets FIX or WON'T FIX within 3 seconds.
-- There is no right answer: points come from agreeing with the community (plus speed),
-- with a small bonus for bold, fast minority calls. Votes are stored once per member and
-- ticket, so the stats grow with the swarm. Members can submit tickets (crew approves).

create table public.fix_tickets (
  id         uuid primary key default gen_random_uuid(),
  body       text not null check (char_length(body) between 8 and 160),
  reporter   text not null default 'A rebel' check (char_length(reporter) between 2 and 60),
  author     uuid references auth.users (id) on delete set null,
  approved   boolean not null default false,
  created_at timestamptz not null default now()
);
create index fix_tickets_approved_idx on public.fix_tickets (approved);

create table public.fix_votes (
  ticket_id  uuid not null references public.fix_tickets (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  fix        boolean not null,
  ms         integer not null check (ms between 0 and 10000),
  created_at timestamptz not null default now(),
  primary key (ticket_id, user_id)
);
create index fix_votes_user_idx on public.fix_votes (user_id);

create table public.fix_runs (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  score      integer not null check (score between 0 and 100000),
  profile    text check (char_length(profile) <= 40),
  played_at  timestamptz not null default now()
);
create index fix_runs_time_idx on public.fix_runs (played_at desc);

alter table public.fix_tickets enable row level security;
alter table public.fix_votes enable row level security;
alter table public.fix_runs enable row level security;
revoke all on public.fix_tickets, public.fix_votes, public.fix_runs from anon, authenticated;

-- a random round of approved tickets with the swarm's current opinion
create or replace function public.fix_round(p_limit integer default 12)
returns table (id uuid, body text, reporter text, fixes bigint, votes bigint)
language sql
volatile
security definer
set search_path = ''
as $$
  select t.id, t.body, t.reporter,
         count(v.user_id) filter (where v.fix)::bigint,
         count(v.user_id)::bigint
  from public.fix_tickets t
  left join public.fix_votes v on v.ticket_id = t.id
  where t.approved
  group by t.id
  order by random()
  limit least(greatest(coalesce(p_limit, 12), 1), 30);
$$;

-- the first answer per member and ticket is the one that counts for the stats
create or replace function public.fix_vote(p_ticket uuid, p_fix boolean, p_ms integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid());
begin
  if caller is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.fix_tickets t where t.id = p_ticket and t.approved) then raise exception 'ticket not found'; end if;
  insert into public.fix_votes (ticket_id, user_id, fix, ms)
  values (p_ticket, caller, p_fix, greatest(0, least(coalesce(p_ms, 0), 10000)))
  on conflict (ticket_id, user_id) do nothing;
end;
$$;

create or replace function public.submit_fix_run(p_score integer, p_profile text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid());
begin
  if caller is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.bugs b where b.user_id = caller) then raise exception 'bug required'; end if;
  if p_score < 0 or p_score > 100000 then raise exception 'invalid score'; end if;
  if (select count(*) from public.fix_runs r where r.user_id = caller and r.played_at > now() - interval '1 minute') >= 4 then
    raise exception 'slow down';
  end if;
  insert into public.fix_runs (user_id, score, profile) values (caller, p_score, left(p_profile, 40));
end;
$$;

-- best run per bug this week, bug identities only
create or replace function public.fix_leaderboard(p_limit integer default 10)
returns table (rank bigint, score integer, profile text, bug_number integer, bug_name text, bug_config jsonb, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with best as (
    select distinct on (r.user_id) r.user_id, r.score, r.profile, r.played_at
    from public.fix_runs r
    where r.played_at >= date_trunc('week', now() at time zone 'Europe/Prague') at time zone 'Europe/Prague'
    order by r.user_id, r.score desc, r.played_at
  )
  select row_number() over (order by b.score desc, b.played_at), b.score, b.profile,
         bug.bug_number, bug.name, bug.config, b.user_id = (select auth.uid())
  from best b
  join public.bugs bug on bug.user_id = b.user_id and bug.is_public
  order by b.score desc, b.played_at
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

create or replace function public.submit_fix_ticket(p_body text, p_reporter text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  clean text := btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
  who text := coalesce(nullif(btrim(regexp_replace(coalesce(p_reporter, ''), '\s+', ' ', 'g')), ''), 'A rebel');
begin
  if caller is null then raise exception 'not signed in'; end if;
  if not public.is_member() then raise exception 'members only'; end if;
  if char_length(clean) < 8 then raise exception 'a ticket needs a bit more drama'; end if;
  if (select count(*) from public.fix_tickets t where t.author = caller and t.created_at > now() - interval '24 hours') >= 5 then
    raise exception 'five tickets a day';
  end if;
  insert into public.fix_tickets (body, reporter, author) values (left(clean, 160), left(who, 60), caller);
end;
$$;

create or replace function public.moderate_fix_ticket(p_ticket uuid, p_approved boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  update public.fix_tickets set approved = p_approved where id = p_ticket;
end;
$$;

revoke all on function public.fix_round(integer) from public, anon;
revoke all on function public.fix_vote(uuid, boolean, integer) from public, anon;
revoke all on function public.submit_fix_run(integer, text) from public, anon;
revoke all on function public.fix_leaderboard(integer) from public, anon;
revoke all on function public.submit_fix_ticket(text, text) from public, anon;
revoke all on function public.moderate_fix_ticket(uuid, boolean) from public, anon;
grant execute on function public.fix_round(integer) to authenticated;
grant execute on function public.fix_vote(uuid, boolean, integer) to authenticated;
grant execute on function public.submit_fix_run(integer, text) to authenticated;
grant execute on function public.fix_leaderboard(integer) to authenticated;
grant execute on function public.submit_fix_ticket(text, text) to authenticated;
grant execute on function public.moderate_fix_ticket(uuid, boolean) to authenticated;

-- playing counts as community activity too
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
      (select max(greatest(challenger_played, opponent_played, created_at)) from public.bug_duels),
      (select max(played_at) from public.fix_runs)
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

-- the starter deck: something for every generation in the office
insert into public.fix_tickets (body, reporter, approved) values
  ('The printer says PC LOAD LETTER. Nobody alive knows what that means.', 'Linda, Accounting (since 1987)', true),
  ('Grandma replied-all "Who is this?" to the 400-person company newsletter.', 'IT helpdesk, quietly crying', true),
  ('The CEO wants the login page to be "more blockchain".', 'The CEO, after one podcast', true),
  ('Prod is down. It is Friday, 16:58. Your laptop is already in your bag.', 'Monitoring, screaming', true),
  ('The intern says the dashboard "gives off beige vibes".', 'Gen Z intern, no cap', true),
  ('Dad wants the WiFi password changed back to password123 because he could remember it.', 'Your dad', true),
  ('The fax machine is the only system that never went down. Management wants to retire it.', 'Facilities, nostalgic', true),
  ('A user typed their password into the search bar. It is now trending.', 'Analytics', true),
  ('The test is red. Only on Tuesdays. Only when Petr is on holiday.', 'CI pipeline', true),
  ('Mum sent a photo of a screenshot of the error. Taken on a tablet. Upside down.', 'Your mum', true),
  ('Clippy is back and he has opinions about your code.', 'Microsoft, probably', true),
  ('The client wants the logo bigger. And smaller. In the same meeting.', 'Account manager', true),
  ('Someone named a variable final_final_v2_REAL. It is in production.', 'Code review', true),
  ('The support chatbot told a customer to touch grass. Satisfaction went up.', 'Customer support', true),
  ('The 45-minute stand-up still has not stood up.', 'Scrum master, seated', true),
  ('An Excel macro from 2003 runs the whole company. Its author retired to Spain.', 'Finance', true),
  ('TikTok says our app is "giving millennial". It is a banking app.', 'Marketing', true),
  ('The office plant has better uptime than our API.', 'Status page', true),
  ('The manager printed the email, signed it, scanned it and emailed it back.', 'Process improvement', true),
  ('Users want a dark mode. For the dark mode.', 'Product feedback', true),
  ('Someone left caps lock on in 2009. It is now part of the brand.', 'Brand team', true),
  ('This meeting could have been an email. The email could have been a meme.', 'Everyone', true),
  ('Grandpa asked the AI to fix the TV. It is now a smart fridge.', 'Grandpa, on speakerphone', true),
  ('The README says: TODO write README.', 'New hire, day one', true),
  ('A 12-year-old found a security hole while playing Roblox. Wants Robux as a bounty.', 'Bug bounty inbox', true),
  ('Legacy comment: // do not touch this. seriously. Jan, 2011', 'Code archaeology team', true),
  ('The app works perfectly. On Internet Explorer 6.', 'QA, from a museum', true),
  ('The VPN only connects if you hold the laptop near the window.', 'Remote worker', true),
  ('Sales promised a feature that does not exist. The demo is tomorrow.', 'Sales, smiling', true),
  ('The coffee machine is broken. Dev productivity dropped 400 %.', 'Kitchen telemetry', true),
  ('Someone deployed to prod with the commit message "oops".', 'Git log', true),
  ('The unsubscribe button just says "are you sure? :(" forever.', 'Growth team', true),
  ('Uncle Pavel wants his phone fixed at Christmas dinner. Again.', 'Family WhatsApp group', true),
  ('A Gen Alpha user cannot find the save button. Has never seen a floppy disk.', 'UX research', true),
  ('Our "AI-powered" feature is three if-statements in a trench coat.', 'Engineering, honestly', true),
  ('Slack status "in a meeting" since March.', 'HR', true),
  ('Password must contain a capital letter, a number, a hieroglyph and a blood sample.', 'Security', true),
  ('The deadline was yesterday. The requirements arrive tomorrow.', 'Project management', true),
  ('Someone microwaved fish in the office. Not a software bug, but please.', 'Open space', true),
  ('The website looks perfect. Only on the designer''s 6K monitor.', 'Design review', true),
  ('Dad bought a "gaming router". Now the toaster has lag.', 'Home network', true),
  ('The new hire asked what a "landline" is. In the telecom team.', 'Onboarding', true);
