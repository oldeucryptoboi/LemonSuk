import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const serverApiMocks = vi.hoisted(() => ({
  fetchBoardFamiliesServer: vi.fn(async () => []),
  fetchBoardGroupsServer: vi.fn(async () => []),
  fetchDashboardServer: vi.fn(async () => ({
    stats: { totalMarkets: 1 },
  })),
}))

vi.mock('../src/lib/server-api', () => ({
  fetchBoardFamiliesServer: serverApiMocks.fetchBoardFamiliesServer,
  fetchBoardGroupsServer: serverApiMocks.fetchBoardGroupsServer,
  fetchDashboardServer: serverApiMocks.fetchDashboardServer,
}))

vi.mock('../src/App', () => ({
  default: ({
    initialSnapshot,
  }: {
    initialSnapshot?: { stats?: { totalMarkets?: number } } | undefined
  }) => (
    <div>
      {initialSnapshot ? 'seeded app shell' : 'fallback app shell'}
      <span>{initialSnapshot?.stats?.totalMarkets ?? 0}</span>
    </div>
  ),
}))

import Page from './page'

describe('Page', () => {
  it('renders the server-seeded app shell when dashboard seeding succeeds', async () => {
    render(await Page())

    expect(screen.getByText('seeded app shell')).not.toBeNull()
    expect(screen.getByText('1')).not.toBeNull()
  })

  it('falls back to the client bootstrap path when server seeding fails', async () => {
    serverApiMocks.fetchDashboardServer.mockRejectedValueOnce(new Error('boom'))

    render(await Page())

    expect(screen.getByText('fallback app shell')).not.toBeNull()
    expect(screen.getByText('0')).not.toBeNull()
  })
})
