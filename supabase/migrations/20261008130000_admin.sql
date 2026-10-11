-- Phase 5: admin dashboard support.
-- Existing table policies already restrict profiles, bugs, submissions, merch
-- and matching data to admins. This migration adds the one missing vote policy
-- and expands the safe aggregate overview used by /inside/admin.

create policy "votes: admins read all" on public.topic_votes
  for select to authenticated
  using ((select public.is_admin()));

create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admins only';
  end if;
  return jsonb_build_object(
    'members',             (select count(*) from public.profiles),
    'bugs',                (select count(*) from public.bugs),
    'matching_opt_in',     (select count(*) from public.profiles where matching_consent),
    'marketing_opt_in',    (select count(*) from public.profiles where marketing_consent),
    'submissions_new',     (select count(*) from public.submissions where status = 'new'),
    'topics_pending',      (select count(*) from public.topics where not approved),
    'topic_votes',         (select count(*) from public.topic_votes),
    'merch_interest',      (select count(*) from public.merch_interest),
    'matching_rounds',     (select count(*) from public.matching_rounds),
    'bugs_by_role',        (select coalesce(jsonb_object_agg(role, n), '{}'::jsonb)
                              from (select role, count(*) n from public.bugs group by role) r),
    'merch',               (select coalesce(jsonb_agg(m), '[]'::jsonb)
                              from (select item, size, count(*) n from public.merch_interest
                                    group by item, size order by item, size) m)
  );
end;
$$;

revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;
