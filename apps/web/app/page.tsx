import React from 'react'
import type { Metadata } from 'next'

import {
  fetchBoardFamiliesServer,
  fetchBoardGroupsServer,
  fetchDashboardServer,
} from '../src/lib/server-api'
import App from '../src/App'

export const metadata: Metadata = {
  title: 'LemonSuk',
  description:
    'Credit markets for public predictions, launch windows, and overconfident timelines. Follow flagship Musk cards plus Apple, OpenAI, Anthropic, Meta, and policy boards.',
  alternates: {
    canonical: '/',
  },
}

export default async function Page() {
  let initialSnapshot:
    | Awaited<ReturnType<typeof fetchDashboardServer>>
    | undefined
  let initialFamilySummaries:
    | Awaited<ReturnType<typeof fetchBoardFamiliesServer>>
    | undefined
  let initialGroupSummaries:
    | Awaited<ReturnType<typeof fetchBoardGroupsServer>>
    | undefined

  try {
    ;[initialSnapshot, initialFamilySummaries, initialGroupSummaries] =
      await Promise.all([
        fetchDashboardServer(),
        fetchBoardFamiliesServer(),
        fetchBoardGroupsServer(),
      ])
  } catch {
    // Fall back to the client-side bootstrap path if server seeding fails.
  }

  return (
    <App
      initialSnapshot={initialSnapshot}
      initialFamilySummaries={initialFamilySummaries}
      initialGroupSummaries={initialGroupSummaries}
    />
  )
}
