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
