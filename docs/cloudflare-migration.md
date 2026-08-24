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

- Distinct production and staging Turnstile widget secrets and public site keys.
- A distinct staging `OPENROUTER_KEY` Worker secret; staging never receives the production Secrets Store binding.
- `RESEND_API_KEY` on both API Workers, using a verified `inquiries@marlonavery.com` sender.
- GitHub `production` and `staging` environment secret `CLOUDFLARE_API_TOKEN`.
- `CLOUDFLARE_ACCOUNT_ID` is already set in both GitHub environments; production is restricted
  to `main` and staging is restricted to `staging`.
- GitHub environment variable `PUBLIC_TURNSTILE_SITE_KEY`, distinct in each environment.
- A read-only legacy Postgres connection for final reconciliation.

Cloudflare Access uses the `Maverick Google` identity provider. The production application
protects `marlonavery.com/maverick*`; the staging application protects the entire
`staging.marlonavery.com` hostname. Both allow only `hi@marlonavery.com`, require the Google
login method, redirect directly to that provider, and use distinct audience IDs committed in the
API Worker environment configuration.

## Data baseline

Before reconciliation, the 25-table legacy export contained 236 rows and production Neon
contained 237 rows. The staging schema was inspected directly and matches the explicit
table/column allowlist in `workers/api/src/db.ts`.

The repository-owned staging workflow deployed commit `a593bca` successfully. Live Worker
settings confirm `maverick-api-staging` is bound only to staging Hyperdrive
`1f606da636374d0597b46feda008ea3a` and `marlonavery-media-staging`; the web Worker reaches that
API through a service binding. The staging custom domain replaced its former GitHub Pages CNAME,
and the isolated R2 bucket contains all eight configured video objects.

`workers/api/migrations/0000_schema_migrations.sql` adds only migration tracking. Apply it to
staging first, verify, then apply to production after a Neon restore point has been recorded.

Marker `0000` is now present on both staging and production, and production still reports all 25
application tables. Restore branch `pre-cloudflare-cutover-2026-08-23`
(`br-dawn-boat-awc970dp`) was created directly from production before the marker was applied.
Production branch protection remains unavailable while the Neon project is on the Free plan;
Neon's protected-branch control requires a paid plan.

The final 2026-08-23 legacy export is retained outside the repository with restrictive file
permissions. Its data archive SHA-256 is
`b84c315850e47dd99cdb4ab17d2614395a6c40a114c4d6c0b94d2ed07bae079f`; its schema archive
SHA-256 is `10c7ef88f54d633dae5eacf48158801bdf8c31e6cb60a2e1440360614a678a63`.

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

The 2026-08-23 dry run found 192 legacy primary keys missing from Neon, 193 Neon-only primary
keys, no legacy-newer mutable rows, and five same-key digest differences. Four differences were
the JSON-versus-pgvector representation of existing memory embeddings; Neon remained
authoritative for those vectors. The remaining difference was an Elevate vision path pointing
to a nonexistent PNG in Neon while the legacy bucket contained the real JPEG.

The real JPEG was copied to the same R2 key in both environments. The full delta was then tested
on a disposable Neon branch and applied to production as one transaction: all 192 missing rows
were inserted and the vision path was corrected to the JPEG. The post-apply audit reports 429
rows, zero missing legacy primary keys, zero unresolved exceptions, all 193 Neon-only records
preserved, and all four Neon pgvector embeddings preserved. The disposable test branch was
deleted after verification; the production restore branch remains available.

## Staging acceptance status

The live staging deployment has passed the following checks:

- The entire hostname rejects anonymous requests and forged Access assertions.
- The approved Google identity reaches every Maverick page through Access.
- All eight Maverick pages load their real staging data without a client or API error.
- A temporary project completed a create, counted/read-back, update, and delete cycle through the
  UI, same-origin API, Hyperdrive, and the staging Neon branch. The record was removed afterward.
- A temporary memory completed remember, Workers AI embedding, Neon pgvector similarity recall,
  and forget/delete. Semantic search returned the record and the staging memory count returned
  to its original value after cleanup.
- The staging API and web Workers have `workers.dev` and preview URLs disabled. The API is
  reachable only through the web Worker's service binding.
- The two legacy staging `/api/*` and `/public/*` routes that still targeted the production API
  Worker were removed. No zone-level Worker route remains on the staging hostname, and the
  Access-protected dashboard was rechecked successfully after removal.
- The staging Turnstile widget is restricted to localhost and the staging hostname, its secret is
  installed as an encrypted Worker binding, and the public site key is supplied by the staging
  GitHub environment. The official metadata/secret validator passed, including a dummy-token
  Siteverify check, and the repository deployment rendered the expected site key on the live form.
- The staging deploy resynced `public/video/*` to the isolated R2 bucket. The live R2-backed
  `hero-main.mp4` reached ready state with its expected 8.04-second duration and 1664x1248 frame.
- The exact PR head passes Astro diagnostics, Worker type-checking, all 20 tests, the Workers
  Assets build, and a source/build scan with no legacy client, project URL, or runtime reference.

Chat, Elevate mutation, manual schedule, and the remaining live media-range cases remain pending
until a distinct staging OpenRouter secret is installed. The real inquiry submission and token
replay check are ready but not yet recorded as passed. Inquiry notification delivery also remains
pending. Deployment workflows now fail before publishing when their environment-specific public
Turnstile site key is empty.

## Cutover checklist

The web Worker custom domains are declared in `workers/web/wrangler.jsonc`. Cloudflare cannot
create them while the same hostnames still have GitHub Pages CNAME records. Remove the staging
CNAME immediately before the first staging deployment; remove the apex GitHub Pages records and
the `www` CNAME only inside the approved production cutover window.

- [x] Recover the deployed API implementation into the repository.
- [x] Replace browser database/auth calls with the same-origin typed API client.
- [x] Add explicit table/column/filter allowlists and equality-constrained mutations.
- [x] Preserve chat, memory, Elevate, snapshots, tasks, goals, media, and scheduled handlers.
- [x] Create isolated Neon staging branch, Hyperdrive, and R2 bucket.
- [x] Add repository-only production/staging deployment workflows.
- [x] Add Turnstile client and canonical server-side Siteverify integration.
- [x] Remove the legacy JavaScript client, edge-function sources, Pages CNAME, and Pages workflow.
- [x] Apply and verify schema-version tracking on staging, then production.
- [x] Configure Google as the Access identity provider.
- [x] Create production and staging Access applications and replace both audience placeholders.
- [ ] Complete Turnstile rollout: staging is fully configured and validated; install the
  already-created production widget secret during the production cutover.
- [ ] Configure and validate Resend without making email delivery authoritative.
- [ ] Upload `public/video/*` objects to both R2 buckets and verify byte ranges/content types.
- [x] Deploy staging from the repository and attach `staging.marlonavery.com`.
- [x] Protect the entire staging hostname with Access.
- [ ] Run every CRUD, chat, memory, Elevate, media, inquiry, and manual-schedule acceptance test.
- [x] Confirm staging cannot access production Neon or R2.
- [x] Export legacy schema/data and create a Neon production restore point.
- [x] Run dry-run and applied delta reconciliation with zero unresolved conflicts.
- [ ] Put the legacy Maverick UI into brief read-only mode and run the final delta.
- [ ] Deploy production Workers and attach the apex/www domains.
- [x] Protect `/maverick*`; verify missing Access assertions now and validate invalid, expired, and valid assertions during cutover testing.
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
