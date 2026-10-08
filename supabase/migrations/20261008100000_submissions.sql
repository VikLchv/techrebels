-- Get-involved forms: speaker pitches, crew sign-ups, partner and host enquiries.
-- Anyone may submit (insert only). Only admins can read them or change their status.

create table public.submissions (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  kind        text not null check (kind in ('speaker', 'crew', 'partner')),
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  email       text not null check (char_length(email) <= 120 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  company     text check (company is null or char_length(company) <= 120),
  topic       text check (topic is null or char_length(topic) <= 120),
  details     text check (details is null or char_length(details) <= 800),
  areas       text[] not null default '{}' check (cardinality(areas) <= 12 and public.short_items(areas, 60)),
  link        text check (link is null or (char_length(link) <= 300 and link ~* '^https?://')),
  kind_detail text check (kind_detail is null or char_length(kind_detail) <= 80),
  consent     boolean not null check (consent),
  user_id     uuid default auth.uid() references auth.users (id) on delete set null,
  status      text not null default 'new' check (status in ('new', 'contacted', 'done', 'declined'))
);

create index submissions_created_idx on public.submissions (created_at desc);

alter table public.submissions enable row level security;

create policy "submissions: anyone can submit" on public.submissions
  for insert to anon, authenticated
  with check (consent and status = 'new');

create policy "submissions: admins read" on public.submissions
  for select to authenticated
  using ((select public.is_admin()));

create policy "submissions: admins update" on public.submissions
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

grant insert (kind, name, email, company, topic, details, areas, link, kind_detail, consent)
  on public.submissions to anon, authenticated;
grant select, update (status) on public.submissions to authenticated;
