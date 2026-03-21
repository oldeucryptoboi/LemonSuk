import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { readClaudeReviewAgentRunnerConfig } from './config'

const originalEnv = { ...process.env }

function resetClaudeRunnerEnv() {
  process.env = { ...originalEnv }
  delete process.env.CLAUDE_REVIEW_AGENT_INTERNAL_API_BASE_URL
  delete process.env.API_INTERNAL_BASE_URL
  delete process.env.CLAUDE_REVIEW_AGENT_INTERNAL_SERVICE_TOKEN
  delete process.env.INTERNAL_SERVICE_TOKEN
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.CLAUDE_REVIEW_AGENT_MODEL
  delete process.env.CLAUDE_REVIEW_AGENT_KEY
  delete process.env.CLAUDE_REVIEW_AGENT_MAX_TURNS
  delete process.env.CLAUDE_REVIEW_AGENT_MAX_BUDGET_USD
  delete process.env.CLAUDE_REVIEW_AGENT_LEASE_SECONDS
  delete process.env.CLAUDE_REVIEW_AGENT_WORKSPACE_ROOT
}

describe('readClaudeReviewAgentRunnerConfig', () => {
  afterEach(() => {
    resetClaudeRunnerEnv()
  })

  it('reads explicit runner configuration and derived defaults', () => {
    resetClaudeRunnerEnv()
    process.env.CLAUDE_REVIEW_AGENT_INTERNAL_API_BASE_URL =
      'https://lemonsuk.internal/api/v1'
    process.env.CLAUDE_REVIEW_AGENT_INTERNAL_SERVICE_TOKEN = 'service-token'
    process.env.ANTHROPIC_API_KEY = 'anthropic-key'

    expect(readClaudeReviewAgentRunnerConfig()).toEqual({
      internalApiBaseUrl: 'https://lemonsuk.internal/api/v1',
      internalServiceToken: 'service-token',
      anthropicApiKey: 'anthropic-key',
      model: 'claude-sonnet-4-5',
      agentKey: 'claude-review-default',
      maxTurns: 8,
      maxBudgetUsd: 1,
      leaseSeconds: 900,
      workspaceRoot: path.resolve(process.cwd(), '.claude-agents'),
    })
  })

  it('supports shared env aliases and explicit numeric overrides', () => {
    resetClaudeRunnerEnv()
    process.env.API_INTERNAL_BASE_URL = 'http://localhost:8787/api/v1'
    process.env.INTERNAL_SERVICE_TOKEN = 'internal-token'
    process.env.ANTHROPIC_API_KEY = 'anthropic-key'
    process.env.CLAUDE_REVIEW_AGENT_MODEL = 'claude-opus-4-1'
    process.env.CLAUDE_REVIEW_AGENT_KEY = 'review-ops'
    process.env.CLAUDE_REVIEW_AGENT_MAX_TURNS = '12'
    process.env.CLAUDE_REVIEW_AGENT_MAX_BUDGET_USD = '2.5'
    process.env.CLAUDE_REVIEW_AGENT_LEASE_SECONDS = '1200'
    process.env.CLAUDE_REVIEW_AGENT_WORKSPACE_ROOT = 'tmp/review-workspace'

    expect(readClaudeReviewAgentRunnerConfig()).toEqual({
      internalApiBaseUrl: 'http://localhost:8787/api/v1',
      internalServiceToken: 'internal-token',
      anthropicApiKey: 'anthropic-key',
      model: 'claude-opus-4-1',
      agentKey: 'review-ops',
      maxTurns: 12,
      maxBudgetUsd: 2.5,
      leaseSeconds: 1200,
      workspaceRoot: path.resolve(process.cwd(), 'tmp/review-workspace'),
    })
  })

  it('fails loudly when required config is missing', () => {
    resetClaudeRunnerEnv()

    expect(() => readClaudeReviewAgentRunnerConfig()).toThrow(
      'CLAUDE_REVIEW_AGENT_INTERNAL_API_BASE_URL or API_INTERNAL_BASE_URL is required for the Claude review agent runner.',
    )

    process.env.CLAUDE_REVIEW_AGENT_INTERNAL_API_BASE_URL =
      'http://localhost:8787/api/v1'
    expect(() => readClaudeReviewAgentRunnerConfig()).toThrow(
      'CLAUDE_REVIEW_AGENT_INTERNAL_SERVICE_TOKEN or INTERNAL_SERVICE_TOKEN is required for the Claude review agent runner.',
    )

    process.env.CLAUDE_REVIEW_AGENT_INTERNAL_SERVICE_TOKEN = 'service-token'
    expect(() => readClaudeReviewAgentRunnerConfig()).toThrow(
      'ANTHROPIC_API_KEY is required for the Claude review agent runner.',
    )
  })
})
