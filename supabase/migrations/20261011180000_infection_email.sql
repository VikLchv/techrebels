-- Infection emails: a member can send an unused infection code to a friend's address
-- (Edge Function send-infection). Only the time and count are stored, never the address.

alter table public.infections
  add column emailed_at  timestamptz,
  add column email_count integer not null default 0 check (email_count between 0 and 10);

create or replace function public.my_infections()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'allowed', 3 + coalesce((select p.infection_bonus from public.profiles p where p.id = (select auth.uid())), 0),
    'codes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', i.code,
        'created_at', i.created_at,
        'claimed', i.claimed_by is not null,
        'claimed_at', i.claimed_at,
        'emailed_at', i.emailed_at,
        'joined', coalesce(p.membership_status = 'approved', false),
        'bug_number', case when b.is_public then b.bug_number end,
        'bug_name', case when b.is_public then b.name end
      ) order by i.created_at)
      from public.infections i
      left join public.profiles p on p.id = i.claimed_by
      left join public.bugs b on b.user_id = i.claimed_by
      where i.inviter = (select auth.uid())
    ), '[]'::jsonb)
  );
$$;
