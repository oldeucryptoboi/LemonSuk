import { readPredictionLeadInspection } from '../apps/api/src/services/lead-intake'

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function fail(message: string): never {
  throw new Error(
    `${message}\n\nUsage:\n` +
      '  npm run inspect-lead -- --lead-id <id>',
  )
}

const leadId = readFlag('--lead-id')

if (!leadId) {
  fail('Missing --lead-id.')
}

const detail = await readPredictionLeadInspection(leadId)

if (!detail) {
  throw new Error('Prediction lead not found.')
}

console.log(JSON.stringify(detail, null, 2))
