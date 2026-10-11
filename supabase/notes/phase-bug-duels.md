# Bug Duels — run note

Run `supabase/migrations/20261011140000_bug_duels.sql` in the SQL Editor **after** `20261011120000_rebel_features.sql` (it redefines `community_health()` so duels count as activity).

## How it works

- A member challenges another approved member's public bug by number (`create_duel`). Lunapark → Bug Duel, or the "Duel ⚔" button on `/swarm`, or `/inside/lunapark?duel=42`.
- Both get the same `seed`, so Bug Rush spawns the same orbs, enemies and hazards in the same order.
- Each player gets exactly one run (`submit_duel_run`). The run stores the score and a compact path (x,y every 100 ms, 0..1000).
- Whoever plays second races the first player's ghost. The other score stays hidden until you have played.
- 48 hours to play. Higher score wins; if only one played, they win by forfeit.
- Limits: one open duel per pair, 10 new challenges per member per day.

## Quick check

```sql
select * from public.my_duels();   -- as a signed-in member, via the app
```
