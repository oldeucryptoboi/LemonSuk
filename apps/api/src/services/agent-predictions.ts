import type { AgentProfile, AgentPredictionSubmissionInput } from '../shared'
import { candidateMarketSchema } from '../shared'
import { scoreCandidateFromSignals } from '../agent/classifier'
import { inferSourceType } from './source-type'
import { createSourceId, domainFromUrl, toIso, unique } from './utils'

export function buildCandidateFromAgentSubmission(
  agent: AgentProfile,
  input: AgentPredictionSubmissionInput,
) {
  const sourceType = inferSourceType(input.sourceUrl)
  const scoring = scoreCandidateFromSignals(sourceType, {
    hasFetchedText: false,
    hasExplicitDateSignal: true,
  })
  const sourceLabel = input.sourceLabel?.trim() || domainFromUrl(input.sourceUrl)
  const sourcePublishedAt = input.sourcePublishedAt
    ? toIso(input.sourcePublishedAt)
    : null

  return candidateMarketSchema.parse({
    headline: input.headline.trim(),
    subject: input.subject.trim(),
    category: input.category,
    announcedOn: toIso(input.announcedOn ?? input.sourcePublishedAt ?? new Date()),
    promisedDate: toIso(input.promisedDate),
    summary: input.summary.trim(),
    confidence: scoring.confidence,
    stakeDifficulty: scoring.stakeDifficulty,
    basePayoutMultiplier: scoring.basePayoutMultiplier,
    payoutMultiplier: scoring.basePayoutMultiplier,
    tags: unique([
      ...input.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean),
      sourceType,
      'agent-submitted',
    ]),
    source: {
      id: createSourceId(sourceLabel, input.sourceUrl),
      label: sourceLabel,
      url: input.sourceUrl,
      sourceType,
      domain: domainFromUrl(input.sourceUrl),
      publishedAt: sourcePublishedAt,
      note: input.sourceNote?.trim() || `Submitted by @${agent.handle}.`,
    },
    author: {
      id: agent.id,
      handle: agent.handle,
      displayName: agent.displayName,
    },
  })
}
