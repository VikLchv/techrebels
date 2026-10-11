-- Additive community roles and secure, expiring invitations.
-- Membership remains the source of truth for member access. The role table adds
-- partner/admin capabilities without forcing a person into one exclusive label.

create table public.user_roles (
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null check (role in ('member', 'partner', 'admin')),
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.community_invites (
  id              uuid primary key default gen_random_uuid(),
  email           text not null check (char_length(email) between 3 and 320),
  role            text not null check (role in ('member', 'partner', 'admin')),
  message         text check (message is null or char_length(message) <= 600),
  status          text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  invited_by      uuid not null references auth.users (id) on delete restrict,
  invited_user_id uuid references auth.users (id) on delete set null,
  accepted_by     uuid references auth.users (id) on delete set null,
  expires_at      timestamptz not null default (now() + interval '7 days'),
  accepted_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint community_invites_email_normalized check (email = lower(btrim(email)))
);

create unique index community_invites_one_pending_role_idx
  on public.community_invites (email, role) where status = 'pending';
create index community_invites_status_created_idx
  on public.community_invites (status, created_at desc);

create table public.admin_audit_log (
  id             bigint generated always as identity primary key,
  actor_id       uuid references auth.users (id) on delete set null,
  target_user_id uuid references auth.users (id) on delete set null,
  action         text not null check (char_length(action) between 3 and 80),
  details        jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at     timestamptz not null default now()
);

create index admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create trigger community_invites_updated_at before update on public.community_invites
  for each row execute function public.set_updated_at();

-- Backfill the additive role model from the access rules already in production.
insert into public.user_roles (user_id, role)
select id, 'member' from public.profiles where membership_status = 'approved'
on conflict do nothing;

insert into public.user_roles (user_id, role)
select user_id, 'admin' from public.admins
on conflict do nothing;

insert into public.user_roles (user_id, role)
select user_id, 'member' from public.admins
on conflict do nothing;

create or replace function public.has_role(requested_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select requested_role in ('member', 'partner', 'admin') and exists (
    select 1 from public.user_roles r
    where r.user_id = (select auth.uid()) and r.role = requested_role
  );
$$;

-- Keep the additive member role aligned when an application is approved or
-- suspended. Admin roles are managed only by the server-side admin function.
create or replace function public.sync_membership_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.membership_status = 'approved' then
    insert into public.user_roles (user_id, role, granted_by)
    values (new.id, 'member', (select auth.uid()))
    on conflict (user_id, role) do nothing;
  else
    delete from public.user_roles where user_id = new.id and role = 'member';
  end if;
  return new;
end;
$$;

create trigger profiles_sync_membership_role
  after update of membership_status on public.profiles
  for each row when (old.membership_status is distinct from new.membership_status)
  execute function public.sync_membership_role();

create or replace function public.get_my_invitation(invite_id uuid)
returns table (email text, role text, message text, expires_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_email text := lower(coalesce((select auth.jwt() ->> 'email'), ''));
begin
  if (select auth.uid()) is null then raise exception 'not signed in'; end if;
  return query
  select i.email, i.role, i.message, i.expires_at
  from public.community_invites i
  where i.id = invite_id
    and i.email = caller_email
    and i.status = 'pending'
    and i.expires_at > now();
end;
$$;

-- Acceptance is atomic and tied to the email in the signed Supabase session.
-- Since browsers cannot write community_invites, a user cannot manufacture an
-- admin invitation or change the role attached to a legitimate one.
create or replace function public.accept_community_invite(
  invite_id uuid,
  invitee_name text,
  privacy_accepted boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  caller_email text := lower(coalesce((select auth.jwt() ->> 'email'), ''));
  clean_name text := nullif(left(btrim(coalesce(invitee_name, '')), 80), '');
  invitation public.community_invites%rowtype;
begin
  if caller is null then raise exception 'not signed in'; end if;
  if clean_name is null or char_length(clean_name) < 2 then raise exception 'name is required'; end if;
  if not coalesce(privacy_accepted, false) then raise exception 'privacy acceptance is required'; end if;

  select * into invitation
  from public.community_invites
  where id = invite_id
  for update;

  if invitation.id is null then raise exception 'invitation not found'; end if;
  if invitation.status <> 'pending' then raise exception 'invitation is no longer active'; end if;
  if invitation.expires_at <= now() then
    update public.community_invites set status = 'expired' where id = invite_id;
    raise exception 'invitation has expired';
  end if;
  if invitation.email <> caller_email then raise exception 'invitation belongs to another email'; end if;

  update public.profiles
  set full_name = clean_name,
      privacy_accepted_at = coalesce(privacy_accepted_at, now()),
      membership_status = case when invitation.role in ('member', 'admin') then 'approved' else membership_status end,
      approved_at = case when invitation.role in ('member', 'admin') then coalesce(approved_at, now()) else approved_at end
  where id = caller;

  if invitation.role in ('member', 'admin') then
    insert into public.user_roles (user_id, role, granted_by)
    values (caller, 'member', invitation.invited_by)
    on conflict (user_id, role) do nothing;
    update public.bugs set is_public = true where user_id = caller;
  end if;

  insert into public.user_roles (user_id, role, granted_by)
  values (caller, invitation.role, invitation.invited_by)
  on conflict (user_id, role) do nothing;

  if invitation.role = 'admin' then
    insert into public.admins (user_id) values (caller) on conflict do nothing;
  end if;

  update public.community_invites
  set status = 'accepted', invited_user_id = caller, accepted_by = caller, accepted_at = now()
  where id = invite_id;

  insert into public.admin_audit_log (actor_id, target_user_id, action, details)
  values (caller, caller, 'invite_accepted', jsonb_build_object('invite_id', invite_id, 'role', invitation.role));

  return invitation.role;
end;
$$;

alter table public.user_roles enable row level security;
alter table public.community_invites enable row level security;
alter table public.admin_audit_log enable row level security;

create policy "roles: read own, admins read all" on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy "invites: admins read all" on public.community_invites
  for select to authenticated using ((select public.is_admin()));

create policy "audit: admins read all" on public.admin_audit_log
  for select to authenticated using ((select public.is_admin()));

-- No browser may insert/update/delete these tables. All mutations go through
-- the service-role Edge Function, which independently verifies the caller.
revoke all on public.user_roles, public.community_invites, public.admin_audit_log from anon, authenticated;
grant select on public.user_roles, public.community_invites, public.admin_audit_log to authenticated;

revoke all on function public.has_role(text) from public, anon;
revoke all on function public.sync_membership_role() from public, anon, authenticated;
revoke all on function public.get_my_invitation(uuid) from public, anon;
revoke all on function public.accept_community_invite(uuid, text, boolean) from public, anon;
grant execute on function public.has_role(text) to authenticated;
grant execute on function public.get_my_invitation(uuid) to authenticated;
grant execute on function public.accept_community_invite(uuid, text, boolean) to authenticated;

-- Include the new queues in the existing admin overview.
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
    'partners',            (select count(*) from public.user_roles where role = 'partner'),
    'admins',              (select count(*) from public.admins),
    'invites_pending',     (select count(*) from public.community_invites where status = 'pending' and expires_at > now()),
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

revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;
