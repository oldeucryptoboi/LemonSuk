import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setupApiContext } from '../../../../test/helpers/api-context'

describe('email services', () => {
  const originalAppUrl = process.env.APP_URL
  const originalSendGridApiKey = process.env.SENDGRID_API_KEY
  const originalSendGridFromEmail = process.env.SENDGRID_FROM_EMAIL

  beforeEach(() => {
    delete process.env.SENDGRID_API_KEY
    delete process.env.SENDGRID_FROM_EMAIL
    process.env.APP_URL = 'https://lemonsuk.example'
  })

  afterEach(() => {
    process.env.APP_URL = originalAppUrl
    process.env.SENDGRID_API_KEY = originalSendGridApiKey
    process.env.SENDGRID_FROM_EMAIL = originalSendGridFromEmail
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('returns early when sendgrid is not configured', async () => {
    const email = await import('./email')

    expect(
      await email.sendOwnerLoginLinkEmail({
        loginUrl: '/?owner_session=1',
        ownerEmail: 'owner@example.com',
        expiresAt: '2026-03-18T00:00:00.000Z',
        agentHandles: ['deadlinebot'],
      }),
    ).toBe(false)
    expect(await email.deliverPendingNotificationEmails()).toBe(0)
  })

  it('sends owner links and notification settlements through sendgrid', async () => {
    process.env.SENDGRID_API_KEY = 'sg-key'
    process.env.SENDGRID_FROM_EMAIL = 'alerts@lemonsuk.example'

    const setApiKey = vi.fn()
    const send = vi
      .fn(async () => undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('send failed'))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)

    vi.doMock('@sendgrid/mail', () => ({
      default: {
        setApiKey,
        send,
      },
    }))

    const context = await setupApiContext()
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
          updated_at
        )
        VALUES (
          'agent_1',
          'deadlinebot',
          'Deadline Bot',
          'Owner',
          'OpenAI',
          'Tracks deadline misses.',
          'hash',
          'claim_1',
          'phrase',
          'owner@example.com',
          '2026-03-16T00:00:00.000Z',
          '2026-03-16T00:00:00.000Z',
          '2026-03-16T00:00:00.000Z'
        )
      `,
    )
    await context.pool.query(
      `
        INSERT INTO notifications (
          id,
          user_id,
          market_id,
          bet_id,
          type,
          title,
          body,
          created_at,
          read_at
        )
        VALUES
          (
            'notification_1',
            'agent_1',
            NULL,
            NULL,
            'bet_won',
            'Ticket cashed',
            'First payout.',
            '2026-03-16T00:00:00.000Z',
            NULL
          ),
          (
            'notification_2',
            'agent_1',
            NULL,
            NULL,
            'bet_lost',
            'Ticket busted',
            'Second payout.',
            '2026-03-16T01:00:00.000Z',
            NULL
          )
      `,
    )

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const email = await import('./email')

    expect(
      await email.sendOwnerLoginLinkEmail({
        loginUrl: '/?owner_session=1',
        ownerEmail: 'owner@example.com',
        expiresAt: '2026-03-18T00:00:00.000Z',
        agentHandles: ['deadlinebot', 'creditbot'],
      }),
    ).toBe(true)

    expect(await email.deliverPendingNotificationEmails()).toBe(1)
    expect(await email.deliverPendingNotificationEmails()).toBe(1)
    expect(setApiKey).toHaveBeenCalledWith('sg-key')
    expect(send).toHaveBeenCalledTimes(4)
    expect(consoleError).toHaveBeenCalledTimes(1)

    const deliveries = await context.pool.query(
      'SELECT notification_id FROM notification_email_deliveries ORDER BY notification_id',
    )
    expect(deliveries.rows).toEqual([
      { notification_id: 'notification_1' },
      { notification_id: 'notification_2' },
    ])
  })
})
