import { afterEach, describe, expect, it, vi } from 'vitest'

describe('identity service branch coverage', () => {
  afterEach(() => {
    vi.doUnmock('./database')
    vi.doUnmock('./avatar-storage')
    vi.resetModules()
  })

  it('deletes a newly managed avatar when profile persistence fails after ingestion', async () => {
    const selectQuery = vi.fn(async () => ({
      rows: [
        {
          id: 'agent_1',
          handle: 'cleanup_bot',
          display_name: 'Cleanup Bot',
          avatar_url: 'https://cdn.lemonsuk.test/agent-avatars/cleanup_bot/current.png',
          owner_name: 'Owner',
          model_provider: 'OpenAI',
          biography: 'Cleanup bot biography.',
          api_key_hash: 'ignored',
          claim_token: 'claim_cleanup',
          verification_phrase: 'phrase_cleanup',
          owner_email: null,
          owner_verified_at: new Date('2026-03-22T00:00:00.000Z'),
          owner_verification_status: 'verified',
          owner_verification_code: null,
          owner_verification_x_handle: null,
          owner_verification_x_user_id: null,
          owner_verification_x_connected_at: null,
          owner_verification_tweet_url: null,
          owner_verification_started_at: null,
          promo_credits_balance: 0,
          earned_credits_balance: 0,
          credit_season: '2026-Q1',
          season_promo_floor_credits: 100,
          zero_balance_refill_credits: 20,
          next_promo_refill_at: null,
          signup_bonus_granted_at: null,
          created_at: new Date('2026-03-21T00:00:00.000Z'),
          updated_at: new Date('2026-03-21T00:00:00.000Z'),
        },
      ],
    }))
    const updateQuery = vi.fn(async () => {
      throw new Error('profile update write failed')
    })
    const deleteManagedAvatarUrl = vi.fn(async () => undefined)

    vi.doMock('./database', () => ({
      withDatabaseClient: async (
        callback: (client: { query: typeof selectQuery }) => Promise<unknown>,
      ) => callback({ query: selectQuery }),
      withDatabaseTransaction: async (
        callback: (client: { query: typeof updateQuery }) => Promise<unknown>,
      ) => callback({ query: updateQuery }),
    }))
    vi.doMock('./avatar-storage', () => ({
      ingestAgentAvatarFromUrl: vi.fn(
        async () =>
          'https://cdn.lemonsuk.test/agent-avatars/cleanup_bot/new.png',
      ),
      deleteManagedAvatarUrl,
      isManagedAvatarUrl: vi.fn(() => true),
    }))

    const { updateAgentProfile } = await import('./identity')

    await expect(
      updateAgentProfile('agent-api-key', {
        avatarUrl: 'https://images.example.com/new.png',
      }),
    ).rejects.toThrow('profile update write failed')

    expect(deleteManagedAvatarUrl).toHaveBeenCalledWith(
      'https://cdn.lemonsuk.test/agent-avatars/cleanup_bot/new.png',
    )
  })
})
