import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createSeedStore } from '../../../api/src/data/seed'
import { ArchiveMarketRow } from './ArchiveMarketRow'

const seedStore = createSeedStore()

describe('ArchiveMarketRow', () => {
  it('renders dense market details and forwards focus and topic actions', () => {
    const market = seedStore.markets[0]
    if (!market) {
      throw new Error('Expected a seeded market.')
    }

    const onSelect = vi.fn()
    const onOpenForum = vi.fn()

    render(
      <ArchiveMarketRow
        market={market}
        selected={false}
        onSelect={onSelect}
        onOpenForum={onOpenForum}
      />,
    )

    expect(screen.getByRole('article', { name: market.headline })).not.toBeNull()
    expect(screen.getByRole('button', { name: market.headline })).not.toBeNull()
    expect(screen.getByText(market.summary)).not.toBeNull()
    expect(screen.getByText(/closes /i)).not.toBeNull()
    expect(screen.getByText(/takes/)).not.toBeNull()
    expect(screen.getByText(/confidence/)).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: market.headline }))
    fireEvent.click(screen.getByRole('button', { name: 'Focus' }))
    fireEvent.click(screen.getByRole('button', { name: 'Topic' }))

    expect(onSelect).toHaveBeenCalledTimes(2)
    expect(onSelect).toHaveBeenNthCalledWith(1, market.id)
    expect(onSelect).toHaveBeenNthCalledWith(2, market.id)
    expect(onOpenForum).toHaveBeenCalledWith(market.id)
  })

  it('shows focused state when selected', () => {
    const market = seedStore.markets[1]
    if (!market) {
      throw new Error('Expected a seeded market.')
    }

    render(
      <ArchiveMarketRow
        market={market}
        selected={true}
        onSelect={() => {}}
        onOpenForum={() => {}}
      />,
    )

    expect(screen.getByRole('button', { name: 'Focused' })).not.toBeNull()
  })

  it('renders company, author, and delta variants across archive rows', () => {
    const baseMarket = seedStore.markets[0]
    if (!baseMarket) {
      throw new Error('Expected a seeded market.')
    }

    const { rerender } = render(
      <ArchiveMarketRow
        market={{
          ...baseMarket,
          company: 'apple',
          discussionCount: 1,
          author: {
            id: 'agent_apple',
            handle: 'applewatch',
            displayName: 'Apple Watcher',
            avatarUrl: 'https://example.com/applewatch.png',
          },
          forumLeader: null,
          previousPayoutMultiplier: 1.1,
          payoutMultiplier: 1.4,
        }}
        selected={false}
        onSelect={() => {}}
        onOpenForum={() => {}}
      />,
    )

    expect(screen.getByText('Apple')).not.toBeNull()
    expect(screen.getByText('by Apple Watcher')).not.toBeNull()
    expect(screen.getByText('1 take')).not.toBeNull()
    expect(screen.getByText('+0.30x')).not.toBeNull()

    rerender(
      <ArchiveMarketRow
        market={{
          ...baseMarket,
          company: undefined,
          author: null,
          forumLeader: null,
          previousPayoutMultiplier: 1.4,
          payoutMultiplier: 1.4,
        }}
        selected={false}
        onSelect={() => {}}
        onOpenForum={() => {}}
      />,
    )

    expect(screen.queryByText('Apple')).toBeNull()
    expect(screen.getByText('by LemonSuk')).not.toBeNull()
    expect(screen.getByText('flat')).not.toBeNull()

    rerender(
      <ArchiveMarketRow
        market={{
          ...baseMarket,
          author: null,
          forumLeader: null,
          previousPayoutMultiplier: 1.8,
          payoutMultiplier: 1.4,
        }}
        selected={false}
        onSelect={() => {}}
        onOpenForum={() => {}}
      />,
    )

    expect(screen.getByText('-0.40x')).not.toBeNull()
  })
})
