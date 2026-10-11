# Fix or Won't Fix — run note

Run `supabase/migrations/20261011160000_fix_or_wont.sql` in the SQL Editor after the duels migration (it redefines `community_health()` again to count Fix runs).

- 42 starter tickets are seeded and approved, each with a "reported by" line for every generation in the office.
- Votes: first answer per member and ticket counts (`fix_vote`). Stats show how the swarm decided.
- Scoring: agree with the majority = 100 + speed bonus; minority under 20 % answered in under 1.5 s = 150 "rebel move"; tickets with fewer than 5 votes = 60 + speed.
- Top Fixers board: best run per bug this week (`fix_leaderboard`).
- Members submit tickets in the result screen; approve with `select moderate_fix_ticket('<ticket id>', true);` or:

```sql
select id, body, reporter, created_at from public.fix_tickets where not approved order by created_at;
```

Local preview without the database: `/inside/lunapark?fxdemo` (dev server only).
