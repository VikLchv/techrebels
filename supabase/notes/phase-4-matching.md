# Phase 4 — matching: Supabase notes

## 1. Install the matching schema

Open **Supabase → SQL Editor → New query**, paste the complete contents of:

`supabase/migrations/20261008120000_matching.sql`

Run it once. A successful run ends with `Success. No rows returned`.

Do not run the draft or publish commands until the full migration succeeds.

## 2. Verify the installation

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('matching_rounds', 'matching_groups', 'matching_members')
order by table_name;

select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('generate_matching_draft', 'publish_matching_round', 'my_matches')
order by p.proname;
```

Expected: three tables and three functions.

## 3. Preview eligible members

Only members with matching consent and a name are included.

```sql
select p.id, p.full_name, p.email,
       cardinality(p.topics) as topics,
       cardinality(p.activities) as activities,
       cardinality(p.ambitions) as ambitions
from public.profiles p
where p.matching_consent and p.full_name is not null
order by p.created_at;
```

At least two eligible members are required.

## 4. Generate a private draft

```sql
select public.generate_matching_draft('Rebel Match 01', 5) as round_id;
```

`5` is the target squad size and may be changed to a value from 3 to 10. Copy the returned `round_id`.

The command creates both bug-buddy groups and squads. It does not show anything to members yet.

## 5. Review the draft

Replace `YOUR_ROUND_ID` with the UUID returned above.

```sql
select
  g.id as group_id,
  g.kind,
  g.label,
  g.approved,
  g.slack_url,
  p.full_name,
  p.email,
  mm.score
from public.matching_groups g
join public.matching_members mm on mm.group_id = g.id
join public.profiles p on p.id = mm.user_id
where g.round_id = 'YOUR_ROUND_ID'::uuid
order by g.kind, g.label, mm.score desc, p.full_name;
```

Higher scores mean more shared topics, ambitions and activities. A low score can still be a useful intentional contrast.

To move a person before publishing, use the group IDs from the review query:

```sql
update public.matching_members
set group_id = 'DESTINATION_GROUP_ID'::uuid
where group_id = 'CURRENT_GROUP_ID'::uuid
  and user_id = 'MEMBER_USER_ID'::uuid;
```

The primary key prevents the same person from being inserted twice into one group.

## 6. Add optional Slack links and approve groups

```sql
update public.matching_groups
set slack_url = 'https://YOUR-SLACK-LINK',
    approved = true
where id = 'GROUP_ID'::uuid;
```

Repeat for every group. A Slack link is optional; approval is required.

To approve all groups after reviewing them:

```sql
update public.matching_groups
set approved = true
where round_id = 'YOUR_ROUND_ID'::uuid;
```

## 7. Publish atomically

```sql
select public.publish_matching_round('YOUR_ROUND_ID'::uuid);
```

Publishing fails if any group is still unapproved. The previously published round, if any, is archived automatically. Members can then see only their own buddy and squad in `/inside`.

## Rollback before publishing

A draft is safe to delete and regenerate:

```sql
delete from public.matching_rounds
where id = 'YOUR_ROUND_ID'::uuid
  and status = 'draft';
```

Groups and memberships are deleted with it. Never delete a published round unless that is intentional.
