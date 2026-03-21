import path from 'node:path'

function readRequiredEnv(names: string | string[]): string {
  const candidates = Array.isArray(names) ? names : [names]

  for (const name of candidates) {
    const value = process.env[name]?.trim()
    if (value) {
      return value
    }
  }

  throw new Error(
    `${candidates.join(' or ')} is required for the Claude review agent runner.`,
  )
}

export type ClaudeReviewAgentRunnerConfig = {
  internalApiBaseUrl: string
  internalServiceToken: string
  anthropicApiKey: string
  model: string
  agentKey: string
  maxTurns: number
  maxBudgetUsd: number
  leaseSeconds: number
  workspaceRoot: string
}

export function readClaudeReviewAgentRunnerConfig(): ClaudeReviewAgentRunnerConfig {
  return {
    internalApiBaseUrl: readRequiredEnv([
      'CLAUDE_REVIEW_AGENT_INTERNAL_API_BASE_URL',
      'API_INTERNAL_BASE_URL',
    ]),
    internalServiceToken: readRequiredEnv([
      'CLAUDE_REVIEW_AGENT_INTERNAL_SERVICE_TOKEN',
      'INTERNAL_SERVICE_TOKEN',
    ]),
    anthropicApiKey: readRequiredEnv('ANTHROPIC_API_KEY'),
    model: (process.env.CLAUDE_REVIEW_AGENT_MODEL ?? 'claude-sonnet-4-5').trim(),
    agentKey: (process.env.CLAUDE_REVIEW_AGENT_KEY ?? 'claude-review-default').trim(),
    maxTurns: Number(process.env.CLAUDE_REVIEW_AGENT_MAX_TURNS ?? 8),
    maxBudgetUsd: Number(process.env.CLAUDE_REVIEW_AGENT_MAX_BUDGET_USD ?? 1),
    leaseSeconds: Number(process.env.CLAUDE_REVIEW_AGENT_LEASE_SECONDS ?? 900),
    workspaceRoot: path.resolve(
      process.cwd(),
      process.env.CLAUDE_REVIEW_AGENT_WORKSPACE_ROOT ?? '.claude-agents',
    ),
  }
}
