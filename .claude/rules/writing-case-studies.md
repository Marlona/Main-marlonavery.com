---
paths:
  - "src/content/narratives/**"
  - "src/content/projects/*jpmorgan*"
---

# Strategic Case Study Style Guide — Marlon Avery

Consult this guide AND `.claude/rules/voice-reference.md` when writing or editing strategic case studies (employer work, confidential projects). These are hard requirements.

## Pre-Publish Checklist

Every employer/strategic case study must pass this check before commit:

1. **`confidential: true`** in frontmatter for any JPMorgan Chase work.
2. **No exact financials.** No `$N`, no `N-figure`. Use "multi-million dollar" or "significant annual savings".
3. **No exact scale numbers tied to the employer.** Use "hyperscale", "large-scale", "enterprise-wide".
4. **No internal names or org structure.** No internal system codenames, exec titles, or team structures. Use "the platform team" / "partner teams".
5. **Decision card present** with at least one rejected alternative and honest reasoning.
6. **Marlon's own ventures are exempt from vagueness.** VoicePath, AImpact, NextSteps DevCon metrics (60% response-time improvement, 10,000+ trained, 10,000+ scholarships) are Marlon's to share — be specific there.

## Structure

Every strategic case study follows this arc:

1. **Context** — What existed when the work began. Frame the problem as systemic, not heroic.
2. **Decision Framework** — What options were considered, what was chosen, and why. Show rejected alternatives with reasoning.
3. **Execution** — What was actually done, including course corrections. Not just the happy path.
4. **Reflection** — Specific, actionable principles learned. Not generic platitudes.

### Narrative Arc: Before/After, Not Crisis/Hero

Frame the work as improving a system, not rescuing one.

**DO**: "When the voice pipeline moved from pilot to production, the escalation patterns that worked for ten calls a day stopped working at a hundred."
**DON'T**: "The system was in crisis and desperately needed fixing."

## Decision Cards

Every strategic case study MUST include a `decisionCard` in frontmatter with:
- `problem`: What needed solving (specific, not vague)
- `constraints`: Hard boundaries that shaped the decision
- `tradeoffs`: At least 2-3 options, each with pros/cons, one marked `chosen: true`

Show rejected alternatives with honest reasoning. Only presenting the chosen option looks like post-hoc justification.

## Course Corrections

Every case study should include at least one moment where the approach was adjusted. Real production work always involves discovering you were wrong about something.

## Key Learnings Quality Bar

Closing principles must be **specific to this work**, not generic advice.

**DO**: "HIPAA compliance isn't a checklist at the end — it's an architecture decision at the start. The Veradigm integration only shipped in weeks because the audit trail was designed in from day one."
**DON'T**: "Compliance is important in healthcare." (Could apply to anything.)

## Voice Consistency

Strategic case studies keep Marlon's teaching instinct but hold a **reflective, matter-of-fact** register:
- Present tense for principles, past tense for actions
- First person for ownership ("I designed," "I led")
- Objective framing for outcomes ("response times improved 60%")
- Pop-culture hooks are for blog posts; case studies open with the operational moment instead.
