# Maverick Phase 2 — Chat Interface + Agentic Execution

> Build spec, captured 2026-07-06 from Marlon's direction. **Phase 2A shipped 2026-07-07**
> (chat + internal tools + approvals UI + scheduled briefing — details below). 2B/2C remain.
> The approval guardrail in CLAUDE.md is non-negotiable and governs everything here.
>
> **Kickoff decisions (Marlon, 2026-07-07):** hybrid home layout (chat centerpiece, stats strip
> + side rail stay) · invoicing targets **Stripe** · code bridge = **GitHub handoff** · briefing
> cron at **7:00 AM ET** (`0 11 * * *` UTC — shift to `0 12` when DST ends in November).
>
> **✅ Built in 2A:** `maverick-chat` edge function (SSE streaming, Sonnet 5 via OpenRouter,
> tool loop with internal tools: task/project/engagement/revenue CRUD, memory remember/recall,
> check-ins, snapshot; audit-logged), chat_conversations/chat_messages tables, hybrid chat home,
> Approval Queue UI (`/maverick/approvals` — decisions live, dispatchers pending), pg_cron
> morning briefing (vault-secret auth) that seeds the briefing as the first message of each
> day's conversation.
>
> **⏳ 2B (needs Marlon's Google OAuth setup):** Gmail/Calendar read mirrors, Email Center,
> email-send dispatcher. **⏳ 2C:** Stripe invoice dispatcher + payment webhooks, GitHub
> code-task dispatcher.
>
> **Approval-queue contracts for the 2B/2C dispatchers** — rows are enqueued with `action_type`
> + `preview` and executed ONLY from status `approved`:
> - `send_email` — preview: `{ to: string[], subject, body, reply_to? }`
> - `create_invoice` — preview: `{ client, line_items: [{description, amount}], due_date, stripe_customer? }`
> - `calendar_write` — preview: `{ op: create|move|cancel, event, start, end, attendees[] }`
> - `code_task` — preview: `{ repo, title, body, branch_hint? }` → files a GitHub issue

## What Marlon asked for (in his words, lightly cleaned up)

On the Maverick homepage, build a Claude/ChatGPT-like interface. It functions very similarly to
those platforms, but the system is called **Maverick**. Capabilities:

- **Prompting and voice** — no image or video generation needed right now. Uses OpenRouter.
- **Running tasks** — e.g. send an email or several emails; create an invoice inside a payment
  system; connect to Marlon's Claude Code and hand off coding tasks — the same kinds of things
  Marlon does in his Claude Code chats today.

## 1. Maverick Chat (the new /maverick homepage)

- **UI**: conversation-first interface replacing the widget grid as the Maverick home. Message
  history, streaming assistant replies, stop/regenerate, conversation list (rename/delete).
  The Phase 1 widgets don't die: daily briefing becomes the seeded first message of each day's
  conversation; the at-a-glance strip stays as a compact header; check-in/top-3 move to a side
  panel or stay reachable from the nav.
- **Voice**: reuse the Web Speech API dictation already shipped in `/maverick/write` — mic button
  in the composer, transcript lands in the input. (Voice *output* is out of scope for now.)
- **Model**: OpenRouter via a new `maverick-chat` edge function (verify_jwt + owner email check,
  same as `maverick-agent`). Streaming via SSE — Supabase edge functions support streamed
  responses. Model = `MODEL_REASONING` profile by default with a per-conversation override.
- **Context**: system prompt embeds the live dashboard snapshot (reuse `gatherContext()` from
  `maverick-agent`) so Maverick can answer "what's my week look like?" from real data.
- **Persistence**: new tables `chat_conversations` (id, title, created_at, updated_at) and
  `chat_messages` (conversation_id, role, content, tool_calls jsonb, created_at) — RLS
  email-pinned like everything else. Generated types refreshed after migration.
- **Not in scope**: image generation, video generation, multi-user.

## 2. Agentic task execution (tool calls from chat)

OpenRouter tool-calling loop inside `maverick-chat`. Two tool classes, enforced in the execution
layer per the standing guardrail:

**Internal tools — execute immediately, log to `audit_log`:**
- CRUD on projects / tasks / engagements / revenue items ("add a task to VoicePath…", "move the
  DC keynote to signed")
- Query anything the dashboard shows
- Draft content (emails, proposals, posts) as *drafts only*

**External tools — NEVER direct. Enqueue to `approval_queue` with a full preview; dispatch only
from a row Marlon approves in the Approval Queue UI:**
- `send_email` / bulk email (Gmail API, Google OAuth) — preview = full recipient list + body
- `create_invoice` (Stripe assumed — confirm at kickoff) — preview = line items + amounts
- `calendar_write` (move/create events with attendees)
- Anything else that leaves the building

**Claude Code bridge** — Maverick hands coding tasks to Marlon's Claude Code rather than writing
code itself. Mechanism decided at kickoff; candidate designs, in rough order of preference:
1. **GitHub handoff**: Maverick (approval-gated) files a structured issue / branch task in the
   repo; Marlon's Claude Code (or Claude Code cloud sessions) picks it up. Auditable, async,
   no new infrastructure.
2. **Claude Agent SDK worker**: a small always-on runner Marlon hosts that polls a
   `code_tasks` table and executes with the Agent SDK.
3. Direct local bridge into his running Claude Code — most magical, most plumbing.

## 3. Maverick memory — vector store (INFRASTRUCTURE ALREADY LIVE, built 2026-07-06)

The store and its API exist today; Phase 2's chat loop is what starts using them automatically.

- **Table**: `public.maverick_memories` — content, `vector(384)` embedding (HNSW cosine index),
  kind (`fact | preference | decision | person | project_context | conversation_summary`),
  source, metadata jsonb. RLS email-pinned like everything else.
- **Embeddings**: Supabase edge runtime's built-in `gte-small` (384 dims, mean-pooled,
  normalized) — zero external APIs, zero keys. If we ever switch models (e.g. OpenAI
  text-embedding-3-small, 1536 dims), that's a column migration + re-embed of all rows.
- **Search**: `match_maverick_memories(query_embedding, match_count, min_similarity)` RPC.
- **API**: `maverick-memory` edge function (verify_jwt + owner check) — actions `remember`,
  `recall`, `list`, `forget`. Verified E2E: seeded 3 memories, semantic recall ranks correctly
  on paraphrased queries.
- **Phase 2 wiring**: the chat loop (a) recalls top-k memories for each user message and injects
  them into the system prompt, (b) exposes `remember`/`forget` as internal tools so Maverick
  saves durable facts/preferences/decisions as they come up, and (c) writes a
  `conversation_summary` memory when a conversation ends. Memory writes are internal actions —
  no approval needed; log to `audit_log`.
- **Tune at Phase 2**: the `min_similarity` default (0.45) is permissive — gte-small similarities
  cluster high (~0.75+ for related content). Re-tune once real memory volume exists; `match_count`
  does most of the filtering today.

## 4. Carried over from the original Phase 2 (unchanged)

- Google Calendar read → `calendar_events` mirror; Gmail read + classify + draft (no send) →
  `email_summaries`; Email Center page.
- **Approval Queue UI** (`/maverick/approvals`) — becomes load-bearing for the tools above.
- Morning briefing + evening wrap-up on schedule via `pg_cron` + `pg_net` invoking the edge
  functions (no Vercel here).
- Audit log surfaced in the UI.

## Prerequisites / secrets to collect at kickoff

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REFRESH_TOKEN` (Google Cloud project,
  OAuth consent, Gmail + Calendar scopes) — the one setup that needs Marlon at the keyboard.
- `STRIPE_SECRET_KEY` (or whichever payment system he confirms).
- GitHub token if the Claude Code bridge goes the GitHub-handoff route.

## Open questions to settle at kickoff (don't assume)

1. Payment system — Stripe, or something he already invoices with?
2. Claude Code bridge — which of the three designs?
3. Chat-as-home layout — how much of the Phase 1 dashboard stays on the home screen vs. moves
   to a sub-page?
4. Bulk email — where do recipient lists come from (manual paste, `inquiries`, a contacts table)?
