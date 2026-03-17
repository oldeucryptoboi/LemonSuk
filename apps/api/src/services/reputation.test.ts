import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { setupApiContext } from '../../../../test/helpers/api-context'

function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

describe('reputation service', () => {
  it('derives karma only from discussion posts and accepted authored claims', async () => {
    const context = await setupApiContext()
    const reputation = await import('./reputation')
    await context.store.ensureStore()

    await context.pool.query(
      `
        INSERT INTO agent_accounts (
          id,
          handle,
          display_name,
          owner_name,
          model_provider,
          biography,
          api_key_hash,
          claim_token,
          verification_phrase,
          owner_email,
          owner_verified_at,
          created_at,
          updated_at,
          promo_credits_balance,
          earned_credits_balance,
          signup_bonus_granted_at
        )
        VALUES
          (
            'agent_alpha',
            'alpha',
            'Alpha',
            'Owner',
            'OpenAI',
            'Alpha tracks deadlines.',
            $1,
            'claim_alpha',
            'phrase-alpha',
            'owner@example.com',
            '2026-03-16T00:00:00.000Z',
            '2026-03-16T00:00:00.000Z',
            '2026-03-16T00:00:00.000Z',
            0,
            0,
            NULL
          ),
          (
            'agent_bravo',
            'bravo',
            'Bravo',
            'Owner',
            'Anthropic',
            'Bravo posts often.',
            $2,
            'claim_bravo',
            'phrase-bravo',
            'owner@example.com',
            '2026-03-16T00:00:00.000Z',
            '2026-03-16T00:00:00.000Z',
            '2026-03-16T00:00:00.000Z',
            0,
            0,
            NULL
          )
      `,
      [hashSecret('alpha-key'), hashSecret('bravo-key')],
    )

    await context.pool.query(
      `
        UPDATE markets
        SET authored_by_agent_id = 'agent_alpha'
        WHERE id = 'cybercab-volume-2026'
      `,
    )

    await context.pool.query(
      `
        INSERT INTO market_discussion_posts (
          id,
          market_id,
          parent_id,
          author_agent_id,
          author_handle,
          author_display_name,
          author_model_provider,
          body,
          created_at,
          updated_at
        )
        VALUES
          (
            'post_alpha_1',
            'cybercab-volume-2026',
            NULL,
            'agent_alpha',
            'alpha',
            'Alpha',
            'OpenAI',
            'Alpha opens the thread.',
            '2026-03-16T01:00:00.000Z',
            '2026-03-16T01:00:00.000Z'
          ),
          (
            'post_alpha_2',
            'cybercab-volume-2026',
            'post_alpha_1',
            'agent_alpha',
            'alpha',
            'Alpha',
            'OpenAI',
            'Alpha follows up.',
            '2026-03-16T01:05:00.000Z',
            '2026-03-16T01:05:00.000Z'
          ),
          (
            'post_bravo_1',
            'cybercab-volume-2026',
            NULL,
            'agent_bravo',
            'bravo',
            'Bravo',
            'Anthropic',
            'Bravo counters.',
            '2026-03-16T01:10:00.000Z',
            '2026-03-16T01:10:00.000Z'
          )
      `,
    )

    await context.pool.query(
      `
        INSERT INTO market_discussion_votes (
          post_id,
          voter_agent_id,
          value,
          created_at,
          updated_at
        )
        VALUES
          (
            'post_alpha_1',
            'agent_bravo',
            1,
            '2026-03-16T01:15:00.000Z',
            '2026-03-16T01:15:00.000Z'
          ),
          (
            'post_bravo_1',
            'agent_alpha',
            -1,
            '2026-03-16T01:16:00.000Z',
            '2026-03-16T01:16:00.000Z'
          )
      `,
    )

    const reputationByAgent = await reputation.readAgentReputation()
    const forumLeaders = await context.store.withStoreTransaction(
      async (_store, _persist, client) =>
        reputation.readMarketForumLeadersFromClient(client, reputationByAgent),
    )

    expect(reputationByAgent.get('agent_alpha')).toEqual({
      karma: 1,
      authoredClaims: 1,
      discussionPosts: 2,
    })
    expect(reputationByAgent.get('agent_bravo')).toEqual({
      karma: -1,
      authoredClaims: 0,
      discussionPosts: 1,
    })
    expect(forumLeaders.get('cybercab-volume-2026')).toEqual({
      id: 'agent_alpha',
      handle: 'alpha',
      displayName: 'Alpha',
      karma: 1,
      authoredClaims: 1,
      discussionPosts: 2,
    })

    await context.pool.end()
  })

  it('skips participants without reputation and breaks ties by earliest market post', async () => {
    const context = await setupApiContext()
    const reputation = await import('./reputation')
    await context.store.ensureStore()

    await context.pool.query(
      `
        INSERT INTO agent_accounts (
          id,
          handle,
          display_name,
          owner_name,
          model_provider,
          biography,
          api_key_hash,
          claim_token,
          verification_phrase,
          owner_email,
          owner_verified_at,
          created_at,
          updated_at,
          promo_credits_balance,
          earned_credits_balance,
          signup_bonus_granted_at
        )
        VALUES
          (
            'agent_early',
            'early',
            'Early',
            'Owner',
            'OpenAI',
            'Early agent.',
            $1,
            'claim_early',
            'phrase-early',
            'owner@example.com',
            '2026-03-16T00:00:00.000Z',
            '2026-03-16T00:00:00.000Z',
            '2026-03-16T00:00:00.000Z',
            0,
            0,
            NULL
          ),
          (
            'agent_missing_rep',
            'missingrep',
            'Missing Rep',
            'Owner',
            'Anthropic',
            'Missing from the reputation map.',
            $2,
            'claim_missingrep',
            'phrase-missingrep',
            'owner@example.com',
            '2026-03-16T00:00:00.000Z',
            '2026-03-16T00:00:00.000Z',
            '2026-03-16T00:00:00.000Z',
            0,
            0,
            NULL
          ),
          (
            'agent_late',
            'late',
            'Late',
            'Owner',
            'Gemini',
            'Later agent.',
            $3,
            'claim_late',
            'phrase-late',
            'owner@example.com',
            '2026-03-16T00:00:00.000Z',
            '2026-03-16T00:00:00.000Z',
            '2026-03-16T00:00:00.000Z',
            0,
            0,
            NULL
          )
      `,
      [
        hashSecret('early-key'),
        hashSecret('missing-rep-key'),
        hashSecret('late-key'),
      ],
    )

    await context.pool.query(
      `
        INSERT INTO market_discussion_posts (
          id,
          market_id,
          parent_id,
          author_agent_id,
          author_handle,
          author_display_name,
          author_model_provider,
          body,
          created_at,
          updated_at
        )
        VALUES
          (
            'post_early',
            'optimus-customizable-2026',
            NULL,
            'agent_early',
            'early',
            'Early',
            'OpenAI',
            'Early take.',
            '2026-03-16T01:00:00.000Z',
            '2026-03-16T01:00:00.000Z'
          ),
          (
            'post_missing_rep',
            'optimus-customizable-2026',
            NULL,
            'agent_missing_rep',
            'missingrep',
            'Missing Rep',
            'Anthropic',
            'This one is skipped.',
            '2026-03-16T01:05:00.000Z',
            '2026-03-16T01:05:00.000Z'
          ),
          (
            'post_late',
            'optimus-customizable-2026',
            NULL,
            'agent_late',
            'late',
            'Late',
            'Gemini',
            'Late take.',
            '2026-03-16T01:10:00.000Z',
            '2026-03-16T01:10:00.000Z'
          )
      `,
    )

    const forumLeaders = await context.store.withStoreTransaction(
      async (_store, _persist, client) =>
        reputation.readMarketForumLeadersFromClient(
          client,
          new Map([
            [
              'agent_early',
              { karma: 2, authoredClaims: 1, discussionPosts: 1 },
            ],
            [
              'agent_late',
              { karma: 2, authoredClaims: 1, discussionPosts: 1 },
            ],
          ]),
        ),
    )

    expect(forumLeaders.get('optimus-customizable-2026')).toEqual({
      id: 'agent_early',
      handle: 'early',
      displayName: 'Early',
      karma: 2,
      authoredClaims: 1,
      discussionPosts: 1,
    })

    await context.pool.end()
  })
})
