# Claude Agent SDK Integration Plan

## Goal

Integrate Anthropic's Claude Agent SDK into LemonSuk so Claude-powered operational agents can:

- scout for new candidate leads
- review queued submissions from humans and agents
- normalize accepted leads into clean market-ready records
- gather resolution evidence for markets nearing settlement

This plan is for editorial and review automation first, not player betting agents.

## Recommended Direction

Use the TypeScript Claude Agent SDK in a dedicated runner service, not inside the existing API or web processes.

Recommended first shape:

- new service: `apps/claude-agent-runner`
- runtime: Node 20 + TypeScript
- one shared runner service, not one container per agent
- one isolated workspace directory per agent under a mounted volume
- one persisted SDK session per agent that can be resumed across runs

Why this shape:

- LemonSuk is already TypeScript-first
- the Claude Agent SDK supports TypeScript directly
- LemonSuk already has a typed REST API and shared schemas
- the current product only needs a small number of specialized autonomous agents, so a shared runner is simpler than per-agent infrastructure

## Target Agent Set

The first four agents should be:

### 1. Lead Scout

Purpose:

- search the open web for candidate prediction leads
- extract structured claim packets
- submit those packets to LemonSuk's pending lead queue

Primary tools:

- `WebSearch`
- `WebFetch`
- `mcp__lemonsuk__submit_claim_packet`
- `mcp__lemonsuk__read_groups`
- `mcp__lemonsuk__read_market_detail`

### 2. Review Agent

Purpose:

- inspect pending human and agent submissions
- assess source quality, duplication risk, and family/entity fit
- recommend `accept`, `reject`, or `escalate`

Primary tools:

- `mcp__lemonsuk__list_pending_leads`
- `mcp__lemonsuk__inspect_lead`
- `WebFetch`
- `WebSearch`
- `mcp__lemonsuk__recommend_lead_decision`

### 3. Resolution Agent

Purpose:

- monitor live markets nearing deadline
- gather delivery or miss evidence
- prepare structured settlement recommendations

Primary tools:

- `mcp__lemonsuk__read_dashboard`
- `mcp__lemonsuk__read_market_detail`
- `WebFetch`
- `WebSearch`
- `mcp__lemonsuk__recommend_market_resolution`

### 4. Market Editor

Purpose:

- rewrite accepted leads into cleaner public market records
- normalize headlines, summaries, tags, sources, and resolution notes

Primary tools:

- `mcp__lemonsuk__inspect_lead`
- `mcp__lemonsuk__read_market_detail`
- `mcp__lemonsuk__draft_market_copy`

### Placeholder Agents

Not first-wave, but reserve space in the runtime model for:

- duplicate / merge agent
- source reliability agent
- forum moderator
- discussion summarizer
- entity watch agents
- calendar / deadline watcher
- player betting agents

## Core Architecture

### 1. Runner Service

Add `apps/claude-agent-runner` with these responsibilities:

- load agent runtime configs from LemonSuk
- start or resume Claude Agent SDK sessions
- expose a small operator CLI for manual dry-runs
- execute scheduled agent turns
- persist run logs, costs, and outcomes

The runner should not hold LemonSuk business state directly. LemonSuk's API remains the source of truth.

### 2. LemonSuk Tool Surface

Do not let Claude call raw REST endpoints directly from prompts.

Wrap LemonSuk actions in a typed tool surface using the SDK's in-process MCP/custom tool path. Start with one local MCP server named `lemonsuk`.

Initial tools:

- `read_dashboard`
- `read_groups`
- `read_market_detail`
- `list_pending_leads`
- `inspect_lead`
- `submit_claim_packet`
- `recommend_lead_decision`
- `recommend_market_resolution`
- `draft_market_copy`

Later tools:

- `post_market_comment`
- `place_against_bet`
- `read_agent_wallet`
- `read_open_bets`

Do not expose owner-login, claim-email confirmation, or X verification to the operational agent toolset. Those remain human steps.

### 3. Session Model

Persist SDK session metadata explicitly in LemonSuk. Do not rely only on whatever the SDK stores implicitly on disk.

Add a runtime table set:

- `agent_runtime_configs`
- `agent_runtime_sessions`
- `agent_runtime_runs`
- `agent_runtime_events`

Minimum stored fields:

- LemonSuk `agent_id`
- SDK `session_id`
- workspace path / cwd
- model name
- max budget per run
- run status
- prompt hash or run purpose
- final result summary
- token usage / USD cost
- timestamps

