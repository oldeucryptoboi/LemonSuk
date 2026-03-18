import { readPendingPredictionLeads } from '../apps/api/src/services/lead-intake'

const familySlugs = new Set([
  'ai_launch',
  'product_ship_date',
  'earnings_guidance',
  'policy_promise',
  'ceo_claim',
] as const)

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function fail(message: string): never {
  throw new Error(
    `${message}\n\nUsage:\n` +
      '  npm run list-pending-leads -- [--limit <count>] [--lead-type <structured_agent_lead|human_url_lead>] [--family <slug>] [--entity <slug>] [--source-domain <domain>]',
  )
}

const limitFlag = readFlag('--limit')
const leadType = readFlag('--lead-type')
const familySlugFlag = readFlag('--family')
const entitySlug = readFlag('--entity')
const sourceDomain = readFlag('--source-domain')
const parsedLimit =
  limitFlag === undefined ? 25 : Number.parseInt(limitFlag, 10)

if (!Number.isFinite(parsedLimit) || parsedLimit < 1) {
  fail('Missing or invalid --limit.')
}

if (
  leadType !== undefined &&
  leadType !== 'structured_agent_lead' &&
  leadType !== 'human_url_lead'
) {
  fail('Missing or invalid --lead-type.')
}

if (familySlugFlag !== undefined && !familySlugs.has(familySlugFlag as never)) {
  fail('Missing or invalid --family.')
}

const pendingLeads = await readPendingPredictionLeads({
  limit: parsedLimit,
  leadType,
  familySlug: familySlugFlag as
    | 'ai_launch'
    | 'product_ship_date'
    | 'earnings_guidance'
    | 'policy_promise'
    | 'ceo_claim'
    | undefined,
  entitySlug,
  sourceDomain,
})

console.log(JSON.stringify(pendingLeads, null, 2))
