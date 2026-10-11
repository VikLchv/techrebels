-- techRebels: read-only security check. Run in the Supabase SQL editor after the init migration.
-- Expected: every row has rls_on = true, anon_* = false, and only the listed functions are callable by anon.

-- 1. Tables: RLS on, and what anon / authenticated may do
select c.relname                                                   as table_name,
       c.relrowsecurity                                            as rls_on,
       has_table_privilege('anon', c.oid, 'select')                as anon_select,
       has_table_privilege('anon', c.oid, 'insert')                as anon_insert,
       has_table_privilege('authenticated', c.oid, 'select')       as auth_select,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- 2. Functions anon can call (expected: get_swarm, swarm_count only)
select p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and has_function_privilege('anon', p.oid, 'execute')
order by 1;

-- 3. Columns members may write on bugs (expected: name, role, species, config, is_public)
select column_name,
       has_column_privilege('authenticated', 'public.bugs', column_name, 'update') as can_update
from information_schema.columns
where table_schema = 'public' and table_name = 'bugs'
order by ordinal_position;

-- 4. Matching tables are admin-only through RLS. Ordinary members read only
-- their own published result through my_matches(). Run this while signed in as
-- a non-admin test member: all table counts should be zero and my_matches works.
select 'matching_rounds' as table_name, count(*) from public.matching_rounds
union all
select 'matching_groups', count(*) from public.matching_groups
union all
select 'matching_members', count(*) from public.matching_members;

select public.my_matches();

-- 5. Role/invitation tables are readable only through RLS and cannot be
-- mutated by a browser. Expected: all write columns are false.
select c.table_name,
       has_table_privilege('authenticated', 'public.' || c.table_name, 'insert') as auth_insert,
       has_table_privilege('authenticated', 'public.' || c.table_name, 'update') as auth_update,
       has_table_privilege('authenticated', 'public.' || c.table_name, 'delete') as auth_delete
from (values ('user_roles'), ('community_invites'), ('admin_audit_log')) c(table_name);

-- Run as an ordinary authenticated user. Expected: only their own roles and no
-- invitation/audit rows unless the account is an admin.
select * from public.user_roles;
select * from public.community_invites;
select * from public.admin_audit_log;
