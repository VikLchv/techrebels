-- Transactional email support. Bug cards remain private and are only read by
-- the service-role Edge Function when composing an email.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bug-email', 'bug-email', false, 3145728, array['image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "bug email: upload own card"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'bug-email'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "bug email: update own card"
on storage.objects for update to authenticated
using (
  bucket_id = 'bug-email'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'bug-email'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "bug email: read own card"
on storage.objects for select to authenticated
using (
  bucket_id = 'bug-email'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create table public.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('welcome', 'application_received', 'membership_approved')),
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  provider_id text,
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (user_id, kind)
);

alter table public.email_deliveries enable row level security;
revoke all on public.email_deliveries from public, anon, authenticated;

comment on table public.email_deliveries is
  'Server-only idempotency and delivery audit for transactional community emails.';
