# Contact emails & notification preferences

## 1. Run SQL

Run the complete contents of:

`supabase/migrations/20261008190000_contact_and_notification_preferences.sql`

This adds verified personal/company contact slots, preferred delivery address and separate preferences for Events, Matching, Drop and General news. All optional notifications default to off. Account/security and membership-decision emails remain transactional and cannot be disabled here.

## 2. Add one Edge Function secret

Generate a long random value (at least 32 characters) and add it as:

```sh
supabase secrets set CONTACT_VERIFY_SECRET=YOUR_LONG_RANDOM_SECRET
```

Keep using the existing `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_REPLY_TO` and `SITE_URL` secrets.

## 3. Deploy

```sh
supabase functions deploy manage-contact-email
```

The function keeps normal JWT verification enabled. Verification codes expire after 15 minutes, are stored only as salted SHA-256 hashes and allow at most five failed attempts.
