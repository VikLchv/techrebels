# Roles & invitations — run/deploy note

## 1. Run in Supabase SQL Editor

Run the complete contents of:

`supabase/migrations/20261008160000_roles_and_invitations.sql`

This creates:

- additive `member`, `partner` and `admin` roles;
- expiring invitations with pending/accepted/expired/revoked states;
- an admin audit log;
- atomic invite acceptance tied to the email in the authenticated session;
- protection against browser-side role assignment.

Existing approved members and admins are backfilled automatically. It does not delete or replace existing profiles.

## 2. Deploy the admin Edge Function

The Resend/SITE_URL secrets from the branded-email phase must already be set. Then run:

```sh
supabase functions deploy manage-community
supabase functions deploy send-auth-email --no-verify-jwt
```

The second deploy publishes the updated role-specific invitation wording. Keep JWT verification enabled for `manage-community`.

## 3. Supabase URL configuration

In **Authentication → URL Configuration → Redirect URLs**, allow both the production URL and the local test URL:

```text
https://YOUR-DOMAIN.com/accept-invite
http://127.0.0.1:4321/accept-invite
```

Supabase may match the query string automatically; the invitation ID is added as `?invite=...`.

## 4. Test in this order

1. Open `/inside/admin` as an admin.
2. Invite a fresh email as **member**.
3. Open the email, set a strong password, accept privacy, and enter Inside.
4. Invite an existing account as **partner** and verify the link asks them to log in before opening Partner Space.
5. Invite a disposable test account as **admin** and verify it sees both Inside and Control Room.
6. Revoke one pending invitation and verify the old link no longer works.

## Security notes

- An invite expires after 7 days.
- Roles are additive: an admin can also be a member or partner.
- Partner access does not expose member profiles.
- The frontend cannot write roles, invitations or the audit log directly.
- Removing roles, suspending members and permanent account deletion will be added in the next admin slice with last-admin and self-removal guards.
