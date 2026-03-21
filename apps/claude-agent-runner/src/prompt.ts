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
    'Do not return markdown, prose paragraphs, headings, or fenced JSON in the assistant text output.',
    'Use these exact field names: verdict, confidence, summary, evidence, needsHumanReview, recommendedFamilySlug, recommendedEntitySlug, duplicateLeadIds, duplicateMarketIds, normalizedHeadline, normalizedSummary, escalationReason.',
    'Never use aliases such as decision, suggestedFamilyId, suggestedEntityId, recommendedFamilyId, or recommendedEntityId.',
    'Evidence URLs must be real http or https URLs. If no reliable evidence URL exists, return an empty evidence array.',
    'If a field does not apply, return null for nullable string fields and [] for duplicate arrays.',
  ].join(' ')
}

export function buildReviewAgentPrompt(
  detail: InternalPredictionLeadDetail,
): string {
  return [
    'Review this LemonSuk pending lead.',
    '',
    'Tasks:',
    '1. Decide accept, reject, or escalate using the exact field name verdict.',
    '2. Assess confidence from 0 to 1 using the exact field name confidence.',
    '3. Provide a concise summary using the exact field name summary.',
    '4. Provide evidence entries with real URL and excerpt using the exact field name evidence.',
    '5. Suggest recommendedFamilySlug and recommendedEntitySlug only when clear; otherwise set them to null.',
    '6. Identify duplicateLeadIds or duplicateMarketIds only from the provided LemonSuk context; otherwise return [].',
    '7. Provide normalizedHeadline and normalizedSummary only if they improve the lead; otherwise set them to null.',
    '8. Set needsHumanReview to true when material uncertainty remains.',
    '9. Set escalationReason to a short reason when verdict is escalate or when needsHumanReview is true; otherwise set escalationReason to null.',
    '',
    'Required output contract:',
    '- Return every schema field exactly once.',
    '- Do not rename keys.',
    '- Do not wrap the result in markdown or code fences.',
    '',
    'Canonical output example:',
    JSON.stringify(
      {
        verdict: 'reject',
        confidence: 0.22,
        summary:
          'The source is too vague to support a settleable market without more specific evidence.',
        evidence: [],
        needsHumanReview: false,
        recommendedFamilySlug: null,
        recommendedEntitySlug: null,
        duplicateLeadIds: [],
        duplicateMarketIds: [],
        normalizedHeadline: null,
        normalizedSummary: null,
        escalationReason: null,
      },
      null,
      2,
    ),
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
    'recommendedFamilySlug',
    'recommendedEntitySlug',
    'duplicateLeadIds',
    'duplicateMarketIds',
    'normalizedHeadline',
    'normalizedSummary',
    'escalationReason',
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
