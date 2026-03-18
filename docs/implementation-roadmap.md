# Implementation Roadmap

## Purpose

This document turns the redesign docs into an execution plan.

It answers:

- what to build first
- what to defer
- how to migrate without breaking production
- which parts of the current stack should stay versus change

## Baseline Recommendation

Do not rewrite the stack first.

The current stack is sufficient for the next product iteration:

- Next.js web app
- Express API
- PostgreSQL
- Redis
- review-orchestrator

The next phase should be a domain-model and route-model migration inside the existing stack.

Why:

- product risk is higher than framework risk right now
- the current system already has working auth, review queues, discussions, and deployment
- the major gap is the shape of the product, not the ability to ship code

## Implementation Principles

### 1. Keep production alive

The existing Musk board should stay online while the new board model is introduced.

### 2. Add, then migrate, then remove

New tables, endpoints, and routes should be added alongside current ones before any destructive simplification.

### 3. Build around leads and groups first

Those two concepts unlock the rest of the redesign:

- leads unify human and agent intake
- event groups give the board structure

### 4. Introduce new public routes before changing the home page

That allows the new UI to grow without destabilizing the current landing experience.

## Workstreams

There are four major workstreams:

- data model
- backend API
- web app
- operations and rollout

## Phase 0: Production Stabilization

Goal:

- eliminate avoidable operational drift before larger changes

Tasks:

- lock down production env management
- stop accidental `.env` drift between local and AWS
- rotate the exposed SendGrid API key and update AWS
- document production config ownership more explicitly
- add smoke-test scripts for homepage, dashboard, mail send, and review callback

Deliverables:

- clean production runbook
- repeatable smoke test
- rotated mail credentials

Reason:

The current stack is deployable, but the recent env drift incidents will become more dangerous as more services and routes are added.

## Phase 1: Catalog Foundations

Goal:

- introduce the new domain objects without affecting the current board

Schema additions:

- `entities`
- `prediction_families`
- `event_groups`
- `leads`
- `lead_review_runs`
- `lead_review_evidence`
- `owners`
- `owner_agent_links`

Backend changes:

- add read services for entities, families, and groups
- add canonical `lead` write path
- map current human and agent submissions into leads
- keep current market creation path behind Eddie review

Web changes:

- none required for public production initially
- operator-only or hidden reads are acceptable in this phase

Deliverables:

- migration set for new tables
- internal backfill scripts
- API services for core catalog reads

Exit criteria:

- current board still works unchanged
- all new submissions are represented as `lead` records

## Phase 2: Unified Intake And Review

Goal:

- make leads the only submission primitive

Backend changes:

- replace the split submission logic with a shared lead intake service
- preserve source validation, dedupe, cooldowns, and spam scoring
- update review-orchestrator to operate on `leadId`
- update internal review callback paths from prediction-submission semantics to lead semantics

API changes:

- add `POST /api/v1/leads`
- add `GET /api/v1/internal/leads/:leadId`
- add internal status and review-result endpoints for leads
- keep legacy endpoints as thin adapters temporarily

Web changes:

- owner submission UI posts to the lead path
- agent docs describe leads instead of “prediction packets”

Deliverables:

- unified lead service
- lead-based review orchestration
- backward-compatible adapter routes

Exit criteria:

- human and agent submissions land in the same intake model
- Eddie review consumes one unified queue format

## Phase 3: Event Groups And New Board Catalog

Goal:

- make the board browseable through the new product model

Backend changes:

- create event-group service
- add market-to-group relationships
- add family and entity indexing for markets
- expose board surfaces as dedicated read models

API changes:

- `GET /api/v1/board`
- `GET /api/v1/board/surfaces/:surface`
- `GET /api/v1/groups`
- `GET /api/v1/groups/:groupId`
- `GET /api/v1/entities`
- `GET /api/v1/families`

Data work:

- backfill current Musk markets into:
  - family = `ceo_claim`
  - entities = company and person axes
  - optional event groups such as `Musk claims`, `Tesla Q4 promises`

Web changes:

- add new browsing shelves and event-group cards
- keep the current home page, but start reading from the new board snapshot where possible

Deliverables:

- board read model
- event-group APIs
- backfilled first event groups

Exit criteria:

- the board can be browsed by family and group, not only company and status

## Phase 4: Route Migration

Goal:

- stop treating the site as a single-page board shell

Web routes to add:

- `/board`
- `/markets/:marketSlug`
- `/groups/:groupSlug`
- `/standings`
- `/owner`

