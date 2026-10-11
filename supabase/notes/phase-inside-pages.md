# Separate Inside pages

The frontend now uses real routes:

- `/inside` — overview and applicant status;
- `/inside/profile` — private matching profile and consents;
- `/inside/matches` — reviewed bug buddy and squad;
- `/inside/drop` — member merch interest;
- `/inside/account` — login, roles, privacy links and account deletion.

## Required safety SQL

Run the complete contents of:

`supabase/migrations/20261008180000_safe_self_delete.sql`

It prevents admins from bypassing the last-admin protections through self-service account deletion. An admin must have another admin remove the admin role first. Ordinary members, applicants and partners retain self-service deletion. The function also removes invitation records for the deleted email and scrubs that email from audit details.

No Edge Function redeploy is required for this migration.
