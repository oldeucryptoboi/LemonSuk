import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('claude review agent cli', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    process.exitCode = undefined
  })

  afterEach(() => {
    vi.unmock('./config')
    vi.unmock('./review-agent')
    process.exitCode = undefined
  })

  it('prints a no-work message when no pending leads are available', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const readConfig = vi.fn(() => ({
      internalApiBaseUrl: 'http://localhost:8787/api/v1',
      internalServiceToken: 'token',
      anthropicApiKey: 'anthropic-key',
      model: 'claude-sonnet-4-5',
      agentKey: 'review-default',
      maxTurns: 8,
      maxBudgetUsd: 1,
      leaseSeconds: 900,
      workspaceRoot: '/tmp/claude-review',
    }))
    const runClaudeReviewAgent = vi.fn().mockResolvedValue({
      claimed: false,
    })

    vi.doMock('./config', () => ({
      readClaudeReviewAgentRunnerConfig: readConfig,
    }))
    vi.doMock('./review-agent', () => ({
      runClaudeReviewAgent,
    }))

    await import('./cli')
    await vi.dynamicImportSettled()

    expect(logSpy).toHaveBeenCalledWith(
      'No pending leads available for the Claude review agent.',
    )
    expect(errorSpy).not.toHaveBeenCalled()
    expect(process.exitCode).toBeUndefined()
  })

  it('prints the run summary json when a lead is reviewed', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.doMock('./config', () => ({
      readClaudeReviewAgentRunnerConfig: vi.fn(() => ({
        internalApiBaseUrl: 'http://localhost:8787/api/v1',
        internalServiceToken: 'token',
        anthropicApiKey: 'anthropic-key',
        model: 'claude-sonnet-4-5',
        agentKey: 'review-default',
        maxTurns: 8,
        maxBudgetUsd: 1,
        leaseSeconds: 900,
        workspaceRoot: '/tmp/claude-review',
      })),
    }))
    vi.doMock('./review-agent', () => ({
      runClaudeReviewAgent: vi.fn().mockResolvedValue({
        claimed: true,
        run: {
          id: 'claude_run_1',
          leadId: 'lead_1',
        },
        reviewResult: {
          verdict: 'accept',
          confidence: 0.81,
        },
      }),
    }))

    await import('./cli')
    await vi.dynamicImportSettled()

    expect(logSpy).toHaveBeenCalledWith(
      JSON.stringify(
        {
          runId: 'claude_run_1',
          leadId: 'lead_1',
          verdict: 'accept',
          confidence: 0.81,
        },
        null,
        2,
      ),
    )
  })

  it('writes the error and exits nonzero when the runner fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})

    vi.doMock('./config', () => ({
      readClaudeReviewAgentRunnerConfig: vi.fn(() => ({
        internalApiBaseUrl: 'http://localhost:8787/api/v1',
        internalServiceToken: 'token',
        anthropicApiKey: 'anthropic-key',
        model: 'claude-sonnet-4-5',
        agentKey: 'review-default',
        maxTurns: 8,
        maxBudgetUsd: 1,
        leaseSeconds: 900,
        workspaceRoot: '/tmp/claude-review',
      })),
    }))
    vi.doMock('./review-agent', () => ({
      runClaudeReviewAgent: vi.fn().mockRejectedValue(new Error('Runner exploded.')),
    }))

    await import('./cli')
    await vi.dynamicImportSettled()

    expect(errorSpy).toHaveBeenCalledWith('Runner exploded.')
    expect(process.exitCode).toBe(1)
  })

  it('writes the generic failure message for non-error runner failures', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})

    vi.doMock('./config', () => ({
      readClaudeReviewAgentRunnerConfig: vi.fn(() => ({
        internalApiBaseUrl: 'http://localhost:8787/api/v1',
        internalServiceToken: 'token',
        anthropicApiKey: 'anthropic-key',
        model: 'claude-sonnet-4-5',
        agentKey: 'review-default',
        maxTurns: 8,
        maxBudgetUsd: 1,
        leaseSeconds: 900,
        workspaceRoot: '/tmp/claude-review',
      })),
    }))
    vi.doMock('./review-agent', () => ({
      runClaudeReviewAgent: vi.fn().mockRejectedValue('string failure'),
    }))

    await import('./cli')
    await vi.dynamicImportSettled()

    expect(errorSpy).toHaveBeenCalledWith('Claude review agent run failed.')
    expect(process.exitCode).toBe(1)
  })
})
