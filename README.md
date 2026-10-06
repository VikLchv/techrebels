# techRebels

Website for techRebels, a community for curious people in tech. Less conference, more carnival.

## Structure
- `supabase/migrations/` database schema, run in order (SQL editor or Supabase CLI)
- `supabase/tests/security_check.sql` read-only check that RLS and grants are locked down
- `web/` the website (Astro + React)

## Supabase
- Project ref: `eomffbhpevrxqtnjtout` (West EU, Paris)
- Auth: email magic link only
- The public never reads tables directly. The Swarm uses `get_swarm()` / `swarm_count()` and the Realtime channel `swarm` (event `new_bug`).

Never commit `.env` files, the database password or the service role key.