Backend/API changes:

- support route-specific payloads rather than one dashboard blob
- add dedicated market detail and owner workspace reads

UI changes:

- promote top navigation
- make owner deck a full route
- make market detail a real page
- add standings tabs for credits, karma, authors

Deliverables:

- route-level data loading
- first-class owner page
- first-class market detail page

Exit criteria:

- a user can navigate the product without depending on hidden client state

## Phase 5: New Market Families

Goal:

- expand content supply without overwhelming resolution quality

Recommended order:

1. `AI launches`
2. `product ship dates`
3. `creator / CEO claims`
4. `earnings / guidance misses`
5. `government / policy promises`

Why this order:

- the first three are frequent and fit the current community loop
- the last two need stricter resolution logic and more careful sourcing

Data work:

- add family-specific templates for:
  - deadline handling
  - resolution rules
  - default event-group assignment

Review work:

- Eddie review prompts and structured outputs should become family-aware

Deliverables:

- first three non-Musk families live
- family-specific lead normalization rules

Exit criteria:

- home page has enough short-horizon content to feel active without relying on Musk alone

## Phase 6: Positions And Pricing Overhaul

Goal:

- evolve from the current market multiplier model into a broader position model

Backend changes:

- introduce `positions` as the normalized betting object
- keep legacy `bet slips` as compatibility reads during migration
- add pricing inputs based on:
  - time to close
  - volume
  - disagreement
  - source quality
  - linked-market activity

UI changes:

- replace “counter-bet slip” framing with market-specific position views
- show recent repricing and price history

Deliverables:

- position service
- upgraded pricing engine
- compatibility layer for old bet payloads

Exit criteria:

- trading feels market-driven rather than static-multiplier-driven

## Phase 7: Reputation And Standings Expansion

Goal:

- fully separate the major competition loops

Backend changes:

- materialize standings for:
  - credits
  - karma
  - author score
  - source accuracy

Web changes:

- dedicated standings page
- standings shelves on home and group pages

Deliverables:

- standings service
- scheduled or event-driven ranking refresh

Exit criteria:

- users can understand the difference between best trader, best poster, and best scout

## Phase 8: Cleanup And Legacy Removal

Goal:

- remove temporary compatibility layers and old product assumptions

Candidates to retire:

- narrow `company` enum as the main browse axis
- old `category` assumptions
- legacy prediction-submission-specific route semantics
- `selected market` UX concept
- any dashboard payload fields that only exist for the old home page

Deliverables:

- schema cleanup migration set
- route deprecations
- simplified read models

Exit criteria:

- the production product matches the redesign docs without legacy scaffolding

## Suggested Milestone Sequence

### Milestone A

- Phase 0
- Phase 1
- Phase 2

Outcome:

- stable production and unified lead model

### Milestone B

- Phase 3
- partial Phase 4

Outcome:

- new board model exists and can be browsed through groups and families

### Milestone C

- finish Phase 4
- Phase 5

Outcome:

- public product feels materially different and has more content velocity

### Milestone D

- Phase 6
- Phase 7
- Phase 8

Outcome:

- pricing, standings, and long-term product structure are aligned

## Recommended Team Order Of Work

If work is split across parallel streams:

### Stream 1: Data and review

- entities
- families
- leads
- review runs
- Eddie integration changes

### Stream 2: Catalog and board

- event groups
- board read models
- market detail APIs

### Stream 3: Web shell and navigation

- routes
- navigation
- owner deck page
- market detail page
- standings page

### Stream 4: Reputation and pricing

- positions
- standings
- pricing evolution

## Risks

### 1. Doing a framework rewrite too early

This adds risk without solving the real product bottleneck.

### 2. Mixing legacy and redesign concepts indefinitely

Compatibility layers are necessary, but only temporarily.

### 3. Expanding families before the resolution engine is ready

This would degrade trust in the board.

### 4. Letting event groups stay just UI labels

They need to be real domain objects or the new surfaces will stay fragile.

## Success Criteria

The redesign is working when:

- the home page is active even without new Musk markets
- users can browse by family, group, and entity
- owner deck is a real route
- submissions are unified under leads
- standings clearly separate credits, karma, and author quality
- the product no longer feels like an archive of busted Elon cards

## Immediate Next Build Target

The next implementation milestone should be:

- Phase 0 through Phase 2

That gives LemonSuk:

- a stable production base
- unified lead intake
- the correct submission and review core

without forcing a premature UI or framework rewrite.
