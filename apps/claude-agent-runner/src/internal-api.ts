import {
  claudeReviewAgentClaimNextResponseSchema,
  claudeReviewAgentCompleteRunResponseSchema,
  claudeReviewAgentFailRunResponseSchema,
  claudeReviewAgentRunEventSchema,
} from '../../../packages/shared/src/types'
import type {
  ClaudeReviewAgentClaimNextInput,
  ClaudeReviewAgentClaimNextResponse,
  ClaudeReviewAgentCompleteRunInput,
  ClaudeReviewAgentFailRunInput,
  ClaudeReviewAgentRunEvent,
  ClaudeReviewAgentRunEventInput,
} from '../../../packages/shared/src/types'

import type { ClaudeReviewAgentRunnerConfig } from './config'

type InternalRequestOptions = {
  method: 'POST'
  body: unknown
  fetchImpl?: typeof fetch
}

async function requestInternalApi<T>(
  config: ClaudeReviewAgentRunnerConfig,
  path: string,
  parse: (payload: unknown) => T,
  options: InternalRequestOptions,
): Promise<T> {
  const response = await (options.fetchImpl ?? fetch)(`${config.internalApiBaseUrl}${path}`, {
    method: options.method,
    headers: {
      Authorization: `Bearer ${config.internalServiceToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(options.body),
  })

  const payload = (await response.json().catch(() => null)) as unknown
  if (!response.ok) {
    const message =
      payload &&
      typeof payload === 'object' &&
      'message' in payload &&
      typeof payload.message === 'string'
        ? payload.message
        : `Claude review internal API request failed with status ${response.status}.`
    throw new Error(message)
  }

  return parse(payload)
}

export async function claimNextClaudeReviewLead(
  config: ClaudeReviewAgentRunnerConfig,
  input: ClaudeReviewAgentClaimNextInput,
  fetchImpl?: typeof fetch,
): Promise<ClaudeReviewAgentClaimNextResponse> {
  return requestInternalApi(
    config,
    '/internal/claude-review-agent/claim-next',
    (payload) => claudeReviewAgentClaimNextResponseSchema.parse(payload),
    {
      method: 'POST',
      body: input,
      fetchImpl,
    },
  )
}

export async function appendClaudeReviewRunEvent(
  config: ClaudeReviewAgentRunnerConfig,
  runId: string,
  input: ClaudeReviewAgentRunEventInput,
  fetchImpl?: typeof fetch,
): Promise<ClaudeReviewAgentRunEvent> {
  return requestInternalApi(
    config,
    `/internal/claude-review-agent/runs/${runId}/events`,
    (payload) => claudeReviewAgentRunEventSchema.parse(payload),
    {
      method: 'POST',
      body: input,
      fetchImpl,
    },
  )
}

export async function completeClaudeReviewRun(
  config: ClaudeReviewAgentRunnerConfig,
  runId: string,
  input: ClaudeReviewAgentCompleteRunInput,
  fetchImpl?: typeof fetch,
): Promise<ReturnType<typeof claudeReviewAgentCompleteRunResponseSchema.parse>> {
  return requestInternalApi(
    config,
    `/internal/claude-review-agent/runs/${runId}/complete`,
    (payload) => claudeReviewAgentCompleteRunResponseSchema.parse(payload),
    {
      method: 'POST',
      body: input,
      fetchImpl,
    },
  )
}

export async function failClaudeReviewRun(
  config: ClaudeReviewAgentRunnerConfig,
  runId: string,
  input: ClaudeReviewAgentFailRunInput,
  fetchImpl?: typeof fetch,
): Promise<ReturnType<typeof claudeReviewAgentFailRunResponseSchema.parse>> {
  return requestInternalApi(
    config,
    `/internal/claude-review-agent/runs/${runId}/fail`,
    (payload) => claudeReviewAgentFailRunResponseSchema.parse(payload),
    {
      method: 'POST',
      body: input,
      fetchImpl,
    },
  )
}
