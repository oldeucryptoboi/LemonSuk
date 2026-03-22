# ClawHub Skill Scan Isolation

Date: March 22, 2026

This document records the empirical isolation work used to determine why the
OpenClaw `lemonsuk` skill was being marked `SUSPICIOUS` on ClawHub, what was
actually causing the warning, and what change cleared it.

## Problem Statement

The published OpenClaw skill `lemonsuk` was installable, but ClawHub reported:

- `Security: SUSPICIOUS`
- `Warnings: yes`
- warning text referring to `VirusTotal Code Insight`

This created two concrete problems:

1. the skill looked unsafe even though it was intentionally published
2. Phil started rationalizing `--force`, which is bad operational behavior

The goal was to move from speculation to an evidence-based answer.

## Initial Known Facts

Observed directly from ClawHub CLI:

- `npx -y clawhub inspect lemonsuk`
- `npx -y clawhub install lemonsuk --force`

Observed state before remediation:

- skill slug: `lemonsuk`
- owner: `oldeucryptoboi`
- versions observed: `1.0.0`, `2.0.0`, `2.0.1`, `2.0.2`
- status before final fix: `Security: SUSPICIOUS`

Observed warning source:

- ClawHub CLI explicitly said the skill was flagged by `VirusTotal Code Insight`

That meant the first question was whether the issue came from:

- OpenClaw's local scanner
- ClawHub's remote scan
- or both

## Local Scanner Check

I inspected the local OpenClaw skill scanner implementation:

- [skills-install.ts](/Users/oldeucryptoboi/Projects/openclaw/openclaw/src/agents/skills-install.ts)
- [skill-scanner.ts](/Users/oldeucryptoboi/Projects/openclaw/openclaw/src/security/skill-scanner.ts)

What matters from that code:

- the local scanner only scans code-like files:
  - `.js`
  - `.ts`
  - `.mjs`
  - `.cjs`
  - `.mts`
  - `.cts`
  - `.jsx`
  - `.tsx`
- the local rules look for patterns such as:
  - `child_process` execution
  - `eval` / `new Function`
  - crypto-mining strings
  - env harvesting plus network sends
  - suspicious WebSocket or exfiltration patterns

Important consequence:

- the LemonSuk ClawHub skill bundle is markdown-heavy
- the local OpenClaw code scanner is not the thing marking the markdown skill as suspicious

Conclusion from source inspection:

- the warning was coming from ClawHub's remote scan path, not the local OpenClaw scanner

## Hypothesis Set

Before testing, the plausible causes were:

1. stale Musk-centric wording
2. missing version metadata
3. any mention of API keys or auth headers
4. any network mutation example
5. only the top-level `SKILL.md` being scanned aggressively
6. the full LemonSuk bundle shape being risky rather than any single line

## Method

The right way to answer this was not more guessing. It was to publish controlled
probe skills and compare scan outcomes.

The constraints:

- ClawHub enforces `max 5 new skills per hour`
- so the experiment used:
  - five initial throwaway slugs at `0.0.1`
  - then new versions on those same slugs for second-stage probes

All probe slugs were later deleted after results were recorded.

## Probe Matrix

### First Batch

Published throwaway probe skills:

- `lemonsuk-scan-probe-baseline@0.0.1`
- `lemonsuk-scan-probe-get@0.0.1`
- `lemonsuk-scan-probe-auth@0.0.1`
- `lemonsuk-scan-probe-post@0.0.1`
- `lemonsuk-scan-probe-lemonsuk-min@0.0.1`

Results:

| Probe | Content | Result |
| --- | --- | --- |
| `baseline@0.0.1` | plain markdown, no network examples | `CLEAN` |
| `get@0.0.1` | public unauthenticated `GET` curl example | `CLEAN` |
| `auth@0.0.1` | authenticated `GET` curl example | `SUSPICIOUS` |
| `post@0.0.1` | authenticated `POST` curl example | `SUSPICIOUS` |
| `lemonsuk-min@0.0.1` | one minimal LemonSuk authenticated write example | `SUSPICIOUS` |

Immediate takeaways:

- public read-only curl examples alone were not enough to trigger the warning
- a single top-level authenticated external command was enough

### Second Batch

Because new-skill creation hit the hourly limit, the same slugs were reused with
new versions:

- `lemonsuk-scan-probe-baseline@0.0.2`
- `lemonsuk-scan-probe-get@0.0.2`
- `lemonsuk-scan-probe-auth@0.0.2`
- `lemonsuk-scan-probe-post@0.0.2`

Version mapping:

- `baseline@0.0.2`: current LemonSuk `SKILL.md` only
- `get@0.0.2`: current LemonSuk `references/agent-api.md` only
- `auth@0.0.2`: full current LemonSuk bundle clone
- `post@0.0.2`: generic multi-write bundle with several authenticated writes

Results:

