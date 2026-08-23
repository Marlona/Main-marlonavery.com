# MarlonAvery.com

The cinematic personal platform of **Marlon Avery** — Applied AI executive, engineer, founder,
educator, and speaker. *Building AI. Teaching the Future.*

A scroll-driven, film-like experience built on Astro 5, where three Higgsfield-generated hero
sequences of Marlon are scrubbed by the visitor's scroll — anchored by real photography, real
projects, and real workshop content.

## Stack

- [Astro 5](https://astro.build) + Content Collections (all content is data, not hardcoded)
- Tailwind CSS v4 (design tokens in `src/styles/global.css`)
- TypeScript (strict), zero client frameworks — a few small vanilla scripts
- Cloudflare Workers Assets for the website, plus a service-bound API Worker
- Neon Postgres through Cloudflare Hyperdrive; R2 for large media; Workers AI for embeddings
- Cloudflare Access with Google for the private Maverick command center

## Quick start

```sh
npm install
npm run dev        # local dev server
npm run check      # astro type/diagnostic check
npm run check:all  # application + both Workers
npm test           # migration/security contract tests
npm run build      # production build → dist/
```

## Deployment flow

- Production deploys are manually gated through `.github/workflows/deploy.yml` while migration acceptance is in progress.
- PRs run CI; pushes to `staging` deploy the isolated `marlonavery-web-staging` and `maverick-api-staging` Workers.
- Production and staging have distinct Neon branches, Hyperdrive configurations, R2 buckets, Access applications, and secrets.
- Feature branches open PRs into `staging`, then promote `staging` into `main`.
- **Always cut feature branches from `staging`, never from `main`.**
- **Promotion PRs (`staging` → `main`) must use "Create a merge commit", never squash.** Squashing
  gives `main` history `staging` doesn't share, so every later PR sees shared files as "added on
  both sides" and conflicts. (Feature PRs into `staging` may still be squashed.) If a promotion
  already conflicts, fix with `git merge -s ours origin/main` on `staging` — it absorbs `main`'s
  history while keeping `staging`'s tree byte-identical.

## Cloudflare migration

Infrastructure source lives under `workers/`. The web Worker serves Astro assets and forwards
`/maverick/api/*` and `/public/inquiry` to the API Worker over a service binding. Production DNS
cutover remains gated until the checklist in `docs/cloudflare-migration.md` passes. Do not deploy
from the Cloudflare dashboard or retire the legacy database before that checklist is complete.

## Editing content

Add or edit files under `src/content/` — no component changes needed:

| Collection   | Format | Powers                                   |
| ------------ | ------ | ---------------------------------------- |
| `speaking`   | JSON   | Keynote topics on /speaking               |
| `workshops`  | JSON   | Workshop catalog, detail pages, wizard    |
| `events`     | JSON   | /events upcoming + archive, home preview  |
| `projects`   | MDX    | /projects case studies, home features     |
| `experience` | JSON   | About-page timeline                       |
| `press`      | JSON   | Planner resources on /speaking            |
| `blog`       | MDX    | /writing posts (drafted via "let's write") |

`/maverick` is Marlon's private command center (login required): daily briefing, projects & tasks,
speaking pipeline & revenue, affirmations, weekly reviews, and site inquiries — see `CLAUDE.md`.

## Cinematic sequences

The three hero clips live in `public/video/` and are registered in `src/data/heroClips.ts`.
See `CLAUDE.md` for the generation identity rule and the required ffmpeg encode settings
(dense keyframes for scroll-seeking). Reduced-motion visitors get poster frames instead.

## Lighthouse (production build)

Performance 99–100 · Accessibility 100 · Best Practices 100 · SEO 100
