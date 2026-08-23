# Maverick Cloudflare migration runbook

Last audited: 2026-08-23

## Architecture

```text
Browser
  -> marlonavery-web (Workers Assets)
       -> static Astro assets
       -> /video/* -> environment R2 bucket
       -> /public/inquiry -> API service binding
       -> /maverick/api/* -> API service binding
  -> maverick-api
       -> Cloudflare Access JWT validation for private routes
       -> Hyperdrive -> Neon Postgres + pgvector
       -> Workers AI embeddings
       -> R2 private media
       -> OpenRouter through Secrets Store
```

The API Worker has no public hostname in the target design. All browser calls are same-origin and
reach it through the web Worker's `API` service binding.

## Environment inventory

| Resource | Production | Staging |
| --- | --- | --- |
| Web Worker | `marlonavery-web` | `marlonavery-web-staging` |
| API Worker | `maverick-api` | `maverick-api-staging` |
| Neon project | `still-term-73465888` | same project, isolated branch |
| Neon branch | `br-proud-star-awjwjsb6` | `br-muddy-wind-awby9o2x` |
| Hyperdrive | `6bd6d0943a4b4bb6953645198b376470` | `1f606da636374d0597b46feda008ea3a` |
| R2 | `marlonavery-media` | `marlonavery-media-staging` |
| Cron triggers | 08:00, 08:30, 11:00 UTC | none |

The staging Hyperdrive has SQL caching disabled and a five-connection ceiling. Staging has no
scheduled triggers, so scheduled handlers must be invoked manually during acceptance testing.

## Repository source of truth

- `workers/api/src/` contains maintained API/auth/data/inquiry code.
- `workers/api/baseline/deployed-2026-08-23.js` is the recovered production behavior snapshot.
- `workers/api/wrangler.jsonc` owns API bindings and schedules.
- `workers/web/` owns Workers Assets, service binding, canonical redirect, and R2 media routing.
- `.github/workflows/` is the only approved deployment path.
- Production workflow dispatch remains manual until this runbook is fully green.

Never deploy a hand-edited Worker from the Cloudflare dashboard.

## Required configuration still outside the repository

These values are intentionally not committed:

- Cloudflare Access Google identity provider OAuth client ID and client secret.
- A separate Access application/audience for production and staging.
- Distinct production and staging Turnstile widget secrets and public site keys.
- A distinct staging `OPENROUTER_KEY` Worker secret; staging never receives the production Secrets Store binding.
- `RESEND_API_KEY` on both API Workers, using a verified `inquiries@marlonavery.com` sender.
- GitHub `production` and `staging` environment secret `CLOUDFLARE_API_TOKEN`.
- `CLOUDFLARE_ACCOUNT_ID` is already set in both GitHub environments; production is restricted
  to `main` and staging is restricted to `staging`.
- GitHub environment variable `PUBLIC_TURNSTILE_SITE_KEY`, distinct in each environment.
- A read-only legacy Postgres connection for final reconciliation.

Until Access applications exist, `ACCESS_AUD` deliberately remains
`PENDING_ACCESS_APPLICATION`; private API requests fail closed.

## Data baseline

The 25 production and staging tables had matching exact row counts at the 2026-08-23 audit: 233
rows total. The staging schema was inspected directly and matches the explicit table/column
allowlist in `workers/api/src/db.ts`.

`workers/api/migrations/0000_schema_migrations.sql` adds only migration tracking. Apply it to
staging first, verify, then apply to production after a Neon restore point has been recorded.

## Reconciliation

Run the comparison with a read-only legacy connection first:

```sh
SOURCE_DATABASE_URL='…' TARGET_DATABASE_URL='…' npm run reconcile:dry-run
```

The script compares schema, primary keys, exact row counts, and stable SHA-256 field digests for
all 25 tables. It writes `reconciliation-report.json` with mode `0600`, never deletes data, and
defaults to a dry run. Missing primary keys are insert-only. Tables with reliable `updated_at`
timestamps update only when the legacy record is newer. All other differences preserve Neon and
are emitted as conflicts. Any conflict exits non-zero. Apply mode runs as one transaction and
rolls back the entire delta if a conflict or database error occurs.

Only after the dry-run report is reviewed and a restore point exists:

```sh
RECONCILE_APPLY=1 RECONCILE_TARGET_HOST='exact-neon-hostname' \
  SOURCE_DATABASE_URL='…' TARGET_DATABASE_URL='…' npm run reconcile:dry-run
```

Run a second dry run immediately afterward and archive both reports with the final export.

## Cutover checklist

- [x] Recover the deployed API implementation into the repository.
- [x] Replace browser database/auth calls with the same-origin typed API client.
- [x] Add explicit table/column/filter allowlists and equality-constrained mutations.
- [x] Preserve chat, memory, Elevate, snapshots, tasks, goals, media, and scheduled handlers.
- [x] Create isolated Neon staging branch, Hyperdrive, and R2 bucket.
- [x] Add repository-only production/staging deployment workflows.
- [x] Add Turnstile client and canonical server-side Siteverify integration.
- [x] Remove the legacy JavaScript client, edge-function sources, Pages CNAME, and Pages workflow.
- [ ] Apply and verify schema-version tracking on staging, then production.
- [ ] Configure Google as the Access identity provider.
- [ ] Create production and staging Access applications and replace both audience placeholders.
- [ ] Create distinct Turnstile widgets, save Worker secrets, and set GitHub public-site-key variables.
- [ ] Configure and validate Resend without making email delivery authoritative.
- [ ] Upload `public/video/*` objects to both R2 buckets and verify byte ranges/content types.
- [ ] Deploy staging from the repository and attach `staging.marlonavery.com`.
- [ ] Protect the entire staging hostname with Access.
- [ ] Run every CRUD, chat, memory, Elevate, media, inquiry, and manual-schedule acceptance test.
- [ ] Confirm staging cannot access production Neon or R2.
- [ ] Export legacy schema/data and create a Neon production restore point.
- [ ] Run dry-run and applied delta reconciliation with zero unresolved conflicts.
- [ ] Put the legacy Maverick UI into brief read-only mode and run the final delta.
- [ ] Deploy production Workers and attach the apex/www domains.
- [ ] Protect `/maverick*`; verify missing, invalid, expired, and valid Access assertions.
- [ ] Verify Workers Assets is the origin and no legacy database or Pages traffic remains.
- [ ] Reopen writes, monitor production cron audit events, and retain the prior Worker version.
- [ ] Make the legacy project read-only and retain its export for 30 days.

Deletion of the legacy project is never part of the cutover deployment. It requires a clean
30-day audit and separate explicit approval.

## Rollback

1. Roll back `maverick-api` and `marlonavery-web` to their prior Cloudflare versions.
2. Restore the previous DNS origin if the web Worker is unhealthy.
3. Keep the legacy system read-only unless a database rollback is explicitly approved.
4. Use the Neon restore point only for a confirmed data integrity failure; do not use it for an
   application-only rollback.
