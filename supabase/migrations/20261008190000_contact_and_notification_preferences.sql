-- Verified contact emails and granular notification preferences.

alter table public.profiles
  add column personal_email text check (personal_email is null or (personal_email = lower(btrim(personal_email)) and char_length(personal_email) between 3 and 320)),
  add column company_email text check (company_email is null or (company_email = lower(btrim(company_email)) and char_length(company_email) between 3 and 320)),
  add column preferred_contact_email text not null default 'account'
    check (preferred_contact_email in ('account', 'personal', 'company')),
  add column notify_events boolean not null default false,
  add column notify_matching boolean not null default false,
  add column notify_drop boolean not null default false;

create or replace function public.protect_contact_emails()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare candidate text;
begin
  foreach candidate in array array[new.personal_email, new.company_email] loop
    if candidate is null then continue; end if;
    perform pg_advisory_xact_lock(hashtext(candidate));
    if candidate = new.email
      or (new.personal_email is not null and new.company_email is not null and new.personal_email = new.company_email)
      or exists (
        select 1 from public.profiles p
        where p.id <> new.id
          and candidate in (p.email, p.personal_email, p.company_email)
      )
    then raise exception 'email is already in use';
    end if;
  end loop;
  return new;
end;
$$;

create trigger profiles_protect_contact_emails
before insert or update of personal_email, company_email on public.profiles
for each row execute function public.protect_contact_emails();

revoke all on function public.protect_contact_emails() from public, anon, authenticated;

create table public.contact_email_verifications (
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('personal', 'company')),
  email      text not null check (email = lower(btrim(email)) and char_length(email) between 3 and 320),
  code_hash  text not null,
  attempts   smallint not null default 0 check (attempts between 0 and 10),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind)
);

alter table public.contact_email_verifications enable row level security;
revoke all on public.contact_email_verifications from anon, authenticated;

create or replace function public.update_notification_preferences(
  p_preferred text,
  p_events boolean,
  p_matching boolean,
  p_drop boolean,
  p_news boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid());
begin
  if caller is null then raise exception 'not signed in'; end if;
  if p_preferred not in ('account', 'personal', 'company') then raise exception 'invalid preferred email'; end if;
  if p_preferred = 'personal' and not exists (select 1 from public.profiles where id = caller and personal_email is not null) then raise exception 'personal email is not verified'; end if;
  if p_preferred = 'company' and not exists (select 1 from public.profiles where id = caller and company_email is not null) then raise exception 'company email is not verified'; end if;

  update public.profiles
  set preferred_contact_email = p_preferred,
      notify_events = coalesce(p_events, false),
      notify_matching = coalesce(p_matching, false),
      notify_drop = coalesce(p_drop, false),
      marketing_consent = coalesce(p_news, false)
  where id = caller;
end;
$$;

create or replace function public.remove_contact_email(p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid());
begin
  if caller is null then raise exception 'not signed in'; end if;
  if p_kind = 'personal' then
    update public.profiles set personal_email = null, preferred_contact_email = case when preferred_contact_email = 'personal' then 'account' else preferred_contact_email end where id = caller;
  elsif p_kind = 'company' then
    update public.profiles set company_email = null, preferred_contact_email = case when preferred_contact_email = 'company' then 'account' else preferred_contact_email end where id = caller;
  else raise exception 'invalid email kind';
  end if;
  delete from public.contact_email_verifications where user_id = caller and kind = p_kind;
end;
$$;

revoke all on function public.update_notification_preferences(text, boolean, boolean, boolean, boolean) from public, anon;
revoke all on function public.remove_contact_email(text) from public, anon;
grant execute on function public.update_notification_preferences(text, boolean, boolean, boolean, boolean) to authenticated;
grant execute on function public.remove_contact_email(text) to authenticated;
