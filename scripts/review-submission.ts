import { reviewPredictionSubmission } from '../apps/api/src/services/submission-queue'

type Decision = 'accepted' | 'rejected'

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function fail(message: string): never {
  throw new Error(
    `${message}\n\nUsage:\n` +
      '  npm run review-submission -- --submission-id <id> --decision <accepted|rejected> [--market-id <market-id>] [--note <text>]',
  )
}

const submissionId = readFlag('--submission-id')
const decision = readFlag('--decision') as Decision | undefined
const linkedMarketId = readFlag('--market-id')
const reviewNotes = readFlag('--note')

if (!submissionId) {
  fail('Missing --submission-id.')
}

if (decision !== 'accepted' && decision !== 'rejected') {
  fail('Missing or invalid --decision.')
}

if (decision === 'accepted' && !linkedMarketId) {
  fail('Accepted submissions require --market-id.')
}

const reviewed = await reviewPredictionSubmission({
  submissionId,
  decision,
  linkedMarketId,
  reviewNotes,
})

console.log(JSON.stringify(reviewed, null, 2))