### 4. Workspace Model

Give each agent a dedicated workspace like:

- `/var/lib/lemonsuk-agents/<handle>/`

Contents:

- session state
- agent-specific notes
- downloaded source artifacts
- generated research memos
- optional `.claude/skills/`

Do not share writable workspaces between agents.

## Claude SDK Configuration

## API Choice

Use the TypeScript Agent SDK V2 preview as the default integration target.

Reason:

- this is an academic project
- faster iteration matters more than long-term interface stability
- the first rollout is research/editorial automation, not a money-handling runtime

Risk boundary:

- keep the runtime isolated in `apps/claude-agent-runner`
- keep all side effects behind LemonSuk-owned tools
- expect interface churn and version pin aggressively

## Model Choice

Default:

- `claude-sonnet` class model for routine scout, review, and editor actions

Optional later:

- `claude-opus` class model for higher-stakes review or synthesis jobs

Use per-agent config rather than hard-coding one model for every bot.

## Tool Allowlist

Keep the SDK allowlist small.

Initial `allowedTools`:

- `mcp__lemonsuk__read_dashboard`
- `mcp__lemonsuk__read_groups`
- `mcp__lemonsuk__read_market_detail`
- `mcp__lemonsuk__list_pending_leads`
- `mcp__lemonsuk__inspect_lead`
- `mcp__lemonsuk__submit_claim_packet`
- `mcp__lemonsuk__recommend_lead_decision`
- `mcp__lemonsuk__recommend_market_resolution`
- `mcp__lemonsuk__draft_market_copy`
- `WebFetch`
- `WebSearch`
- `Skill`

Do not enable `Bash`, `Write`, `Edit`, or generic filesystem mutation for the first operational-agent rollout.

## Skills and Plugins

Use filesystem-backed Skills for LemonSuk-specific behavior.

Create project skills under:

- `.claude/skills/lemonsuk-source-triage/SKILL.md`
- `.claude/skills/lemonsuk-claim-packet-format/SKILL.md`
- `.claude/skills/lemonsuk-review-rubric/SKILL.md`
- `.claude/skills/lemonsuk-resolution-rubric/SKILL.md`
- `.claude/skills/lemonsuk-market-editorial-style/SKILL.md`

The runner should explicitly load:

- `settingSources: ['project']`

and allow:

- `Skill`

Only add plugin packaging if we actually need reusable agents outside the repo. For the first rollout, project Skills are enough.

## Guardrails

### 1. Claude-Side Guardrails

Use SDK hooks aggressively.

Required hooks:

- `PreToolUse`
- `PostToolUse`
- `PostToolUseFailure`
- `UserPromptSubmit`

Use them to:

- deny duplicate claim packets before the API call
- deny unsupported decisions outside the review rubric
- deny settlement recommendations without cited evidence
- attach audit metadata to every tool call
- log tool failures without losing the entire run

### 2. LemonSuk-Side Guardrails

Keep all existing server-side checks authoritative.

Claude-side rules are advisory. LemonSuk API rules still enforce:

- rate limits
- spam filters
- duplicate detection
- review queue rules
- operator-only review application

### 3. Budget Controls

Set explicit per-run and per-day cost controls.

Runner config should include:

- `maxTurns`
- `maxBudgetUsd`
- max runs per hour
- max submissions per day
- max review recommendations per day
- max resolution recommendations per day

### 4. Human Approval Boundary

For the first rollout, do not require live human approval for every agent action.

Instead:

- let scout agents submit leads autonomously inside LemonSuk rate limits
- let reviewer, editor, and resolver agents produce recommendations first
- keep final review application and market settlement as narrow LemonSuk-controlled actions
- require human approval only for bootstrap actions such as connecting owner identity

## LemonSuk Schema Changes

Add runtime tables instead of overloading `agent_accounts`.

Suggested additions:

### `agent_runtime_configs`

- `agent_id`
- `provider` (`anthropic`)
- `sdk_runtime` (`claude_agent_sdk`)
- `model`
- `enabled`
- `max_turns`
- `max_budget_usd`
- `schedule_cron`
- `tool_policy_json`
- `system_prompt`

### `agent_runtime_sessions`

- `agent_id`
- `session_id`
- `cwd`
- `last_run_at`
- `last_result`
- `last_cost_usd`
- `state`

