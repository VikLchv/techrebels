-- Membership gate: signing in creates an applicant, not an approved member.
-- Admins review applications; RLS protects member-only features independently
-- of anything the frontend shows or hides.

alter table public.profiles
  add column membership_status text not null default 'pending'
    check (membership_status in ('pending', 'waitlisted', 'approved', 'rejected', 'suspended')),
  add column city text check (city is null or char_length(city) <= 80),
  add column application_reason text check (application_reason is null or char_length(application_reason) <= 800),
  add column application_contribution text check (application_contribution is null or char_length(application_contribution) <= 800),
  add column application_submitted_at timestamptz,
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references auth.users (id) on delete set null,
  add column admin_note text check (admin_note is null or char_length(admin_note) <= 1000),
  add column approved_at timestamptz;

-- Existing admins keep uninterrupted access when the gate is introduced.
update public.profiles p
set membership_status = 'approved',
    application_submitted_at = coalesce(p.application_submitted_at, now()),
    reviewed_at = now(),
    approved_at = now()
where exists (select 1 from public.admins a where a.user_id = p.id);

-- Existing non-admin accounts enter the same review flow as new applicants.
-- Their bugs remain saved but disappear from the public swarm until approval.
update public.bugs b
set is_public = false
where not exists (
  select 1 from public.profiles p
  where p.id = b.user_id and p.membership_status = 'approved'
);

create index profiles_membership_queue_idx
  on public.profiles (membership_status, application_submitted_at desc);

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.membership_status = 'approved'
  ) or public.is_admin();
$$;

-- Applicant-safe write API. Server-owned review fields cannot be supplied by
-- the browser. Submitting again updates the application and returns it to queue.
create or replace function public.submit_membership_application(
  applicant_city text,
  reason text,
  contribution text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  clean_city text := nullif(left(btrim(coalesce(applicant_city, '')), 80), '');
  clean_reason text := nullif(left(btrim(coalesce(reason, '')), 800), '');
  clean_contribution text := nullif(left(btrim(coalesce(contribution, '')), 800), '');
begin
  if caller is null then raise exception 'not signed in'; end if;
  if clean_reason is null or char_length(clean_reason) < 20 then
    raise exception 'tell us a little more about why you want to join';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = caller and p.full_name is not null and p.privacy_accepted_at is not null
  ) then raise exception 'name and privacy consent are required'; end if;

  update public.profiles
  set city = clean_city,
      application_reason = clean_reason,
      application_contribution = clean_contribution,
      application_submitted_at = now(),
      membership_status = case when membership_status in ('approved', 'suspended') then membership_status else 'pending' end,
      reviewed_at = case when membership_status in ('approved', 'suspended') then reviewed_at else null end,
      reviewed_by = case when membership_status in ('approved', 'suspended') then reviewed_by else null end,
      admin_note = case when membership_status in ('approved', 'suspended') then admin_note else null end
  where id = caller;
end;
$$;