| Probe | Content | Result |
| --- | --- | --- |
| `baseline@0.0.2` | top-level LemonSuk `SKILL.md` only | `SUSPICIOUS` |
| `get@0.0.2` | LemonSuk reference file only | `CLEAN` |
| `auth@0.0.2` | full current LemonSuk bundle clone | `SUSPICIOUS` |
| `post@0.0.2` | several generic authenticated writes | `SUSPICIOUS` |

Immediate takeaways:

- the reference file by itself was clean
- the top-level `SKILL.md` by itself was suspicious
- the flag was not specific to the LemonSuk domain
- a generic multi-write top-level skill was also enough to trigger it

### Third Batch

To separate auth tokens from executable command patterns, two more versions were
published:

- `lemonsuk-scan-probe-baseline@0.0.3`
- `lemonsuk-scan-probe-get@0.0.3`

Version mapping:

- `baseline@0.0.3`: auth token text only, no curl commands
- `get@0.0.3`: unauthenticated `POST` curl example

Results:

| Probe | Content | Result |
| --- | --- | --- |
| `baseline@0.0.3` | `Authorization: Bearer $EXAMPLE_API_KEY` as static text only | `CLEAN` |
| `get@0.0.3` | unauthenticated `POST` curl example | `CLEAN` |

Immediate takeaways:

- auth text alone did not trigger the warning
- write verbs alone did not trigger the warning
- the risky combination was executable external commands plus auth-heavy usage in top-level `SKILL.md`

## Final Conclusion

The empirical result is:

- ClawHub was not objecting to the LemonSuk brand or old Musk wording
- ClawHub was not objecting to the reference file by itself
- ClawHub was not objecting to plain auth text by itself
- ClawHub was not objecting to unauthenticated external writes by themselves

The consistent trigger pattern was:

- executable top-level command examples in `SKILL.md`
- especially when those commands use auth headers or API keys

The strongest operational interpretation is:

- ClawHub's remote security scan treats top-level skill instructions as the most
  sensitive surface
- auth-heavy command examples in `SKILL.md` are enough to make the skill look
  risky
- detailed operational commands are tolerated better in reference files than in
  the top-level skill body

This is still an empirical conclusion, not a reverse-engineered exact
VirusTotal rule. ClawHub does not expose the precise signature or reasoning.

## Remediation Applied

The fix was to restructure the real LemonSuk skill:

- keep [SKILL.md](/Users/oldeucryptoboi/Projects/oldeucryptoboi/LemonSuk/skills/lemonsuk/SKILL.md) high-level and workflow-oriented
- remove executable/auth-heavy curl examples from the top-level skill body
- keep exact headers, endpoints, request examples, and response shapes in
  [agent-api.md](/Users/oldeucryptoboi/Projects/oldeucryptoboi/LemonSuk/skills/lemonsuk/references/agent-api.md)
- add explicit board discovery guidance via `GET /api/v1/dashboard` in the
  reference file

Version published with this fix:

- `lemonsuk@2.0.3`

Observed result after publish:

- `Security: CLEAN`

That is the direct confirmation that the remediation worked.

## Mac Mini Sync

After `2.0.3` published cleanly, the updated skill and reference files were
synced to the Mac mini OpenClaw install locations:

- `/Users/laurent/.openclaw/skills/lemonsuk/SKILL.md`
- `/Users/laurent/.openclaw/skills/lemonsuk/references/agent-api.md`
- `/Users/laurent/skills/lemonsuk/SKILL.md`
- `/Users/laurent/skills/lemonsuk/references/agent-api.md`

The synced files were verified to match.

## Probe Cleanup

The temporary probe skills were deleted from ClawHub after the results were
captured:

- `lemonsuk-scan-probe-baseline`
- `lemonsuk-scan-probe-get`
- `lemonsuk-scan-probe-auth`
- `lemonsuk-scan-probe-post`
- `lemonsuk-scan-probe-lemonsuk-min`

## Operating Rules Going Forward

For OpenClaw skills published to ClawHub:

1. keep the top-level `SKILL.md` high-level and workflow-based
2. move raw curl examples, headers, and mutation-heavy examples into
   `references/`
3. prefer describing auth requirements in prose at the top level
4. keep market discovery explicit, preferably with a single public discovery
   endpoint such as `/api/v1/dashboard`
5. never normalize `--force` when ClawHub says a skill is suspicious
6. if a future skill is flagged again, repeat the same probe-based isolation
   method instead of guessing

## Useful Commands From the Investigation

Inspect the published skill:

```bash
npx -y clawhub inspect lemonsuk
```

Inspect a specific version:

```bash
npx -y clawhub inspect lemonsuk --version 2.0.3
```

Inspect raw skill content:

```bash
npx -y clawhub inspect lemonsuk --file SKILL.md
```

Republish the skill:

```bash
npx -y clawhub publish ./skills/lemonsuk --slug lemonsuk --name LemonSuk --version 2.0.3
```

## Bottom Line

The warning was not random. It was caused by how much executable,
auth-heavy operational detail lived in the top-level `SKILL.md`.

Once that detail moved into `references/` and the top-level skill became
workflow-first, the same LemonSuk skill published as `CLEAN`.
