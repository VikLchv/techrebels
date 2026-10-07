-- Community registration: the member profile used for matching (bug buddies, swarm squads).
-- Everything here is private: a member reads and edits only their own row, admins read all.
-- No date of birth (an age range is enough). Title, job title and company are optional and never shown publicly.

alter table public.profiles
  add column full_name           text check (full_name is null or char_length(btrim(full_name)) between 1 and 80),
  add column title               text check (title is null or char_length(title) <= 40),
  add column job_title           text check (job_title is null or char_length(job_title) <= 80),
  add column company             text check (company is null or char_length(company) <= 80),
  add column age_range           text check (age_range is null or age_range in ('under 25', '25-29', '30-34', '35-39', '40-49', '50+', 'prefer not to say')),
  add column topics              text[] not null default '{}' check (cardinality(topics) <= 20),
  add column activities          text[] not null default '{}' check (cardinality(activities) <= 15),
  add column ambitions           text[] not null default '{}' check (cardinality(ambitions) <= 10),
  add column dream_project       text check (dream_project is null or char_length(dream_project) <= 500),
  add column matching_consent    boolean not null default false,
  add column matching_consent_at timestamptz,
  add column profile_updated_at  timestamptz;

-- each list item stays short
create or replace function public.short_items(items text[], max_len integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(char_length(i) between 1 and max_len), true) from unnest(items) as i;
$$;

alter table public.profiles
  add constraint profiles_topics_short check (public.short_items(topics, 60)),
  add constraint profiles_activities_short check (public.short_items(activities, 60)),
  add constraint profiles_ambitions_short check (public.short_items(ambitions, 60));

-- members may edit their own profile fields (RLS already limits them to their own row)
grant update (full_name, title, job_title, company, age_range, topics, activities, ambitions, dream_project, matching_consent)
  on public.profiles to authenticated;

-- timestamps for consent and profile changes are set by the database, never by the client
create or replace function public.track_profile_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.matching_consent is distinct from old.matching_consent then
    new.matching_consent_at = now();
  end if;
  if (new.full_name, new.title, new.job_title, new.company, new.age_range, new.topics, new.activities, new.ambitions, new.dream_project)
     is distinct from
     (old.full_name, old.title, old.job_title, old.company, old.age_range, old.topics, old.activities, old.ambitions, old.dream_project) then
    new.profile_updated_at = now();
  end if;
  return new;
end;
$$;

revoke all on function public.track_profile_changes() from public, anon, authenticated;

create trigger profiles_track_profile_changes before update on public.profiles
  for each row execute function public.track_profile_changes();

-- new sign-ups: also keep the full name typed in the Bug Lab
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  wants_news boolean := coalesce(new.raw_user_meta_data ->> 'marketing_consent', '') = 'true';
  accepted   boolean := coalesce(new.raw_user_meta_data ->> 'privacy_accepted', '') = 'true';
  name_in    text    := nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 80), '');
begin
  insert into public.profiles (id, email, full_name, marketing_consent, consent_at, privacy_accepted_at)
  values (
    new.id,
    new.email,
    name_in,
    wants_news,
    case when wants_news then now() end,
    case when accepted then now() end
  );
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
