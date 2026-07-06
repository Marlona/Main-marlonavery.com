---
paths:
  - "src/content/blog/**"
---

# Blog Post Style Guide — Marlon Avery

Consult this guide AND `.claude/rules/voice-reference.md` when writing or editing blog posts. These are hard requirements.

## Pre-Publish Checklist

Before flipping `draft: false`, every blog post must pass this check:

1. **Disclaimer present** when the post touches employer-adjacent topics. First or second paragraph contains: *"The views expressed here are my own and do not represent those of any current or former employer."*
2. **Employer generalized.** No "JPMorgan Chase" in the body of employer-adjacent posts. Use "one of the world's largest financial institutions" or "a global bank."
3. **No confidential specifics.** No internal system names, exact employer metrics, org structure, exec titles, or team sizes from the day job. VoicePath/AImpact/NextSteps work is Marlon's own — it can be specific.
4. **Voice check.** Read the opening out loud. If it sounds like a lecture instead of a conversation, rewrite it.

## Structure

Every blog post follows this arc:

1. **Narrative hook** (1-3 paragraphs) — An everyday-life or pop-culture moment that grounds the reader. Not a thesis statement. Not "In this article..."
2. **Progressive deepening** — Move from the hook to the AI angle to the practical application. Each section goes deeper, not wider.
3. **Human close** — End on the people the technology helps, a question for the reader, or a warm send-off. Never summarize. Never recap. Sign off as **MA**.

### Section Headings

Headings are **declarative and can carry personality**. Playful headers are on-brand.

**DO**: "The Monday Test", "Voice Is No Longer a Demo", "EXAMPLE - BIG ONE!"
**DON'T**: "Introduction", "Conclusion", "How Does It Work?"

### Reading Time

Target **4-7 minutes** (900-1,600 words). Accessible beats exhaustive — Marlon's readers are busy professionals, not engineers settling in for a deep dive.

## Quality Gates

### Show It In Action

Every conceptual claim needs a **concrete anchor**. If you describe a workflow, show the prompt or the before/after. If you name a technology, show what it actually does for a real business.

**DO**: "A demand-prediction system uses computer vision to estimate foot traffic. Combined with historical sales data, it predicts which menu items to prep."
**DON'T**: "AI will transform restaurant operations."

### Precision Over Impression

Be precise about what works today versus what's coming. Marlon's credibility comes from shipping — don't let the writing overpromise what the systems underdeliver.

**DO**: "Voice agents handle the front desk today. They don't handle an angry customer with a billing dispute — yet. Design the handoff."
**DON'T**: "AI can now handle all your customer service."

### Real Examples Do the Heavy Lifting

Every post needs at least one named, real-world case — a company, a product, a cultural moment. This is how Marlon establishes authority without ever citing his title.

### Practical Next Step

Every post ends with something the reader can DO — a prompt to try, a workflow to test, a question to bring to their team. "Build assistants your team can actually use on Monday" is the energy.

## Frontmatter Requirements

```yaml
---
title: "Claim or Frame, Not a Label"
publishDate: YYYY-MM-DD
description: "One sentence that makes the reader want to click."
tags: ["relevant", "specific", "tags"]
draft: false
heroImage: "/blog/slug-hero.png"   # optional
---
```

- Title should be a claim or frame: "Voice Is the New UI" not "Thoughts on Voice Technology."
- Description is marketing copy — one sentence, active voice, specific value.
