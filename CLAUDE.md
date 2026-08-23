# MarlonAvery.com — Cinematic Personal Platform

Astro 5 + Tailwind CSS v4 + TypeScript (strict). Static output is served by Cloudflare Workers
Assets; the private API is a separate service-bound Worker. Do not upgrade Astro past v5 or Vite past v6 without checking
`@tailwindcss/vite` type compatibility (`npm run check` must stay clean).

## Commands

- `npm run dev` — dev server
- `npm run build` — production build (must pass clean)
- `npm run check` — `astro check` type/diagnostic pass
- `npm run check:all` — Astro and both Cloudflare Workers
- `npm test` — migration/security contract tests
- `npm run process-photos` — downscale new photos from `public/images/*.png` into `src/assets/photos/`

## Architecture

- **Pages** (`src/pages/`): index, about, speaking, workshops (+ `[id]` detail), events, contact,
  projects (+ `[id]` detail), 404. All repeatable content comes from content collections — never
  hardcode a workshop, talk, event, or project into a component.
- **Collections** (`src/content.config.ts`): blog, projects, experience, narratives, speaking,
  workshops, events, press. Content lives in `src/content/<collection>/`.
- **Design tokens** (`src/styles/global.css`): Tailwind v4 `@theme` — palette (ink, graphite,
  charcoal, slate, mist, paper, cream + emerald/gold/terracotta accents), display type utilities
  (`text-display-xl/lg/md/sm`, `text-eyebrow`), `.reveal` scroll-reveal class. Fonts: Fraunces
  (display) + Inter (body), self-hosted via @fontsource.
- **Cinematic sequences**: `src/components/ScrollSequence.astro` scroll-scrubs the three Higgsfield
  hero clips registered in `src/data/heroClips.ts`. A `null` clip entry renders that section's
  static photographic fallback — set the entry once a clip is approved. Videos live in
  `public/video/` and every clip ships TWO renditions encoded from the `media-src/` master —
  desktop scrub: `ffmpeg -i in.mp4 -an -c:v libx264 -preset slow -crf 27 -g 12 -pix_fmt yuv420p -movflags +faststart out.mp4`
  (dense keyframes for seeking; keep clips ≲3.5 MB) and mobile `out-720.mp4`: same but
  `-vf "scale=-2:720" -crf 28 -g 48` (use `node -e "console.log(require('ffmpeg-static'))"` for
  the ffmpeg binary). ScrollSequence blob-prefetches the clip so scrolling never waits on the
  network; the first sequence on a page gets the `priority` prop (eager poster + immediate fetch).
- **Identity rule**: every AI-generated image/video of Marlon must use the curated Higgsfield
  identity element `marlon-avery-face` (id `d8da558a-1579-4180-9d64-61e17e55e201`, six tight
  face-forward photos) — embed `<<<d8da558a-1579-4180-9d64-61e17e55e201>>>` in the generation
  prompt AND describe him concretely (bald head, full black beard, signature tortoiseshell
  glasses). Do not use the older all-20-photos element (`a6daa1f7-…`) — it caused likeness
  drift. Settings: Seedance 2.0, mode std, 1080p, 16:9, no audio. Marlon approves likeness
  before integration.
- **Forms**: BookingForm / EnrollmentWizard compose `mailto:` submissions (static-host friendly).
  To capture server-side, point them at a Cloudflare Worker endpoint — payload shape is already
  structured.
- **Raw media**: `media-src/` holds original Higgsfield renders (not served); `public/press/` holds
  planner-facing downloads.

## Design rules

- Warmth over spectacle; no AI clichés (no glowing brains, no fake holograms) anywhere EXCEPT the
  three sanctioned cinematic hero sequences.
- Real photography only (`src/assets/photos/` — verified photos of Marlon).
- Every page ends with a clear next step (booking, workshop, or contact CTA).
- Reduced motion: every animation/scrub must have a `prefers-reduced-motion` fallback.
- Accessibility is non-negotiable: semantic HTML, keyboard-operable interactive components,
  focus-visible states, WCAG AA contrast.

## The "let's write" pathway

When Marlon says **"let's write"** (optionally pasting a Maverick brief from `/maverick`):

1. Read ALL files in `.claude/rules/` — `voice-reference.md` is mandatory; pick the matching style
   guide (`writing-blog-posts.md`, `writing-case-studies.md`, `writing-project-descriptions.md`).
