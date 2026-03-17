import { z } from 'zod'

import {
  internalPredictionSubmissionReviewResultInputSchema,
  predictionReviewVerdictSchema,
} from '../../../packages/shared/src/types'

export const fetchedSnapshotSchema = z.object({
  finalUrl: z.url(),
  contentType: z.string(),
  snapshotText: z.string(),
  snapshotRef: z.string().nullable(),
})

export const eddieDispatchTaskSchema = z.object({
  runId: z.string(),
  submissionId: z.string(),
  sourceUrl: z.url(),
  snapshotText: z.string(),
  snapshotRef: z.string().nullable(),
})

export const eddieCallbackPayloadSchema = z.object({
  runId: z.string(),
  submissionId: z.string(),
  status: z.enum(['completed', 'failed']),
  verdict: predictionReviewVerdictSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
  summary: z.string().min(12).max(500).optional(),
  evidence: z
    .array(
      z.object({
        url: z.url(),
        excerpt: z.string().min(1).max(500),
      }),
    )
    .optional(),
  needsHumanReview: z.boolean().optional(),
  snapshotRef: z.string().nullable().optional(),
  providerRunId: z.string().optional(),
  errorMessage: z.string().min(3).max(500).optional(),
})

export const normalizedCallbackResultSchema =
  internalPredictionSubmissionReviewResultInputSchema

export type FetchedSnapshot = z.infer<typeof fetchedSnapshotSchema>
export type EddieDispatchTask = z.infer<typeof eddieDispatchTaskSchema>
export type EddieCallbackPayload = z.infer<typeof eddieCallbackPayloadSchema>
export type NormalizedCallbackResult = z.infer<
  typeof normalizedCallbackResultSchema
>
