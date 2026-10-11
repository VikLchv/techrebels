-- Server-only people/access management with destructive-action safeguards.
-- The Edge Function authenticates the request; this transaction independently
-- verifies the actor and keeps the last-admin protection atomic.

create or replace function public.admin_manage_person(
  p_actor_id uuid,
  p_target_id uuid,
  p_action text,
  p_role text default null,
  p_confirmation_email text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_email text;
  target_is_admin boolean;
  admin_count integer;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'server only';
  end if;
  if not exists (select 1 from public.admins where user_id = p_actor_id) then
    raise exception 'admins only';
  end if;
  if p_actor_id = p_target_id then
    raise exception 'you cannot change or delete your own access';
  end if;

  select lower(email) into target_email from public.profiles where id = p_target_id;
  if target_email is null then raise exception 'person not found'; end if;
  select exists (select 1 from public.admins where user_id = p_target_id) into target_is_admin;

  if p_action = 'suspend_member' then
    update public.profiles
    set membership_status = 'suspended', reviewed_at = now(), reviewed_by = p_actor_id,
        matching_consent = false
    where id = p_target_id;
    update public.bugs set is_public = false where user_id = p_target_id;
    delete from public.user_roles where user_id = p_target_id and role = 'member';

  elsif p_action = 'restore_member' then
    update public.profiles
    set membership_status = 'approved', reviewed_at = now(), reviewed_by = p_actor_id,
        approved_at = coalesce(approved_at, now())
    where id = p_target_id;
    insert into public.user_roles (user_id, role, granted_by)
    values (p_target_id, 'member', p_actor_id)
    on conflict (user_id, role) do update set granted_by = excluded.granted_by;
    update public.bugs set is_public = true where user_id = p_target_id;

  elsif p_action = 'remove_role' then
    if p_role not in ('member', 'partner', 'admin') then raise exception 'invalid role'; end if;
    if p_role = 'admin' then
      perform pg_advisory_xact_lock(hashtext('techrebels-admin-roster'));
      select count(*) into admin_count from public.admins;
      if target_is_admin and admin_count <= 1 then raise exception 'the last admin cannot be removed'; end if;
      delete from public.admins where user_id = p_target_id;
      delete from public.user_roles where user_id = p_target_id and role = 'admin';
    elsif p_role = 'member' then
      update public.profiles
      set membership_status = 'suspended', reviewed_at = now(), reviewed_by = p_actor_id,
          matching_consent = false
      where id = p_target_id;
      update public.bugs set is_public = false where user_id = p_target_id;
      delete from public.user_roles where user_id = p_target_id and role = 'member';
    else
      delete from public.user_roles where user_id = p_target_id and role = 'partner';
    end if;

  elsif p_action = 'delete_account' then
    if lower(btrim(coalesce(p_confirmation_email, ''))) <> target_email then
      raise exception 'confirmation email does not match';
    end if;
    if target_is_admin then
      perform pg_advisory_xact_lock(hashtext('techrebels-admin-roster'));
      select count(*) into admin_count from public.admins;
      if admin_count <= 1 then raise exception 'the last admin cannot be deleted'; end if;
    end if;
    -- Honour account deletion across invitation/audit metadata too. Keep only a
    -- non-identifying accountability event: who performed a deletion and when.
    delete from public.community_invites where email = target_email;
    update public.community_invites set invited_by = p_actor_id where invited_by = p_target_id;
    update public.admin_audit_log
    set details = details - 'email'
    where target_user_id = p_target_id or lower(coalesce(details ->> 'email', '')) = target_email;
    insert into public.admin_audit_log (actor_id, target_user_id, action, details)
    values (p_actor_id, p_target_id, 'account_deleted', '{}'::jsonb);
    delete from auth.users where id = p_target_id;
    return;

  else
    raise exception 'invalid action';
  end if;

  insert into public.admin_audit_log (actor_id, target_user_id, action, details)
  values (p_actor_id, p_target_id, p_action, jsonb_strip_nulls(jsonb_build_object('role', p_role)));
end;
$$;

revoke all on function public.admin_manage_person(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_manage_person(uuid, uuid, text, text, text)
  to service_role;