-- The only API that changes membership state. Approving publishes the member's
-- bug; all other states remove it from the public swarm.
create or replace function public.review_membership(
  member_id uuid,
  new_status text,
  note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if new_status not in ('pending', 'waitlisted', 'approved', 'rejected', 'suspended') then
    raise exception 'invalid membership status';
  end if;
  if member_id = (select auth.uid()) and new_status <> 'approved' then
    raise exception 'an admin cannot remove their own member access';
  end if;
  if not exists (select 1 from public.profiles where id = member_id) then
    raise exception 'member not found';
  end if;

  update public.profiles
  set membership_status = new_status,
      reviewed_at = now(),
      reviewed_by = (select auth.uid()),
      admin_note = nullif(left(btrim(coalesce(note, '')), 1000), ''),
      approved_at = case when new_status = 'approved' then coalesce(approved_at, now()) else approved_at end,
      matching_consent = case when new_status = 'approved' then matching_consent else false end
  where id = member_id;

  update public.bugs set is_public = (new_status = 'approved') where user_id = member_id;
end;
$$;

-- A pending applicant may save and edit a bug, but cannot publish it by sending
-- is_public=true manually. Admin approval flips it through review_membership().
create or replace function public.enforce_bug_membership_visibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if session_user = 'authenticator' and not public.is_admin() and not public.is_member() then
    new.is_public = false;
  end if;
  return new;
end;
$$;

create trigger bugs_enforce_membership_visibility
  before insert or update of is_public on public.bugs
  for each row execute function public.enforce_bug_membership_visibility();

-- Approval can turn an existing private bug public. Broadcast that transition
-- just like a newly inserted public bug.
create trigger bugs_broadcast_on_approval
  after update of is_public on public.bugs
  for each row when (old.is_public = false and new.is_public = true)
  execute function public.broadcast_new_bug();

-- Keep matching opt-in off until approval, even if a pending browser sends it.
create or replace function public.track_profile_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.membership_status <> 'approved' then new.matching_consent = false; end if;
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

-- Member-only RLS. Public Radar and Swarm reads continue through their safe RPCs.
drop policy "topics: members read" on public.topics;
drop policy "topics: members suggest" on public.topics;
create policy "topics: members read" on public.topics
  for select to authenticated using ((select public.is_member()));
create policy "topics: members suggest" on public.topics
  for insert to authenticated
  with check ((select public.is_member()) and created_by = (select auth.uid()) and status = 'open');

drop policy "votes: read own" on public.topic_votes;
drop policy "votes: cast own" on public.topic_votes;
drop policy "votes: remove own" on public.topic_votes;
create policy "votes: read own" on public.topic_votes
  for select to authenticated using ((select public.is_member()) and user_id = (select auth.uid()));
create policy "votes: cast own" on public.topic_votes
  for insert to authenticated
  with check (
    (select public.is_member()) and user_id = (select auth.uid())
    and exists (select 1 from public.topics t where t.id = topic_id and t.approved)
  );
create policy "votes: remove own" on public.topic_votes
  for delete to authenticated using ((select public.is_member()) and user_id = (select auth.uid()));

drop policy "guests: read own, admins read all" on public.guest_suggestions;
drop policy "guests: suggest" on public.guest_suggestions;
create policy "guests: read own, admins read all" on public.guest_suggestions
  for select to authenticated
  using (((select public.is_member()) and user_id = (select auth.uid())) or (select public.is_admin()));
create policy "guests: suggest" on public.guest_suggestions
  for insert to authenticated with check ((select public.is_member()) and user_id = (select auth.uid()));

drop policy "merch: read own, admins read all" on public.merch_interest;
drop policy "merch: add own" on public.merch_interest;
drop policy "merch: change own" on public.merch_interest;
drop policy "merch: remove own" on public.merch_interest;
create policy "merch: read own, admins read all" on public.merch_interest
  for select to authenticated
  using (((select public.is_member()) and user_id = (select auth.uid())) or (select public.is_admin()));
create policy "merch: add own" on public.merch_interest
  for insert to authenticated with check ((select public.is_member()) and user_id = (select auth.uid()));
create policy "merch: change own" on public.merch_interest
  for update to authenticated
  using ((select public.is_member()) and user_id = (select auth.uid()))
  with check ((select public.is_member()) and user_id = (select auth.uid()));
create policy "merch: remove own" on public.merch_interest
  for delete to authenticated using ((select public.is_member()) and user_id = (select auth.uid()));

-- Add membership numbers to the existing admin overview.
create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return jsonb_build_object(
    'members',             (select count(*) from public.profiles where membership_status = 'approved'),
    'applicants_pending',  (select count(*) from public.profiles where membership_status = 'pending' and application_submitted_at is not null),
    'bugs',                (select count(*) from public.bugs where is_public),
    'matching_opt_in',     (select count(*) from public.profiles where membership_status = 'approved' and matching_consent),
    'marketing_opt_in',    (select count(*) from public.profiles where marketing_consent),
    'submissions_new',     (select count(*) from public.submissions where status = 'new'),
    'topics_pending',      (select count(*) from public.topics where not approved),
    'topic_votes',         (select count(*) from public.topic_votes),
    'merch_interest',      (select count(*) from public.merch_interest),
    'matching_rounds',     (select count(*) from public.matching_rounds),
    'bugs_by_role',        (select coalesce(jsonb_object_agg(role, n), '{}'::jsonb)
                              from (select role, count(*) n from public.bugs where is_public group by role) r),
    'merch',               (select coalesce(jsonb_agg(m), '[]'::jsonb)
                              from (select item, size, count(*) n from public.merch_interest
                                    group by item, size order by item, size) m)
  );
end;
$$;

revoke all on function public.is_member() from public, anon;
revoke all on function public.submit_membership_application(text, text, text) from public, anon;
revoke all on function public.review_membership(uuid, text, text) from public, anon;
revoke all on function public.enforce_bug_membership_visibility() from public, anon, authenticated;
revoke all on function public.track_profile_changes() from public, anon, authenticated;
revoke all on function public.admin_stats() from public, anon;

grant execute on function public.is_member() to authenticated;
grant execute on function public.submit_membership_application(text, text, text) to authenticated;
grant execute on function public.review_membership(uuid, text, text) to authenticated;
grant execute on function public.admin_stats() to authenticated;
