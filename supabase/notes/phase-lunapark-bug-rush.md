# Lunapark — Bug Rush

## Run in Supabase SQL Editor

Run the complete contents of:

`supabase/migrations/20261008200000_lunapark_bug_rush.sql`

This creates the private score table and authenticated RPCs for saving a completed run and reading the Hall of Infamy. The leaderboard exposes only BUG number, BUG name, BUG configuration, score and rank — never a person's name or email.

No Edge Function or new environment secret is needed for this phase.

The first version applies server-side duration, range and submission-rate checks. Like any browser game, a determined user can still manipulate a client-reported score; stronger signed-run verification can be added before prizes or material rewards are attached to rankings.

## Endless mode update

After the first migration, also run:

`supabase/migrations/20261008201000_bug_rush_endless.sql`

It changes the score validation from a 45-second run to an endless three-life run, allowing longer durations and higher records.