2. Draft into the right collection (`src/content/blog/` for posts) with correct frontmatter,
   `draft: true` until Marlon approves.
3. The UI is already built: `/writing` lists non-draft posts; `/writing/[id]` renders them.
   Verify the rendered post in the preview before hand-off.
4. Marlon reviews → flip `draft: false` → ship through the branch flow (feature → staging → main).

## Theming

Light/dark toggle lives in the Nav; state on `<html data-theme>`, persisted in localStorage.
Dark theme remaps the semantic tokens (paper/cream/ink/slate/mist) in `global.css`. Surfaces that
must stay cinematic-dark in BOTH themes carry the `theme-fixed` class (hero films, `tone="dark"`
sections, footer, page heroes). Any new always-dark block needs `theme-fixed`.

## Booking flows

All booking/contact CTAs route to `/book` (deep-linkable via `?intent=keynote|workshop|podcast|
curriculum|learn|advisory|other`). Flows are data-driven in `src/data/bookingFlows.ts` — add a new
intent there and it appears automatically. Submissions POST to `/public/inquiry` on the Cloudflare
API Worker (Turnstile-verified, stored in Neon, then emailed via Resend), falling back to mailto if unreachable.
Wiring lives in `src/lib/backend.ts`.

## Maverick Command Center (/maverick)

Marlon's private daily-operations dashboard, built into the static site. Cloudflare Access with
Google protects `/maverick*` for `hi@marlonavery.com`; browser code calls the same-origin typed
API under `/maverick/api/*`. Neon is reached only by the API Worker through Hyperdrive. Structure:

- `src/layouts/MaverickLayout.astro` — noindex shell and section navigation; Access is the login boundary.
- `src/lib/maverick/client.ts` — typed same-origin API client and domain formatters.
  `src/lib/maverick/db-types.ts` mirrors the Neon schema and must be regenerated after migrations.
- Pages: `/maverick` (home: briefing, top 3, check-in), `/maverick/projects` (pillar-filtered
  CRUD + tasks), `/maverick/speaking` (engagement pipeline + revenue), `/maverick/growth`
  (affirmations), `/maverick/review` (weekly reviews), `/maverick/inquiries`, `/maverick/write`.
- AI actions run in `maverick-api` on Cloudflare. The Worker validates the Access assertion and
  exact owner email. OpenRouter is provided through Cloudflare Secrets Store; Workers AI provides embeddings.

**Approval guardrail (standing rule for Phases 2–3):** the agent NEVER sends email, touches
calendars, moves money, or contacts anyone externally on its own. Any future external action must
be enqueued to `approval_queue` and dispatched ONLY from a row with status `approved`, writing to
`audit_log` — enforce in the execution layer, not just UI. Phase 1 performs internal actions only
(briefings, affirmations, review drafts).

**Elevate is LIVE (2026-07-09) — the Growth page is now the Elevate coaching engine (goals,
validated affirmations, morning ritual, nightly adjustment loop). Read `docs/maverick-elevate.md`
before touching anything affirmation-related; the linguistic framework and observe-don't-judge
contract are hard rules. M4 (quadrant audits) not built.**

**Phase 2A is LIVE (2026-07-07); 2B/2C remain — read `docs/maverick-phase2.md` before touching.**
The /maverick home is Maverick chat (hybrid layout): SSE streaming from the API Worker
(via OpenRouter) with an INTERNAL-only tool loop — task/project/engagement/
revenue CRUD, vector-store memory (remember/recall), check-ins, snapshot — every execution
audit-logged. Memory: `maverick_memories` pgvector table (384-dimensional Workers AI embeddings)
+ `match_maverick_memories`. Morning briefing and memory/Elevate jobs run as Worker cron triggers.
`/maverick/approvals` records approve/reject decisions; **no dispatcher
exists yet** — 2B adds Gmail/Calendar reads + email send (needs Marlon's Google OAuth), 2C adds
Stripe invoicing + GitHub code_task handoff. External action contracts live in the spec doc.

## Content source

`/Users/marlonavery/Main-Marlon-Site/Marlon-Avery-2026` (Next.js 16) is the read-only content
source this site was ported from. Its `brain/` system and case-study generator scripts may be
ported later.
