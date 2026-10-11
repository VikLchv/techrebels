# Admin people management — SQL note

Run the complete contents of:

`supabase/migrations/20261008170000_admin_people_management.sql`

Then redeploy the updated admin function:

```sh
supabase functions deploy manage-community
```

This adds server-only, audited actions for:

- suspending and restoring member access;
- removing member, partner or admin roles independently;
- permanently deleting an account after exact email confirmation.

Database safeguards prevent an admin from changing/deleting their own account and prevent removal or deletion of the last admin. Permanent deletion cascades through the existing foreign keys and cannot be undone.

Permanent deletion also removes invitation rows for that email and scrubs the email from older access-audit details. The audit keeps only the non-identifying deletion event, actor and timestamp.
