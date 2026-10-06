-- Supabase creates public.rls_auto_enable() when "Enable automatic RLS" is on at project creation.
-- It is an event trigger function and cannot be called directly, but it should not be listed
-- as executable by API roles. Event triggers fire regardless of EXECUTE privilege.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
