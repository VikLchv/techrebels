# Membership gate — Supabase notes

Run the complete contents of:

`supabase/migrations/20261008140000_membership_gate.sql`

This migration is designed to run after phases 4 and 5. It will:

- mark existing admins as approved members;
- make every future signup pending by default;
- keep pending bugs private;
- protect Radar voting, matching and merch with `is_member()`;
- add admin-only review actions.

Run it once as one complete query. No environment variables or paid service are needed.

## Verify your own account

```sql
select p.email, p.membership_status, public.is_admin() as current_request_is_admin
from public.profiles p
where p.id in (select user_id from public.admins);
```

Your admin profile should show `approved`. `current_request_is_admin` may be false in the SQL editor because it has no browser user session; that is expected.

## Queue overview

```sql
select full_name, email, city, membership_status, application_submitted_at
from public.profiles
order by application_submitted_at desc nulls last, created_at desc;
```

Applications should normally be reviewed in `/inside/admin`; manual emergency approval is possible with:

```sql
update public.profiles
set membership_status = 'approved', approved_at = now(), reviewed_at = now()
where lower(email) = lower('MEMBER-EMAIL@example.com');

update public.bugs
set is_public = true
where user_id = (select id from public.profiles where lower(email) = lower('MEMBER-EMAIL@example.com'));
```

Prefer the admin UI because it records the reviewing admin and publishes the bug in one operation.

## End-to-end check

1. Open a private/incognito window and create a new bug with a new email.
2. Follow the magic link. The bug should be saved privately and `/inside` should show the application form.
3. Submit at least 20 characters in “Why do you want to join?”.
4. In your admin account open `/inside/admin` → **Applications** and approve it.
5. Reload `/inside` in the applicant window. The full member profile, matching and merch should now be available, and the bug should appear in `/swarm`.
