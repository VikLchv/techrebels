# Rebel features (wave 2) — run note

Run the complete contents of `supabase/migrations/20261011120000_rebel_features.sql` in the Supabase SQL Editor. No Edge Function deploy, no secrets.

## What it adds

| Feature | Tables | Functions | Page |
| --- | --- | --- | --- |
| Infections (3 invites per member bug) | `infections`, profile columns `infected_by`, `entry_route`, `entry_priority`, `infection_bonus` | `create_infection`, `my_infections`, `claim_infection`, `infection_tree`, `grant_infections` | `/inside/infect`, `/lab?infect=CODE`, `/swarm#outbreak` |
| Intro exploit (`ls -a`, `cat .rebel.key`) | – | `claim_exploit` | intro console |
| Community health / decay | – | `community_health` | every page (`?decay=0.7` previews) |
| Tech sins | `tech_sins`, `sin_reactions` | `confess_sin`, `sins_feed`, `toggle_me_too`, `moderate_sin` | `/sins` |
| Industry bug bounty | topics `kind = 'bounty'` | `bounty_board`, `radar_topics` (now excludes bounties) | `/bounty` |
| Anti-CFP | submissions `kind = 'anti_cfp'` | – | `/anti-cfp` |
| Time capsule (opens 2027-10-01 17:00 Prague) | `capsule_predictions` | `seal_prediction`, `my_predictions`, `capsule_stats`, `capsule_open` | `/capsule` |
| Ragequit | `ragequit_ghosts` | `ragequit`, `ghost_wall` | `/inside/account`, `/swarm#ghosts` |

## Rules worth knowing

- An infection code or the exploit only gives **priority in the review queue** (`entry_priority`). The crew still approves every application.
- Codes are single use. A member gets 3; an admin can raise it with `select grant_infections('<member uuid>', 2);` (extra on top of 3).
- Tech sins are anonymous in every API. Authors are stored only so a deleted account takes its sins with it. Hide one with `select moderate_sin('<sin id>', true);`.
- Bounty reports from members wait for approval like Radar suggestions (`approved = true` in the Control Room or SQL).
- Predictions are unreadable to everyone, admins included, until the opening date.
- Ragequit ghosts keep only the bug drawing, its number and the message. No name, no email.

## Quick checks after running

```sql
select public.community_health();
select * from public.bounty_board();
select public.capsule_stats();
```
