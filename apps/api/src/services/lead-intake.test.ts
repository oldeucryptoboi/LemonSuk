import { describe, expect, it, vi } from 'vitest'

import { setupApiContext } from '../../../../test/helpers/api-context'

function solveCaptcha(prompt: string): string {
  const match = prompt.match(/slug:\s+([a-z]+-[a-z]+)-(\d+)\+(\d+)\./i)

  if (!match) {
    throw new Error(`Could not solve captcha prompt: ${prompt}`)
  }

  return `${match[1]}-${Number(match[2]) + Number(match[3])}`
}

async function createCaptchaAnswer(
  context: Awaited<ReturnType<typeof setupApiContext>>,
) {
  const challenge = await context.identity.createCaptchaChallenge()

  return {
    captchaChallengeId: challenge.id,
    captchaAnswer: solveCaptcha(challenge.prompt),
  }
}

async function registerAgent(
  context: Awaited<ReturnType<typeof setupApiContext>>,
  handle: string,
  displayName: string,
) {
  const challenge = await context.identity.createCaptchaChallenge()

  return context.identity.registerAgent({
    handle,
    displayName,
    ownerName: 'Owner',
    modelProvider: 'OpenAI',
    biography: 'Lead intake test agent.',
    captchaChallengeId: challenge.id,
    captchaAnswer: solveCaptcha(challenge.prompt),
  })
}

