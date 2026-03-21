import { readClaudeReviewAgentRunnerConfig } from './config'
import { runClaudeReviewAgent } from './review-agent'

async function main(): Promise<void> {
  const config = readClaudeReviewAgentRunnerConfig()
  const outcome = await runClaudeReviewAgent({ config })

  if (!outcome.claimed) {
    console.log('No pending leads available for the Claude review agent.')
    return
  }

  console.log(
    JSON.stringify(
      {
        runId: outcome.run.id,
        leadId: outcome.run.leadId,
        verdict: outcome.reviewResult.verdict,
        confidence: outcome.reviewResult.confidence,
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Claude review agent run failed.',
  )
  process.exitCode = 1
})
