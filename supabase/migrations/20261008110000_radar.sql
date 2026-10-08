-- Rebel Radar: topics and types of people we want at Rebel Sessions, shown as flying bugs.
-- Public can see approved items and vote counts. Members vote and suggest (suggestions wait for approval).
-- Guest tips ("I know someone") are stored privately in submissions.

alter table public.topics
  add column kind     text not null default 'topic' check (kind in ('topic', 'person')),
  add column pillar   text not null default 'rebels' check (pillar in ('bugs', 'rebels', 'lunapark')),
  add column category text check (category is null or char_length(category) <= 40),
  add column approved boolean not null default false;

-- members may suggest with a type and pillar (approved stays false: no grant on it)
grant insert (title, description, kind, pillar) on public.topics to authenticated;
grant update (approved, kind, pillar, category) on public.topics to authenticated; -- admins only, via RLS

-- votes only count on approved items
drop policy "votes: cast own" on public.topic_votes;
create policy "votes: cast own" on public.topic_votes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.topics t where t.id = topic_id and t.approved)
  );

-- the public Radar: approved, not done, with vote counts and whether the caller voted
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
  where t.approved and t.status <> 'done'
  group by t.id
  order by count(v.user_id) desc, t.created_at;
$$;

revoke all on function public.radar_topics() from public;
grant execute on function public.radar_topics() to anon, authenticated;

-- guest tips land in submissions
alter table public.submissions drop constraint submissions_kind_check;
alter table public.submissions add constraint submissions_kind_check
  check (kind in ('speaker', 'crew', 'partner', 'guest_tip'));

-- seed: the Radar draft (02 — Creative/brands/tech_rebels/radar-topics.md)
insert into public.topics (kind, pillar, category, title, description, status, approved, created_by) values
  ('topic', 'bugs',     'AI and data',            'AI agents in production',            'What breaks when the bot does the work.', 'open', true, null),
  ('topic', 'rebels',   'AI and data',            'Prompting is a job now',             'Who writes prompts and how they test them.', 'open', true, null),
  ('topic', 'bugs',     'AI and data',            'Hallucinations in the wild',         'The best and worst AI fails.', 'open', true, null),
  ('topic', 'bugs',     'AI and data',            'Data that lied to us',               'Dashboards, metrics and the decisions they ruined.', 'open', true, null),
  ('topic', 'bugs',     'Build and ship',         'Failed launches',                    'What went wrong, told by the people who shipped it.', 'open', true, null),
  ('topic', 'bugs',     'Build and ship',         'Legacy code love stories',           'Living with the system nobody wants to touch.', 'open', true, null),
  ('topic', 'rebels',   'Build and ship',         'Shipping with tiny teams',           'Doing a lot with three people and no budget.', 'open', true, null),
  ('topic', 'bugs',     'Build and ship',         'Security incidents, told honestly',  'The 3 a.m. stories.', 'open', true, null),
  ('topic', 'rebels',   'Design and product',     'Design systems that survived',       'And the ones that didn''t.', 'open', true, null),
  ('topic', 'rebels',   'Design and product',     'Killing features',                   'How to say no and remove things people use.', 'open', true, null),
  ('topic', 'rebels',   'Design and product',     'Roadmaps vs reality',                'What actually happens to the plan.', 'open', true, null),
  ('topic', 'lunapark', 'Marketing and growth',   'Viral by accident',                  'Campaigns that blew up for the wrong reasons.', 'open', true, null),
  ('topic', 'rebels',   'Marketing and growth',   'Selling tech to non-tech people',    'Translating features into value.', 'open', true, null),
  ('topic', 'rebels',   'Marketing and growth',   'Building in public',                 'Worth it or just noise?', 'open', true, null),
  ('topic', 'rebels',   'People and careers',     'Pivots and career resets',           'From dev to PM, from corporate to startup and back.', 'open', true, null),
  ('topic', 'rebels',   'People and careers',     'Burnout and boundaries in tech',     'Honest, not a wellness ad.', 'open', true, null),
  ('topic', 'rebels',   'People and careers',     'Imposter syndrome, debugged',        'Everyone has it, few talk about it.', 'open', true, null),
  ('topic', 'lunapark', 'Lunapark',               'Weekend side projects',              'The weird stuff people build for fun.', 'open', true, null),
  ('topic', 'lunapark', 'Lunapark',               'Tech that should not exist',         'The most useless inventions, live demos.', 'open', true, null),
  ('topic', 'lunapark', 'Lunapark',               'Retro tech night',                   'Old machines, old games, old bugs.', 'open', true, null),
  ('person', 'bugs',     'People',  'A founder who shut down a startup',          'What it felt like, and what came after.', 'open', true, null),
  ('person', 'rebels',   'People',  'A founder who pivoted and survived',         'The moment they knew it had to change.', 'open', true, null),
  ('person', 'bugs',     'People',  'An AI engineer shipping agents to real users', 'Real users, real edge cases.', 'open', true, null),
  ('person', 'rebels',   'People',  'A designer who rebuilt a design system',     'From chaos to components.', 'open', true, null),
  ('person', 'rebels',   'People',  'A PM who killed their own feature',          'And why it was the right call.', 'open', true, null),
  ('person', 'lunapark', 'People',  'A marketer whose campaign went viral by accident', 'Luck, timing or genius?', 'open', true, null),
  ('person', 'rebels',   'People',  'A salesperson who sells deep tech',          'Explaining the hard stuff to buyers.', 'open', true, null),
  ('person', 'bugs',     'People',  'A security person with an incident story',   'The night everything was on fire.', 'open', true, null),
  ('person', 'bugs',     'People',  'A data scientist whose model went wrong',    'When the numbers looked great and weren''t.', 'open', true, null),
  ('person', 'rebels',   'People',  'Someone who switched careers into tech',     'Starting over, on purpose.', 'open', true, null),
  ('person', 'lunapark', 'People',  'A maker with a weird side project',          'Built for fun, kept for love.', 'open', true, null),
  ('person', 'rebels',   'People',  'A CTO who still codes on weekends',          'Leading by day, shipping by night.', 'open', true, null);
