import type { InternalPredictionLeadDetail } from '../../../packages/shared/src/types'

export function buildReviewAgentSystemPrompt(): string {
  return [
    'You are LemonSuk review agent.',
    'Your job is to inspect one pending lead and return a strict structured review recommendation.',
    'Prefer explicit, source-backed, settleable claims.',
    'Reject weak, vague, or obviously duplicative items.',
    'Escalate when the source is ambiguous, conflicts with current board state, or cannot be resolved confidently.',
    'Use WebFetch and WebSearch when needed, but do not invent evidence or IDs.',
    'If you cite duplicate leads or markets, only include IDs present in the provided LemonSuk context.',
    'Return only the structured result requested by the output schema.',
  ].join(' ')
}

export function buildReviewAgentPrompt(
  detail: InternalPredictionLeadDetail,
): string {
  return [
    'Review this LemonSuk pending lead.',
    '',
    'Tasks:',
    '1. Decide accept, reject, or escalate.',
    '2. Assess confidence from 0 to 1.',
    '3. Provide a concise summary.',
    '4. Provide evidence entries with URL and excerpt.',
    '5. Suggest family/entity if clear.',
    '6. Identify duplicate lead IDs or market IDs only from the provided LemonSuk context.',
    '7. Provide normalized headline/summary only if they improve the lead.',
    '8. Set needsHumanReview when uncertainty remains material.',
    '',
    'Lead detail JSON:',
    JSON.stringify(detail, null, 2),
  ].join('\n')
}

export const reviewRecommendationOutputJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'verdict',
    'confidence',
    'summary',
    'evidence',
    'needsHumanReview',
    'duplicateLeadIds',
    'duplicateMarketIds',
  ],
  properties: {
    verdict: {
      type: 'string',
      enum: ['accept', 'reject', 'escalate'],
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
    },
    summary: {
      type: 'string',
      minLength: 12,
      maxLength: 500,
    },
    evidence: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['url', 'excerpt'],
        properties: {
          url: {
            type: 'string',
            format: 'uri',
          },
          excerpt: {
            type: 'string',
            minLength: 1,
            maxLength: 500,
          },
        },
      },
    },
    needsHumanReview: {
      type: 'boolean',
    },
    recommendedFamilySlug: {
      anyOf: [
        {
          type: 'string',
          enum: [
            'ai_launch',
            'product_ship_date',
            'earnings_guidance',
            'policy_promise',
            'ceo_claim',
          ],
        },
        { type: 'null' },
      ],
    },
    recommendedEntitySlug: {
      anyOf: [{ type: 'string', minLength: 1, maxLength: 120 }, { type: 'null' }],
    },
    duplicateLeadIds: {
      type: 'array',
      maxItems: 12,
      items: { type: 'string', minLength: 1, maxLength: 120 },
    },
    duplicateMarketIds: {
      type: 'array',
      maxItems: 12,
      items: { type: 'string', minLength: 1, maxLength: 120 },
    },
    normalizedHeadline: {
      anyOf: [{ type: 'string', minLength: 12, maxLength: 200 }, { type: 'null' }],
    },
    normalizedSummary: {
      anyOf: [{ type: 'string', minLength: 12, maxLength: 500 }, { type: 'null' }],
    },
    escalationReason: {
      anyOf: [{ type: 'string', minLength: 3, maxLength: 280 }, { type: 'null' }],
    },
  },
} as const
