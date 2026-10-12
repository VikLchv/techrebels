# Phase 5 — admin: Supabase notes

## 1. Install the admin support migration

In **Supabase → SQL Editor**, run the complete contents of:

`supabase/migrations/20261008130000_admin.sql`

## 2. Make an existing member an admin

Replace the email and run this once:

```sql
insert into public.admins (user_id)
select id from auth.users where lower(email) = lower('YOUR-EMAIL@example.com')
on conflict (user_id) do nothing;
```

The email must already belong to a registered tech rebels member. This does not create a new account.

Verify:

```sql
select p.full_name, p.email, a.created_at as admin_since
from public.admins a
join public.profiles p on p.id = a.user_id
order by a.created_at;
```

## 3. Open the dashboard

Sign out and back in if the current browser session was open while admin access was added, then visit:

`/inside/admin`

The page checks `is_admin()` before loading any private data. RLS remains the final enforcement layer for every table.

## Removing admin access

```sql
delete from public.admins
where user_id = (select id from auth.users where lower(email) = lower('YOUR-EMAIL@example.com'));
```
