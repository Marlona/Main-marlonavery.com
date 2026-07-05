# MarlonAvery.com — Cinematic Personal Platform

Astro 5 + Tailwind CSS v4 + TypeScript (strict). Static output, deployed to GitHub Pages via
`.github/workflows/deploy.yml`. Do not upgrade Astro past v5 or Vite past v6 without checking
`@tailwindcss/vite` type compatibility (`npm run check` must stay clean).

## Commands

- `npm run dev` — dev server
- `npm run build` — production build (must pass clean)
- `npm run check` — `astro check` type/diagnostic pass
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
  `public/video/` and MUST be encoded with dense keyframes for seeking:
  `ffmpeg -i in.mp4 -an -c:v libx264 -preset slow -crf 23 -g 12 -pix_fmt yuv420p -movflags +faststart out.mp4`
  (use `node -e "console.log(require('ffmpeg-static'))"` for the ffmpeg binary).
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

## Content source

`/Users/marlonavery/Main-Marlon-Site/Marlon-Avery-2026` (Next.js 16) is the read-only content
source this site was ported from. Its `brain/` system and case-study generator scripts may be
ported later.
