# Elevate — AI Affirmation Coaching Engine (M1–M3 shipped 2026-07-09)

The Growth page (`/maverick/growth`) is Elevate: moves Marlon from **Place A** (where he is) to
**Place B** (where he says he wants to go) via the Intentional Development Model. Product loop:
**Assess → Observe → Affirm → Practice → Measure → Adjust.**

## Methodology contract (hard rules — baked into every prompt and behavior)

- Things happen **for** you — not to you. **Observe, don't judge**: feedback is observation +
  question, never a label.
- **Never name the villain.** If data points at a person or habit, create perspectives until the
  user says it first. Outcomes and feelings before people — the mirror before the microscope.
- **User's words > AI's words.** Goals, summaries, affirmations quote his phrasing.
- **No universal prescriptions.** Balance is personal and self-defined — never prescribe hours,
  limits, schedules.
- Calibrate to `commitment_level` (life_changing → direct challenge · sticking_point → lighter
  touch · exploring → progressive disclosure).
- Development coach, **not a therapist** — on crisis signals, pause coaching, suggest
  professional support.

## Affirmation linguistic framework (validated on every stored affirmation)

Present tense current state ("I am…") · "I am becoming…" permitted · first person, his own
version of life · forward-severing allowed ("no longer serves who I am becoming") · no judgment
or negation-of-negative · his vocabulary. Enforced by `validateAffirmation()` in
`supabase/functions/maverick-elevate/index.ts` (regex heuristics → one LLM rewrite → drop).

## Architecture

- **`maverick-elevate` edge function** (owner JWT or cron secret): `generate` (seed-then-shape,
  validator-gated, active set capped at 5), `adjust` (nightly signal loop), `resolve_event`
  (executes accepted proposals). Nightly cron `maverick-elevate-adjust` at `30 8 * * *` UTC
  (4:30 AM ET).
- **maverick-chat** carries the methodology in its system prompt + tools: `declare_goal`
  (asks "what is this worth to you?"), `capture_self_talk`, `generate_affirmations` (delegates
  to maverick-elevate server-to-server via the cron secret), `log_affirmation_checkin`.
- **Tables**: `goals`, `assessments` (quarterly, A→B delta), `influences` (M4),
  `self_talk_samples`, `affirmation_checkins` (morning/evening/weekly/…), `agent_events`
  (proposals), plus Elevate columns on `affirmations` (goal_id, target, version,
  parent_affirmation_id, status: active|reshaped|internalized|retired, user_seed_text).
- **UI**: Growth page = ritual card, destination, active set + resonance strip, "Elevate
  noticed" proposal cards (Accept/Dismiss), assessment form + delta bars, evening check-in,
  journey lineage. Home side rail = compact ritual + one-tap evening resonance.
  `/maverick?ask=…` prefills the chat composer for deep-linked coaching prompts.

## Signal table (adjust loop — events carry proposals; nothing changes without Accept)

| Signal | Detection | Proposal |
|---|---|---|
| resonance_decay | 7-day avg ≥0.5 below prior 7 (≥5 scores) | reshaped wording (new version, parent-linked) |
| graduation | classifier on notes, or "This feels true now" button | internalize + next-level affirmation |
| outgrown | ~30d of reads, zero behavior connection | replacement (old → retired) |
| stall | repeated pain point in notes | lesson-anchored affirmation |
| new_influence | person/media recurring in notes | log to `influences` for M4 audit |
| goal_drift | destination language shifting | confirm-direction prompt (revise in chat) |
| disengagement | >5 days silent | ONE observation-framed chat re-entry (references worth_statement if life_changing) |
| cadence_due | Sunday weekly · assessment >90d old | reflection / re-assessment reminders |

## Not built yet (M4) + product notes

- **Quadrant audits**: relationships reframing dialogues (separation technique), the algorithm
  audit, news triangulation, outgrown-influence re-checks. `influences` table is ready.
- Voice delivery/TTS, social features, human-coach handoff — out of scope per spec v1.
- **Multi-tenant later**: add `user_id` to the Elevate tables + swap the RLS predicate; schema
  is already spec-faithful for a standalone product.
