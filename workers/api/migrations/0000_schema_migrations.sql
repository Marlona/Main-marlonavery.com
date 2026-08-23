-- Baseline marker for the production schema recovered on 2026-08-23.
-- This migration is additive and does not modify existing Maverick rows.
create table if not exists public.maverick_schema_migrations (
  version text primary key,
  description text not null,
  checksum text not null,
  applied_at timestamptz not null default now()
);

insert into public.maverick_schema_migrations (version, description, checksum)
values ('0000', 'Recovered Cloudflare Worker and 25-table Neon baseline', 'repository-baseline-2026-08-23')
on conflict (version) do nothing;
