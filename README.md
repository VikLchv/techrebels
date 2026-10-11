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

## Git workflow
- `dev` is where everything lands first. Push to `dev` directly, or open a branch (`feature/...`) and a pull request into `dev`.
- `main` is production: Cloudflare deploys every commit on `main` to wearetechrebels.com.
- `main` only changes through a pull request from `dev`, approved by a code owner (Vik or Tom, see `.github/CODEOWNERS`). No direct pushes, no force pushes.
- Database migrations in `supabase/migrations/` are run by hand in the SQL editor after the pull request is merged.
