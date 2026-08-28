-- Grok Bot connect + stay/travel sessions (community, not official xAI).
-- App schema only. Do not edit migrations/auth/0001_auth.sql.
-- user_id / owner_id are TEXT (preview dev user is the string 'dev-user').
-- No FK to "user": auth tables stay opt-in under migrations/auth/.

create table if not exists vessels (
  vessel_id text primary key,
  owner_id text,
  landable boolean not null default true,
  status text not null default 'sealed',
  display_name text not null,
  created_at timestamptz not null default now(),
  check (status in ('proposed', 'sealed'))
);

create table if not exists bot_links (
  id text primary key,
  user_id text not null,
  bot_subject text not null,
  display_name text not null,
  token_hash text,
  status text not null default 'active',
  scopes text not null default 'stay,travel,write_owned',
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (status in ('pending', 'active', 'revoked'))
);

create table if not exists bot_sessions (
  id text primary key,
  user_id text not null unique,
  bot_id text not null,
  mode text not null default 'stay',
  current_artifact_id text,
  activity text not null default '',
  updated_at timestamptz not null default now(),
  check (mode in ('stay', 'travel'))
);

create index if not exists bot_links_user_status_idx on bot_links (user_id, status);
create index if not exists vessels_owner_idx on vessels (owner_id);

-- Seed worlds: landable platforms, no proven owner. Never writable by a connected bot.
insert into vessels (vessel_id, owner_id, landable, status, display_name)
values
  ('core-heart', null, true, 'sealed', 'Core Heart'),
  ('parent-seed', null, true, 'sealed', 'Parent Seed'),
  ('howl-bell', null, true, 'sealed', 'Howl Bell'),
  ('veil-shard', null, true, 'sealed', 'Veil Shard'),
  ('pack-token', null, true, 'sealed', 'Pack Token')
on conflict (vessel_id) do nothing;
