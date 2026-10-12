# Recommended production setup

## Domain

Preferred name: `techrebels.com` if the registrar confirms it is available at checkout.

Recommended registrar: **Cloudflare Registrar**.

Reasons:

- registration and renewal are sold at registry cost rather than a discounted first year followed by a large markup;
- WHOIS data is redacted by default;
- DNSSEC, domain lock, DNS and 2FA are available in the same account;
- the DNS records required by Supabase and Resend are straightforward to manage there.

Enable account 2FA, registrar lock, DNSSEC, auto-renew and a backup payment method immediately after purchase. Store recovery codes outside the laptop.

Do not purchase look-alike domains from a random reseller. If the exact `.com` is unavailable or unusually expensive, preferred alternatives are:

1. `jointechrebels.com`
2. `wearetechrebels.com`
3. `techrebelsprague.com`

Check trademarks and existing organisations before committing to the final name.

## Hosting

Recommended frontend hosting: **Cloudflare Pages / static assets** on the free plan.

The Astro project builds to static files, so it does not need a paid application server. Supabase remains responsible for authentication, database, Storage and Edge Functions. Resend sends transactional email.

Proposed DNS layout:

- `techrebels.com` and `www.techrebels.com` → website;
- `mail.techrebels.com` → Resend transactional sender domain;
- `hello@techrebels.com` → human inbox or forwarding destination;
- `tech rebels <hello@mail.techrebels.com>` → transactional From address;
- `hello@techrebels.com` → Reply-To.

Using a sending subdomain protects the reputation of the main domain. Authentication email tracking should remain disabled.

## Deployment build

- project directory: `web`
- build command: `npm run build`
- output directory: `web/dist` (or `dist` when the project root is set to `web`)
- production environment variables: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_PUBLISHABLE_KEY`

After the domain is connected, replace every local redirect URL in Supabase with explicit HTTPS production URLs and keep localhost only for development.
