---
paths:
  - "src/content/projects/**"
---

# Project Description Style Guide — Marlon Avery

Consult this guide AND `.claude/rules/voice-reference.md` when writing or editing project descriptions. These are hard requirements.

## Structure

Every project description follows this arc:

1. **Problem** — Why this project exists. What was broken, missing, or frustrating for real people.
2. **Approach** — Design philosophy with subsections named by **concept/principle**, not technology/component.
3. **What It Changed** — Outcomes for the people it serves, plus what was learned building it.

## Opening Types

Choose one per project. Each must be grounded and specific.

### Human Friction
Start with the person the system serves and what their day looked like before.

**DO**: "A neuroscience office's front desk was drowning: every missed call was a patient who didn't get scheduled."

### System Problem
Start with a structural gap.

**DO**: "Public libraries are the most democratic classrooms in America — but nobody was bringing AI education through their doors."

**DON'T** (for any opening type): "This project is a..." / "I built a tool that..." / "In the world of modern AI..."

## Subsection Naming

Name sections by **design principle or concept**, not by technology or component.

**DO**: "The Monday Test", "Escalation as a Feature", "No Prior Tech Knowledge Required"
**DON'T**: "Backend Architecture", "Tech Stack", "Implementation Details"

## Surface the Actual Hard Part

Every project has a part that was harder than expected. Name it — it's what makes descriptions memorable.

**DO**: "HIPAA wasn't the hard part. The hard part was making the agent know when NOT to answer."
**DON'T**: Describing only the clean architecture without acknowledging where reality was messy.

## Tradeoff Transparency

Be explicit about what was traded away and why it was acceptable.

**DO**: "The agent escalates aggressively. We accept more human handoffs in exchange for never improvising a medical answer."

## Frontmatter Requirements

Follow the existing schema in `src/content.config.ts` (projects collection). Key expectations:

- `impactSummary` — 1-2 sentences with the strongest real numbers available.
- `outcomes` — measurable results (Marlon's own ventures can be specific: "60% improvement in patient communication response times").
- `contributions` — what Marlon actually did, in shipping verbs.
- `featured: true` only for the work that belongs on the home page.
- `videoUrl` — when a project has a highlight video, add it; the card renders a "Watch video" button automatically.

## Voice in Project Descriptions

More first-person than blog posts, more transparent about tradeoffs. The tone is "here's what I built and why I made these choices" — not prescriptive, not promotional. Authority comes from the outcomes, not adjectives.
