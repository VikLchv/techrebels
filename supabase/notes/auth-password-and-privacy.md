# Password auth and privacy — setup notes

No SQL migration is required for this change. Passwords live only in Supabase Auth and must never be copied into `public.profiles` or any application table.

## Supabase Dashboard settings

In **Authentication → Sign In / Providers → Email**:

- keep Email provider enabled;
- require email confirmation;
- set minimum password length to **12**;
- require lowercase, uppercase, numbers and symbols;
- enable leaked-password protection if the project is on Supabase Pro;
- enable password-changed security notifications;
- keep refresh-token rotation enabled.

The website no longer calls `signInWithOtp`; login uses `signInWithPassword`. If your Supabase project exposes a separate **Magic Link enabled** setting, turn it off as well. Password recovery must stay enabled because it is how existing magic-link users set their first password.

In **Authentication → URL Configuration**, add both local and production redirect URLs:

- `http://127.0.0.1:4321/lab`
- `http://127.0.0.1:4321/reset-password`
- `https://YOUR-DOMAIN/lab`
- `https://YOUR-DOMAIN/reset-password`

Set the production Site URL to the final HTTPS domain. Do not use wildcard production redirects.

## Email delivery

Email confirmation and password reset both need reliable SMTP. Supabase's default sender is for testing and is heavily restricted. Before launch, connect the planned transactional email provider and configure the **Confirm signup**, **Reset password** and **Password changed** templates.

## Abuse protection before launch

- enable Supabase CAPTCHA with Cloudflare Turnstile (free tier is suitable here);
- review Auth rate limits for signup, token and reset requests;
- use HTTPS only in production;
- enable MFA for every admin account;
- do not share admin accounts;
- periodically review the `admins` table and Supabase Auth logs.

## Existing account migration

Accounts previously created with magic links are preserved. Each existing user should open `/forgot-password`, request a reset link and choose a password. No database row or membership status changes.

## GDPR launch blockers

Complete these before publishing the Privacy page as final:

1. Replace the controller name, registered address, company/registration number and privacy email.
2. Choose and document real retention periods for rejected applications, deleted members, logs and marketing contacts.
3. List the final hosting, SMTP and analytics processors, their processing locations and transfer safeguards.
4. Sign/accept the relevant data-processing agreements and keep a processing record.
5. Self-host web fonts or document the external font providers and legal basis. Self-hosting is preferable.
6. Have the final notice and legal bases reviewed for the actual Czech entity and operating model.