describe('lead intake service', () => {
  it('reads unified pending leads across agent and human submission paths', async () => {
    const context = await setupApiContext()
    const queue = await import('./submission-queue')
    const reviewSubmissions = await import('./human-review-submissions')
    const leadIntake = await import('./lead-intake')

    const registration = await registerAgent(
      context,
      'lead_reader_bot',
      'Lead Reader Bot',
    )

    const agentSubmission = await queue.enqueuePredictionSubmission(
      registration.agent,
      {
        headline: 'OpenAI ships GPT-6 by September 30, 2027',
        subject: 'GPT-6 ship date',
        category: 'ai',
        promisedDate: '2027-09-30T23:59:59.000Z',
        summary:
          'A structured agent lead claiming OpenAI ships GPT-6 before the Q3 2027 close.',
        sourceUrl: 'https://example.com/gpt-6-roadmap',
        tags: ['openai', 'gpt-6'],
      },
    )

    const humanSubmission = await reviewSubmissions.createHumanReviewSubmission(
      {
        sourceUrl: 'https://x.com/elonmusk/status/1234567890',
        note: 'Possible public claim worth offline review.',
        ...(await createCaptchaAnswer(context)),
      },
      'owner@example.com',
      new Date('2026-03-18T12:00:00.000Z'),
    )

    const agentLeadId = agentSubmission.leadId
    const humanLeadId = humanSubmission.leadId

    expect(agentLeadId).toBeTruthy()
    expect(humanLeadId).toBeTruthy()

    const [pendingQueue, agentLead, humanLead] = await Promise.all([
      leadIntake.readPendingPredictionLeads(),
      leadIntake.readPredictionLeadById(agentLeadId!),
      leadIntake.readPredictionLeadById(humanLeadId!),
    ])

    expect(pendingQueue.pendingCount).toBe(2)
    expect(pendingQueue.items.map((lead) => lead.id)).toEqual(
      expect.arrayContaining([agentLeadId!, humanLeadId!]),
    )
    expect(agentLead).toEqual(
      expect.objectContaining({
        id: agentLeadId,
        leadType: 'structured_agent_lead',
        familySlug: 'ai_launch',
        primaryEntitySlug: 'openai',
        legacyAgentSubmissionId: null,
        status: 'pending',
      }),
    )
    expect(humanLead).toEqual(
      expect.objectContaining({
        id: humanLeadId,
        leadType: 'human_url_lead',
        submittedByOwnerEmail: 'owner@example.com',
        primaryEntitySlug: 'x',
        legacyHumanSubmissionId: null,
        status: 'pending',
      }),
    )

    await context.pool.end()
  })

  it('supports direct lead creation overrides, entity inference variants, and legacy reads', async () => {
    const context = await setupApiContext()
    const database = await import('./database')
    const leadIntake = await import('./lead-intake')
    await context.store.ensureStore()

    const registration = await registerAgent(
      context,
      'lead_inference_bot',
      'Lead Inference Bot',
    )

    const agentCases = [
      {
        submissionId: 'submission_anthropic',
        headline: 'Anthropic ships Claude Edge by June 30, 2027',
        summary: 'Anthropic says Claude Edge ships before the June 2027 close.',
        sourceUrl: 'https://example.com/anthropic-claim',
        tags: ['anthropic'],
        expectedEntity: 'anthropic',
      },
      {
        submissionId: 'submission_apple',
        headline: 'Apple ships iPhone Fold by September 30, 2027',
        summary: 'Apple is expected to launch iPhone Fold before Q3 closes.',
        sourceUrl: 'https://example.com/apple-claim',
        tags: ['apple'],
        expectedEntity: 'apple',
      },
      {
        submissionId: 'submission_xai',
        headline: 'xAI ships Grok Voice by July 31, 2027',
        summary: 'xAI says Grok Voice lands before the July 2027 deadline.',
        sourceUrl: 'https://example.com/xai-claim',
        tags: ['grok'],
        expectedEntity: 'xai',
      },
      {
        submissionId: 'submission_solarcity',
        headline: 'SolarCity legacy roof backlog clears by December 31, 2027',
        summary:
          'A legacy SolarCity claim remains relevant through the 2027 year-end.',
        sourceUrl: 'https://example.com/solarcity-claim',
        tags: ['solarcity'],
        expectedEntity: 'solarcity',
      },
      {
        submissionId: 'submission_meta',
        headline: 'Meta ships persona memory by May 31, 2027',
        summary: 'Meta says persona memory launches before the May 2027 close.',
        sourceUrl: 'https://example.com/meta-claim',
        tags: ['facebook'],
        expectedEntity: 'meta',
      },
    ] as const

    const result = await database.withDatabaseTransaction(async (client) => {
      const directAgentLeads = []

      for (const [index, agentCase] of agentCases.entries()) {
        await client.query(
          `
            INSERT INTO agent_prediction_submissions (
              id,
              submitted_by_agent_id,
              headline,
              subject,
              category,
              summary,
              promised_date,
              normalized_source_url,
              source_url,
              source_label,
              source_note,
              source_published_at,
              source_type,
              tags,
              status,
              review_notes,
              linked_market_id,
              reviewed_at,
              created_at,
              updated_at
            )
            VALUES (
              $1, $2, $3, $4, 'ai', $5, $6, $7, $8, NULL, NULL, NULL,
              'reference', $9, 'pending', NULL, NULL, NULL, $10, $10
            )
          `,
          [
            agentCase.submissionId,
            registration.agent.id,
            agentCase.headline,
            `Direct ${agentCase.expectedEntity} lead`,
            agentCase.summary,
            '2027-12-31T23:59:59.000Z',
            `https://normalized.example/${agentCase.expectedEntity}`,
            agentCase.sourceUrl,
            [...agentCase.tags],
            `2026-03-18T12:00:0${index}.000Z`,
          ],
        )

        directAgentLeads.push(
          await leadIntake.createAgentLeadFromSubmission(client, {
            agent: registration.agent,
            submissionId: agentCase.submissionId,
            submission: {
              headline: agentCase.headline,
              subject: `Direct ${agentCase.expectedEntity} lead`,
              category: 'ai',
              promisedDate: '2027-12-31T23:59:59.000Z',
              summary: agentCase.summary,
              sourceUrl: agentCase.sourceUrl,
              tags: [...agentCase.tags],
            },
            normalizedSourceUrl: `https://normalized.example/${agentCase.expectedEntity}`,
            sourceType: 'reference',
            now: new Date(`2026-03-18T12:00:0${index}.000Z`),
          }),
        )
      }

      await client.query(
        `
          INSERT INTO human_review_submissions (
            id,
            normalized_source_url,
            source_url,
            source_domain,
            owner_email,
            submitter_note,
            submitter_key_hash,
            status,
            review_notes,
            reviewed_at,
            created_at,
            updated_at
          )
          VALUES (
            'human_elon_signal',
            'https://example.com/elon-signal',
            'https://example.com/elon-signal',
            'example.com',
            'human-owner@example.com',
            'Elon says the milestone lands before the summer close.',
            'submitter-hash',
            'pending',
            NULL,
            NULL,
            '2026-03-18T12:01:00.000Z',
            '2026-03-18T12:01:00.000Z'
          )
        `,
      )

      await client.query(
        `
          INSERT INTO agent_prediction_submissions (
            id,
            submitted_by_agent_id,
            headline,
            subject,
            category,
            summary,
            promised_date,
            normalized_source_url,
            source_url,
            source_label,
            source_note,
            source_published_at,
            source_type,
            tags,
            status,
            review_notes,
            linked_market_id,
            reviewed_at,
            created_at,
            updated_at
          )
          VALUES (
            'submission_default_now',
            $1,
            'Default now lead by December 31, 2027',
            'Default now lead',
            'social',
            'This direct lead exists to cover the default now branch.',
            '2027-12-31T23:59:59.000Z',
            'https://example.com/default-now',
            'https://example.com/default-now',
            NULL,
            NULL,
            NULL,
            'blog',
            '{}',
            'pending',
            NULL,
            NULL,
            NULL,
            '2026-03-18T12:02:00.000Z',
            '2026-03-18T12:02:00.000Z'
          )
        `,
        [registration.agent.id],
      )

      const directHumanLead = await leadIntake.createHumanLeadFromSubmission(
        client,
        {
          ownerEmail: 'human-owner@example.com',
          submissionId: 'human_elon_signal',
          submission: {
            sourceUrl: 'https://example.com/elon-signal',
            note: 'Elon says the milestone lands before the summer close.',
            captchaChallengeId: 'unused',
            captchaAnswer: 'unused',
          },
        },
      )
      const defaultNowLead = await leadIntake.createAgentLeadFromSubmission(
        client,
        {
          agent: registration.agent,
          submissionId: 'submission_default_now',
          submission: {
            headline: 'Default now lead by December 31, 2027',
            subject: 'Default now lead',
            category: 'social',
            promisedDate: '2027-12-31T23:59:59.000Z',
            summary:
              'This direct lead exists to cover the default now branch.',
            sourceUrl: 'https://example.com/default-now',
            tags: [],
          },
        },
      )

      return {
        directAgentLeads,
        directHumanLead,
        defaultNowLead,
        legacyAgentLead: await leadIntake.readLeadByLegacyAgentSubmissionId(
          client,
          'submission_meta',
        ),
        legacyHumanLead: await leadIntake.readLeadByLegacyHumanSubmissionId(
          client,
          'human_elon_signal',
        ),
      }
    })

    expect(
      result.directAgentLeads.map((lead) => ({
        sourceType: lead.sourceType,
        normalizedSourceUrl: lead.normalizedSourceUrl,
        primaryEntitySlug: lead.primaryEntitySlug,
      })),
    ).toEqual(
      agentCases.map((agentCase) => ({
        sourceType: 'reference',
        normalizedSourceUrl: `https://normalized.example/${agentCase.expectedEntity}`,
        primaryEntitySlug: agentCase.expectedEntity,
      })),
    )
    expect(result.directHumanLead).toEqual(
      expect.objectContaining({
        leadType: 'human_url_lead',
        submittedByOwnerEmail: 'human-owner@example.com',
        primaryEntitySlug: 'elon-musk',
      }),
    )
    expect(result.defaultNowLead).toEqual(
      expect.objectContaining({
        legacyAgentSubmissionId: 'submission_default_now',
        sourceType: 'blog',
      }),
    )
    expect(result.legacyAgentLead).toEqual(
      expect.objectContaining({
        legacyAgentSubmissionId: 'submission_meta',
        primaryEntitySlug: 'meta',
      }),
    )
    expect(result.legacyHumanLead).toEqual(
      expect.objectContaining({
        legacyHumanSubmissionId: 'human_elon_signal',
        primaryEntitySlug: 'elon-musk',
      }),
    )

    await context.pool.end()
  })

  it('returns null for missing lead lookups and tolerates empty pending-count rows', async () => {
    const context = await setupApiContext()
    const database = await import('./database')
    const leadIntake = await import('./lead-intake')

    expect(await leadIntake.readPredictionLeadById('missing-lead')).toBeNull()
    expect(
      await database.withDatabaseTransaction((client) =>
        Promise.all([
          leadIntake.readLeadByLegacyAgentSubmissionId(client, 'missing-agent'),
          leadIntake.readLeadByLegacyHumanSubmissionId(client, 'missing-human'),
        ]),
      ),
    ).toEqual([null, null])

    const emptyClient = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    }

    await expect(
      leadIntake.readPendingPredictionLeadsFromClient(emptyClient as never, 0),
    ).resolves.toEqual({
      pendingCount: 0,
      items: [],
    })

    const clampedClient = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [] }),
    }
    await expect(
      leadIntake.readPendingPredictionLeadsFromClient(
        clampedClient as never,
        1_000,
      ),
    ).resolves.toEqual({
      pendingCount: 0,
      items: [],
    })
    expect(clampedClient.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('LIMIT $1'),
      [100],
    )

    const defaultedLimitClient = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [] }),
    }
    await expect(
      leadIntake.readPendingPredictionLeadsFromClient(
        defaultedLimitClient as never,
        { leadType: 'structured_agent_lead' },
      ),
    ).resolves.toEqual({
      pendingCount: 0,
      items: [],
    })
    expect(defaultedLimitClient.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('LIMIT $2'),
      ['structured_agent_lead', 25],
    )

    await context.pool.end()
  })

  it('filters pending leads and builds inspection detail with related and reviewed history', async () => {
    const context = await setupApiContext()
    const database = await import('./database')
    const leadIntake = await import('./lead-intake')

    const primaryRegistration = await registerAgent(
      context,
      'lead_filter_primary_bot',
      'Lead Filter Primary Bot',
    )
    const relatedRegistration = await registerAgent(
      context,
      'lead_filter_related_bot',
      'Lead Filter Related Bot',
    )

    const ids = await database.withDatabaseTransaction(async (client) => {
      await client.query(
        `
          INSERT INTO agent_prediction_submissions (
            id,
            submitted_by_agent_id,
            headline,
            subject,
            category,
            summary,
            promised_date,
            normalized_source_url,
            source_url,
            source_label,
            source_note,
            source_published_at,
            source_type,
            tags,
            status,
            review_notes,
            linked_market_id,
            reviewed_at,
            created_at,
            updated_at
          )
          VALUES
          (
            'legacy_filter_target',
            $1,
            'OpenAI ships GPT-6 by September 30, 2027',
            'OpenAI GPT-6',
            'ai',
            'Primary lead used to exercise filtered inbox reads.',
            '2027-09-30T23:59:59.000Z',
            'https://example.com/openai-gpt6',
            'https://example.com/openai-gpt6',
            'example.com',
            NULL,
            NULL,
            'blog',
            ARRAY['openai', 'gpt-6'],
            'pending',
            NULL,
            NULL,
            NULL,
            '2026-03-18T14:00:00.000Z',
            '2026-03-18T14:00:00.000Z'
          ),
          (
            'legacy_filter_related_pending',
            $2,
            'OpenAI ships GPT-6 voice mode by October 31, 2027',
            'OpenAI GPT-6 voice',
            'ai',
            'Sibling pending lead for inspection context.',
            '2027-10-31T23:59:59.000Z',
            'https://example.com/openai-gpt6-voice',
            'https://example.com/openai-gpt6-voice',
            'example.com',
            NULL,
            NULL,
            'blog',
            ARRAY['openai', 'voice'],
            'pending',
            NULL,
            NULL,
            NULL,
            '2026-03-18T14:05:00.000Z',
            '2026-03-18T14:05:00.000Z'
          ),
          (
            'legacy_filter_reviewed',
            $2,
            'OpenAI ships GPT-6 agents by November 30, 2027',
            'OpenAI GPT-6 agents',
            'ai',
            'Sibling reviewed lead for inspection context.',
            '2027-11-30T23:59:59.000Z',
            'https://example.com/openai-gpt6-agents',
            'https://example.com/openai-gpt6-agents',
            'example.com',
            NULL,
            NULL,
            'blog',
            ARRAY['openai', 'agents'],
            'pending',
            NULL,
            NULL,
            NULL,
            '2026-03-18T14:10:00.000Z',
            '2026-03-18T14:10:00.000Z'
          )
        `,
        [primaryRegistration.agent.id, relatedRegistration.agent.id],
      )

      const primaryLead = await leadIntake.createAgentLeadFromSubmission(client, {
        agent: primaryRegistration.agent,
        submissionId: 'legacy_filter_target',
        submission: {
          headline: 'OpenAI ships GPT-6 by September 30, 2027',
          subject: 'OpenAI GPT-6',
          category: 'ai',
          promisedDate: '2027-09-30T23:59:59.000Z',
          summary: 'Primary lead used to exercise filtered inbox reads.',
          sourceUrl: 'https://example.com/openai-gpt6',
          tags: ['openai', 'gpt-6'],
        },
        now: new Date('2026-03-18T14:00:00.000Z'),
      })

      const relatedPendingLead = await leadIntake.createAgentLeadFromSubmission(
        client,
        {
          agent: relatedRegistration.agent,
          submissionId: 'legacy_filter_related_pending',
          submission: {
            headline: 'OpenAI ships GPT-6 voice mode by October 31, 2027',
            subject: 'OpenAI GPT-6 voice',
            category: 'ai',
            promisedDate: '2027-10-31T23:59:59.000Z',
            summary: 'Sibling pending lead for inspection context.',
            sourceUrl: 'https://example.com/openai-gpt6-voice',
            tags: ['openai', 'voice'],
          },
          now: new Date('2026-03-18T14:05:00.000Z'),
        },
      )

      const reviewedLead = await leadIntake.createAgentLeadFromSubmission(client, {
        agent: relatedRegistration.agent,
        submissionId: 'legacy_filter_reviewed',
        submission: {
          headline: 'OpenAI ships GPT-6 agents by November 30, 2027',
          subject: 'OpenAI GPT-6 agents',
          category: 'ai',
          promisedDate: '2027-11-30T23:59:59.000Z',
          summary: 'Sibling reviewed lead for inspection context.',
          sourceUrl: 'https://example.com/openai-gpt6-agents',
          tags: ['openai', 'agents'],
        },
        now: new Date('2026-03-18T14:10:00.000Z'),
      })

      await leadIntake.syncLeadStatusForLegacyAgentSubmission(client, {
        submissionId: 'legacy_filter_reviewed',
        status: 'rejected',
        reviewNotes: 'Reviewed for inspection coverage.',
        updatedAt: new Date('2026-03-18T14:20:00.000Z'),
      })

      await client.query(
        `
          INSERT INTO prediction_review_results (
            id,
            submission_id,
            lead_id,
            reviewer,
            verdict,
            confidence,
            summary,
            evidence_json,
            snapshot_ref,
            needs_human_review,
            run_id,
            provider_run_id,
            created_at
          )
          VALUES (
            'review_filter_target',
            'legacy_filter_target',
            $1,
            'eddie',
            'accept',
            0.91,
            'Inspection history entry for the lead detail view.',
            '[]'::jsonb,
            'snapshot://filter-target',
            false,
            'run_filter_target',
            NULL,
            '2026-03-18T14:30:00.000Z'
          )
        `,
        [primaryLead.id],
      )

      return {
        primaryLeadId: primaryLead.id,
        relatedPendingLeadId: relatedPendingLead.id,
        reviewedLeadId: reviewedLead.id,
      }
    })

    await expect(
      leadIntake.readPendingPredictionLeads({
        limit: 10,
        leadType: 'structured_agent_lead',
        familySlug: 'ai_launch',
        entitySlug: 'openai',
        sourceDomain: 'example.com',
      }),
    ).resolves.toEqual({
      pendingCount: 2,
      items: expect.arrayContaining([
        expect.objectContaining({
          id: ids.primaryLeadId,
          familySlug: 'ai_launch',
          primaryEntitySlug: 'openai',
          sourceDomain: 'example.com',
        }),
        expect.objectContaining({
          id: ids.relatedPendingLeadId,
        }),
      ]),
    })

    expect(await leadIntake.readPredictionLeadInspection('missing-lead')).toBeNull()

    await expect(
      leadIntake.readPredictionLeadInspection(ids.primaryLeadId),
    ).resolves.toEqual(
      expect.objectContaining({
        lead: expect.objectContaining({
          id: ids.primaryLeadId,
          familySlug: 'ai_launch',
          primaryEntitySlug: 'openai',
        }),
        relatedPendingLeads: expect.arrayContaining([
          expect.objectContaining({
            id: ids.relatedPendingLeadId,
          }),
        ]),
        recentReviewedLeads: expect.arrayContaining([
          expect.objectContaining({
            id: ids.reviewedLeadId,
            status: 'rejected',
          }),
        ]),
        recentReviewResults: [
          expect.objectContaining({
            runId: 'run_filter_target',
            leadId: ids.primaryLeadId,
            submissionId: 'legacy_filter_target',
          }),
        ],
      }),
    )

    await context.pool.end()
  })

  it('syncs legacy human submission status back onto the unified lead shape', async () => {
    const context = await setupApiContext()
    const database = await import('./database')
    const leadIntake = await import('./lead-intake')
    const legacySubmissionId = 'legacy_human_sync_submission'

    await database.withDatabaseTransaction(async (client) => {
      await client.query(
        `
          INSERT INTO human_review_submissions (
            id,
            normalized_source_url,
            source_url,
            source_domain,
            owner_email,
            submitter_note,
            submitter_key_hash,
            status,
            review_notes,
            reviewed_at,
            created_at,
            updated_at
          )
          VALUES (
            $1,
            'https://example.com/human-sync-lead',
            'https://example.com/human-sync-lead',
            'example.com',
            'sync-owner@example.com',
            'This lead will be updated through the legacy human sync helper.',
            'submitter-hash',
            'pending',
            NULL,
            NULL,
            '2026-03-18T13:00:00.000Z',
            '2026-03-18T13:00:00.000Z'
          )
        `,
        [legacySubmissionId],
      )

      await leadIntake.createHumanLeadFromSubmission(client, {
        ownerEmail: 'sync-owner@example.com',
        submissionId: legacySubmissionId,
        submission: {
          sourceUrl: 'https://example.com/human-sync-lead',
          note: 'This lead will be updated through the legacy human sync helper.',
          captchaChallengeId: 'ignored',
          captchaAnswer: 'ignored',
        },
        now: new Date('2026-03-18T13:00:00.000Z'),
      })
    })

    await database.withDatabaseTransaction((client) =>
      leadIntake.syncLeadStatusForLegacyHumanSubmission(client, {
        submissionId: legacySubmissionId,
        status: 'rejected',
        reviewNotes: 'Rejected after offline review.',
      }),
    )

    await database.withDatabaseTransaction((client) =>
      leadIntake.syncLeadStatusForLegacyHumanSubmission(client, {
        submissionId: legacySubmissionId,
        status: 'failed',
      }),
    )

    const synced = await database.withDatabaseTransaction((client) =>
      leadIntake.readLeadByLegacyHumanSubmissionId(
        client,
        legacySubmissionId,
      ),
    )

    expect(synced).toEqual(
      expect.objectContaining({
        legacyHumanSubmissionId: legacySubmissionId,
        status: 'failed',
        reviewNotes: 'Rejected after offline review.',
        reviewedAt: expect.any(String),
      }),
    )

    await context.pool.end()
  })

  it('syncs legacy agent submission status with default timestamps when updatedAt is omitted', async () => {
    const context = await setupApiContext()
    const database = await import('./database')
    const leadIntake = await import('./lead-intake')
    await context.store.ensureStore()

    const registration = await registerAgent(
      context,
      'lead_sync_agent_bot',
      'Lead Sync Agent Bot',
    )
    const legacySubmissionId = 'legacy_agent_sync_submission'

    await database.withDatabaseTransaction(async (client) => {
      await client.query(
        `
          INSERT INTO agent_prediction_submissions (
            id,
            submitted_by_agent_id,
            headline,
            subject,
            category,
            summary,
            promised_date,
            normalized_source_url,
            source_url,
            source_label,
            source_note,
            source_published_at,
            source_type,
            tags,
            status,
            review_notes,
            linked_market_id,
            reviewed_at,
            created_at,
            updated_at
          )
          VALUES (
            $1,
            $2,
            'Anthropic ships Claude Orbit by December 31, 2028',
            'Claude Orbit ship date',
            'ai',
            'A sourced claim used only to cover default updatedAt handling for legacy agent sync.',
            '2028-12-31T23:59:59.000Z',
            'https://example.com/claude-orbit',
            'https://example.com/claude-orbit',
            'example.com',
            NULL,
            NULL,
            'reference',
            ARRAY['anthropic'],
            'pending',
            NULL,
            NULL,
            NULL,
            '2026-03-18T13:30:00.000Z',
            '2026-03-18T13:30:00.000Z'
          )
        `,
        [legacySubmissionId, registration.agent.id],
      )

      await leadIntake.createAgentLeadFromSubmission(client, {
        agent: registration.agent,
        submissionId: legacySubmissionId,
        submission: {
          headline: 'Anthropic ships Claude Orbit by December 31, 2028',
          subject: 'Claude Orbit ship date',
          category: 'ai',
          promisedDate: '2028-12-31T23:59:59.000Z',
          summary:
            'A sourced claim used only to cover default updatedAt handling for legacy agent sync.',
          sourceUrl: 'https://example.com/claude-orbit',
          tags: ['anthropic'],
        },
        now: new Date('2026-03-18T13:30:00.000Z'),
      })
    })

    await database.withDatabaseTransaction((client) =>
      leadIntake.syncLeadStatusForLegacyAgentSubmission(client, {
        submissionId: legacySubmissionId,
        status: 'rejected',
        reviewNotes: 'Rejected through direct legacy sync.',
      }),
    )

    await database.withDatabaseTransaction((client) =>
      leadIntake.syncLeadStatusForLegacyAgentSubmission(client, {
        submissionId: legacySubmissionId,
        status: 'accepted',
        linkedMarketId: 'optimus-customizable-2026',
      }),
    )

    const synced = await database.withDatabaseTransaction((client) =>
      leadIntake.readLeadByLegacyAgentSubmissionId(client, legacySubmissionId),
    )

    expect(synced).toEqual(
      expect.objectContaining({
        legacyAgentSubmissionId: legacySubmissionId,
        status: 'accepted',
        reviewNotes: 'Rejected through direct legacy sync.',
        linkedMarketId: 'optimus-customizable-2026',
        duplicateOfMarketId: 'optimus-customizable-2026',
        reviewedAt: expect.any(String),
      }),
    )

    await context.pool.end()
  })

  it('surfaces reload failures when direct lead inserts cannot be re-read', async () => {
    vi.resetModules()

    const { createAgentLeadFromSubmission, createHumanLeadFromSubmission } =
      await import('./lead-intake')

    const agentClient = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('SELECT') && sql.includes('FROM prediction_leads leads')) {
          return { rowCount: 0, rows: [] }
        }

        return { rowCount: 1, rows: [] }
      }),
    }

    await expect(
      createAgentLeadFromSubmission(agentClient as never, {
        agent: {
          id: 'agent_direct',
          handle: 'direct',
          displayName: 'Direct',
          ownerName: 'Owner',
          modelProvider: 'OpenAI',
          biography: 'Direct lead agent.',
          ownerEmail: null,
          ownerVerifiedAt: null,
          promoCredits: 0,
          earnedCredits: 0,
          availableCredits: 0,
          createdAt: '2026-03-18T00:00:00.000Z',
          claimUrl: '/?claim=claim_direct',
          challengeUrl: '/api/v1/auth/claims/claim_direct',
        },
        submissionId: 'submission_reload_failure',
        submission: {
          headline: 'Direct reload failure by December 31, 2027',
          subject: 'Reload failure',
          category: 'social',
          promisedDate: '2027-12-31T23:59:59.000Z',
          summary: 'This lead exists only to cover the missing reload branch.',
          sourceUrl: 'https://example.com/reload-failure',
          tags: [],
        },
        now: new Date('2026-03-18T00:00:00.000Z'),
      }),
    ).rejects.toThrow('Queued lead could not be reloaded.')

    const humanClient = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('SELECT') && sql.includes('FROM prediction_leads leads')) {
          return { rowCount: 0, rows: [] }
        }

        return { rowCount: 1, rows: [] }
      }),
    }

    await expect(
      createHumanLeadFromSubmission(humanClient as never, {
        ownerEmail: 'owner@example.com',
        submissionId: 'human_reload_failure',
        submission: {
          sourceUrl: 'https://example.com/human-reload-failure',
          note: 'Human reload failure branch coverage.',
          captchaChallengeId: 'unused',
          captchaAnswer: 'unused',
        },
        now: new Date('2026-03-18T00:00:00.000Z'),
      }),
    ).rejects.toThrow('Queued lead could not be reloaded.')
  })
})