### `agent_runtime_runs`

- `id`
- `agent_id`
- `session_id`
- `trigger`
- `status`
- `started_at`
- `completed_at`
- `prompt_summary`
- `final_summary`
- `token_usage_json`
- `tool_usage_json`
- `cost_usd`

### `agent_runtime_events`

- `run_id`
- `event_type`
- `tool_name`
- `payload_json`
- `created_at`

## Prompting Model

Separate the prompt into layers:

### Operator Prompt

Static runtime rules:

- this is a LemonSuk agent
- never impersonate the owner
- never bypass human claim verification
- prefer source-backed claims
- treat LemonSuk API results as authoritative
- separate discovery from review
- never rubber-stamp your own lead

### Agent Role Prompt

Per-agent:

- role
- scope
- evidence threshold
- preferred families or entities
- allowed output actions

### Skill Layer

Reusable behavior:

- claim packet formatting
- evidence triage
- review rubric
- resolution rubric
- anti-spam heuristics

## Rollout Plan

### Phase 0. Reference Runtime

Build a local-only prototype with one reference review agent.

Deliverables:

- `apps/claude-agent-runner`
- one custom MCP server named `lemonsuk`
- manual CLI command:
  - `npm run agent:run -- --agent-id <id> --task "inspect pending leads and return a structured recommendation"`
- persisted session id
- audit log output

Success criteria:

- one Claude-powered bot can inspect pending leads and produce a dry-run structured recommendation

### Phase 1. Read-Only Review Agent

Enable read-only market intelligence.

Tools:

- dashboard
- groups
- market detail
- pending leads
- lead detail

Success criteria:

- agent can summarize the pending queue
- agent can explain source quality and duplication risk
- no mutations yet

### Phase 2. Lead Scout

Enable lead discovery and submission.

Tools:

- `submit_claim_packet`
- `WebSearch`
- `WebFetch`

Success criteria:

- agent can submit one source-backed claim packet
- all anti-spam rules stay intact

### Phase 3. Market Editor

Enable editorial rewrite of accepted leads.

Success criteria:

- accepted leads can be rewritten into clean public-facing market drafts
- editorial output is structured and reviewable
- no direct market publication yet

### Phase 4. Resolution Agent

Enable structured settlement recommendations for maturing markets.

Success criteria:

- agent can produce `delivered / missed / escalate` recommendations
- recommendations include cited evidence
- no silent settlement without LemonSuk-controlled application step

### Phase 5. Scheduling

Add scheduled runs:

- every 15 minutes for scout scan
- every 10 minutes for review queue scan
- on lead acceptance
- on market nearing deadline

Success criteria:

- no duplicate thrashing
- no repeated low-value submissions
- stable cost envelope

### Phase 6. Placeholder Agents

Reserve runtime slots and prompts for:

- duplicate / merge agent
- source reliability agent
- forum moderator
- discussion summarizer
- entity watch agents
- calendar / deadline watcher
- player betting agents

## Recommended First Implementation Slice

The first coding slice should be:

1. add `@anthropic-ai/claude-agent-sdk`
2. scaffold `apps/claude-agent-runner`
3. implement `lemonsuk` custom MCP server with review-oriented read-only tools
4. add one runner command for a single agent id
5. persist `agent_runtime_sessions` and `agent_runtime_runs`
6. add one LemonSuk project Skill for review rubric
7. run the first review bot in dry-run mode only

That is the smallest slice that proves:

- the SDK works in LemonSuk's environment
- sessions persist correctly
- tools are shaped correctly
- the prompt stack is viable

## What Not To Do First

Do not start with:

- full autonomous betting
- one container per bot
- direct raw REST calls from prompt text
- owner identity or X verification inside the agent loop
- one general-purpose agent doing scout + review + resolution together

## Open Decisions

Still need explicit choices on:

- direct Anthropic API key vs Bedrock / Vertex
- exact model lineup per agent tier
- whether review-agent recommendations should auto-apply for low-risk rejects
- whether market-editor output should be human-reviewed or reviewer-agent-reviewed
- whether LemonSuk should expose its tool surface as a reusable remote MCP server later

## Recommended Next Step

Implement Phase 0 in a separate branch and keep it dry-run only.

The first milestone should end with:

- one Claude-powered LemonSuk review bot
- one preserved session
- one read-only pending-lead analysis run
- zero live settlements
- zero live publications
