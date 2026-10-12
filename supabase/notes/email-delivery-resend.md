# Branded email delivery with Resend

## 1. Database

Run the complete contents of:

`supabase/migrations/20261008150000_email_delivery.sql`

It creates a private Storage bucket for inline bug cards and a server-only idempotency/delivery table. Plain passwords, reset tokens and Resend secrets are never stored there.

## 2. Resend and domain

1. Create a Resend account and add the final sending domain.
2. Add the SPF and DKIM records Resend provides to DNS.
3. Add a DMARC record, initially with reporting enabled; tighten the policy after delivery has been verified.
4. Create an API key limited to sending email.
5. Use a sender such as `techRebels <hello@techrebels.com>` or preferably a dedicated subdomain such as `techRebels <hello@mail.techrebels.com>`.
6. Disable open and click tracking for authentication and account-security emails.

## 3. Edge Function secrets

Copy `supabase/functions/.env.example` to a local secret file and fill in the real values. Never commit it.

```sh
supabase secrets set --env-file supabase/functions/.env
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are supplied to deployed Supabase Edge Functions automatically.

## 4. Deploy functions

```sh
supabase functions deploy send-auth-email --no-verify-jwt
supabase functions deploy send-community-email
supabase functions deploy manage-community
```

The auth function must use `--no-verify-jwt` because Supabase Auth authenticates it with a signed Standard Webhooks payload instead of a user JWT. The community function must keep JWT verification enabled.

## 5. Connect the Auth Hook

In **Supabase Dashboard → Authentication → Hooks**:

1. Add **Send Email**.
2. Choose HTTPS.
3. Enter `https://PROJECT-REF.supabase.co/functions/v1/send-auth-email`.
4. Generate the signing secret.
5. Put that exact secret into `SEND_EMAIL_HOOK_SECRET` and run `supabase secrets set` again.
6. Enable the hook and test signup plus password recovery.

When the hook is enabled it replaces Supabase's default auth mailer. The Email provider itself must stay enabled.

## 6. Emails implemented

- signup confirmation;
- password recovery and auth security messages;
- personal “BUG-#### is alive” email with the private bug card embedded via CID;
- application received;
- membership approved.

The browser renders the bug card and uploads it to the private `bug-email` bucket. Only its owner and the service-role email function can read it. Resend receives the image as an inline attachment; the pending bug is not made public.

`public.email_deliveries` prevents duplicate community emails. Delivery failures are visible with:

```sql
select p.email, d.kind, d.status, d.last_error, d.created_at, d.sent_at
from public.email_deliveries d
join public.profiles p on p.id = d.user_id
order by d.created_at desc;
```

## 7. Production checks

- test Gmail, Outlook and Apple Mail;
- send one fresh-account invitation and one existing-account invitation and confirm each recipient gets exactly one email;
- verify plain-text fallback and links;
- confirm that signup and reset links use only the production HTTPS URL;
- check SPF, DKIM and DMARC alignment;
- enable MFA on Resend, Supabase, registrar and hosting accounts;
- sign/accept Resend's DPA and list Resend in the Privacy notice;
- configure a Resend webhook for delivered, bounced and complained events before a larger launch.
