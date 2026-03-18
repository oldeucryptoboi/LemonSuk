import { describe, expect, it } from 'vitest'

import { setupApiContext } from '../../../../test/helpers/api-context'

function solveCaptcha(prompt: string): string {
  const match = prompt.match(/slug:\s+([a-z]+-[a-z]+)-(\d+)\+(\d+)\./i)

  if (!match) {
    throw new Error(`Could not solve captcha prompt: ${prompt}`)
  }

  return `${match[1]}-${Number(match[2]) + Number(match[3])}`
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
    biography:
      'Systematic agent that submits and reviews sourced deadline claims.',
    captchaChallengeId: challenge.id,
    captchaAnswer: solveCaptcha(challenge.prompt),
  })
}

describe('lead review workflow service', () => {
  it('reads internal leads, updates status, and escalates accepted reviews without linked markets', async () => {
    const context = await setupApiContext()
    const queue = await import('./submission-queue')
    const workflow = await import('./lead-review-workflow')

    const registration = await registerAgent(
      context,
      'lead_review_alpha_bot',
      'Lead Review Alpha Bot',
    )
    await context.store.ensureStore()

    const queued = await queue.enqueuePredictionSubmission(registration.agent, {
      headline: 'Tesla ships a refreshed Roadster by December 31, 2027',
      subject: 'Tesla Roadster refresh',
      category: 'vehicle',
      promisedDate: '2027-12-31T23:59:59.000Z',
      summary:
        'A sourced claim that Tesla will ship a refreshed Roadster before the 2027 year-end close.',
      sourceUrl: 'https://example.com/roadster-refresh',
      sourceLabel: '  Roadster Wire  ',
      sourcePublishedAt: '2026-03-15T00:00:00.000Z',
      tags: ['tesla', 'roadster'],
    })
    const leadId = queued.leadId

    expect(await workflow.readPredictionLeadForInternal(leadId)).toEqual(
      expect.objectContaining({
        id: leadId,
        status: 'pending',
        sourceLabel: 'Roadster Wire',
        sourcePublishedAt: '2026-03-15T00:00:00.000Z',
        submittedBy: expect.objectContaining({
          handle: 'lead_review_alpha_bot',
        }),
      }),
    )

    expect(
      await workflow.updatePredictionLeadStatusForInternal(leadId, {
        status: 'in_review',
        runId: 'run_lead_review_alpha',
        note: 'Picked up by the orchestrator worker.',
      }),
    ).toEqual(
      expect.objectContaining({
        status: 'in_review',
        reviewNotes: 'Picked up by the orchestrator worker.',
      }),
    )

    expect(
      await workflow.updatePredictionLeadStatusForInternal(leadId, {
        status: 'in_review',
        runId: 'run_lead_review_alpha',
        note: 'No-op idempotent update.',
      }),
    ).toEqual(
      expect.objectContaining({
        status: 'in_review',
        reviewNotes: 'Picked up by the orchestrator worker.',
      }),
    )

    const escalated = await workflow.applyPredictionLeadReviewResultForInternal(
      leadId,
      {
        runId: 'run_lead_review_alpha',
        reviewer: 'eddie',
        verdict: 'accept',
        confidence: 0.88,
        summary:
          'The source appears credible, but the market still needs manual linking before it can go live.',
        evidence: [
          {
            url: 'https://example.com/roadster-refresh',
            excerpt: 'Tesla says the refreshed Roadster ships by the end of 2027.',
          },
        ],
        needsHumanReview: false,
        snapshotRef: 'snapshot://roadster-refresh',
      },
    )

    expect(escalated.lead.status).toBe('escalated')
    expect(escalated.reviewResult.verdict).toBe('accept')
    expect(escalated.reviewResult.leadId).toBe(leadId)
    expect(escalated.reviewResult.submissionId).toBeNull()

    expect(
      await workflow.applyPredictionLeadReviewResultForInternal(leadId, {
        runId: 'run_lead_review_alpha',
        reviewer: 'eddie',
        verdict: 'accept',
        confidence: 0.88,
        summary:
          'The source appears credible, but the market still needs manual linking before it can go live.',
        evidence: [
          {
            url: 'https://example.com/roadster-refresh',
            excerpt: 'Tesla says the refreshed Roadster ships by the end of 2027.',
          },
        ],
        needsHumanReview: false,
        snapshotRef: 'snapshot://roadster-refresh',
      }),
    ).toEqual(escalated)

    const auditCount = await context.pool.query<{ count: number }>(
      `
        SELECT COUNT(*)::int AS count
        FROM prediction_review_audit_log
        WHERE lead_id = $1
      `,
      [leadId],
    )
    expect(auditCount.rows[0]?.count).toBeGreaterThanOrEqual(3)

    await context.pool.end()
  })

  it('accepts linked markets, rejects human leads, and blocks terminal updates', async () => {
    const context = await setupApiContext()
    const queue = await import('./submission-queue')
    const workflow = await import('./lead-review-workflow')
    const humanSubmissions = await import('./human-review-submissions')

    const acceptedRegistration = await registerAgent(
      context,
      'lead_review_beta_bot',
      'Lead Review Beta Bot',
    )
    const invalidLinkRegistration = await registerAgent(
      context,
      'lead_review_gamma_bot',
      'Lead Review Gamma Bot',
    )
    await context.store.ensureStore()

    const linked = await queue.enqueuePredictionSubmission(
      acceptedRegistration.agent,
      {
        headline:
          'Optimus becomes a fully software-customizable robot by December 31, 2026',
        subject: 'Optimus customizable robot',
        category: 'robotics',
        promisedDate: '2026-12-31T23:59:59.000Z',
        summary:
          'A sourced claim that Optimus becomes a fully software-customizable robot by the 2026 year-end deadline.',
        sourceUrl: 'https://example.com/optimus-customizable',
        tags: ['optimus'],
      },
    )
    const linkedLeadId = linked.leadId

    await workflow.updatePredictionLeadStatusForInternal(linkedLeadId, {
      status: 'in_review',
      runId: 'run_lead_review_beta_accept',
      note: 'Accepted-path verification.',
    })

    const accepted = await workflow.applyPredictionLeadReviewResultForInternal(
      linkedLeadId,
      {
        runId: 'run_lead_review_beta_accept',
        reviewer: 'eddie',
        verdict: 'accept',
        confidence: 0.92,
        summary:
          'This source is strong enough to link directly to the existing Optimus market.',
        evidence: [
          {
            url: 'https://example.com/optimus-customizable',
            excerpt: 'Optimus becomes fully software-customizable by the end of 2026.',
          },
        ],
        needsHumanReview: false,
        linkedMarketId: 'optimus-customizable-2026',
      },
    )

    expect(accepted.lead.status).toBe('accepted')
    expect(accepted.lead.linkedMarketId).toBe('optimus-customizable-2026')

    await expect(
      workflow.updatePredictionLeadStatusForInternal(linkedLeadId, {
        status: 'failed',
        note: 'Should not mutate accepted items.',
      }),
    ).rejects.toThrow('Prediction lead is no longer pending review.')

    await expect(
      workflow.applyPredictionLeadReviewResultForInternal(linkedLeadId, {
        runId: 'run_lead_review_beta_accept_2',
        reviewer: 'eddie',
        verdict: 'reject',
        confidence: 0.2,
        summary:
          'A second review result should be blocked once the lead is terminal.',
        evidence: [],
        needsHumanReview: false,
      }),
    ).rejects.toThrow('Prediction lead is no longer pending review.')

    const challenge = await context.identity.createCaptchaChallenge()
    const humanSubmission = await humanSubmissions.createHumanReviewSubmission(
      {
        sourceUrl: 'https://example.com/doge-savings-fantasy',
        note: 'Likely bogus DOGE savings claim.',
        captchaChallengeId: challenge.id,
        captchaAnswer: solveCaptcha(challenge.prompt),
      },
      'owner@example.com',
    )
    const humanLeadId = humanSubmission.leadId

    await workflow.updatePredictionLeadStatusForInternal(humanLeadId, {
      status: 'in_review',
      runId: 'run_lead_review_beta_reject',
      note: 'Reject-path verification.',
    })

    const rejected = await workflow.applyPredictionLeadReviewResultForInternal(
      humanLeadId,
      {
        runId: 'run_lead_review_beta_reject',
        reviewer: 'eddie',
        verdict: 'reject',
        confidence: 0.31,
        summary:
          'This source is weak and the claim should be rejected instead of entering the market flow.',
        evidence: [
          {
            url: 'https://example.com/doge-savings-fantasy',
            excerpt: 'The article makes a loose claim with no trustworthy sourcing.',
          },
        ],
        needsHumanReview: false,
      },
    )

    expect(rejected.lead.status).toBe('rejected')

    const invalidLink = await queue.enqueuePredictionSubmission(
      invalidLinkRegistration.agent,
      {
        headline: 'Neuralink ships a full telepathy SDK by December 31, 2028',
        subject: 'Neuralink telepathy SDK',
        category: 'neurotech',
        promisedDate: '2028-12-31T23:59:59.000Z',
        summary:
          'A sourced claim that Neuralink ships a full telepathy SDK by the 2028 year-end deadline.',
        sourceUrl: 'https://example.com/neuralink-sdk',
        tags: ['neuralink'],
      },
    )
    const invalidLeadId = invalidLink.leadId

    await workflow.updatePredictionLeadStatusForInternal(invalidLeadId, {
      status: 'in_review',
      runId: 'run_lead_review_beta_bad_link',
      note: 'Bad-link verification.',
    })

    await expect(
      workflow.applyPredictionLeadReviewResultForInternal(invalidLeadId, {
        runId: 'run_lead_review_beta_bad_link',
        reviewer: 'eddie',
        verdict: 'accept',
        confidence: 0.8,
        summary:
          'This acceptance should fail because the linked market does not exist.',
        evidence: [
          {
            url: 'https://example.com/neuralink-sdk',
            excerpt: 'This is a failing link test.',
          },
        ],
        needsHumanReview: false,
        linkedMarketId: 'missing-market',
      }),
    ).rejects.toThrow('Linked market not found.')

    expect(await workflow.readPredictionLeadForInternal('missing-lead')).toBeNull()

    await context.pool.end()
  })

  it('supports failed and escalated status updates and retains prior notes on blank updates', async () => {
    const context = await setupApiContext()
    const queue = await import('./submission-queue')
    const workflow = await import('./lead-review-workflow')

    const failedRegistration = await registerAgent(
      context,
      'lead_review_delta_bot',
      'Lead Review Delta Bot',
    )
    const escalatedRegistration = await registerAgent(
      context,
      'lead_review_epsilon_bot',
      'Lead Review Epsilon Bot',
    )
    const retainedNotesRegistration = await registerAgent(
      context,
      'lead_review_zeta_bot',
      'Lead Review Zeta Bot',
    )
    await context.store.ensureStore()

    await expect(
      workflow.updatePredictionLeadStatusForInternal('missing-lead', {
        status: 'failed',
        note: 'Missing.',
      }),
    ).rejects.toThrow('Prediction lead not found.')

    await expect(
      workflow.applyPredictionLeadReviewResultForInternal('missing-lead', {
        runId: 'run_lead_review_missing',
        reviewer: 'eddie',
        verdict: 'reject',
        confidence: 0.2,
        summary: 'Missing lead coverage for the internal review workflow.',
        evidence: [],
        needsHumanReview: false,
      }),
    ).rejects.toThrow('Prediction lead not found.')

    const failed = await queue.enqueuePredictionSubmission(
      failedRegistration.agent,
      {
        headline: 'Boring builds a failed demo tunnel by December 31, 2027',
        subject: 'Boring demo tunnel',
        category: 'transport',
        promisedDate: '2027-12-31T23:59:59.000Z',
        summary:
          'A sourced claim used to exercise failed internal status updates.',
        sourceUrl: 'https://example.com/boring-demo-tunnel',
        tags: ['boring'],
      },
    )
    const failedLeadId = failed.leadId

    expect(
      await workflow.updatePredictionLeadStatusForInternal(failedLeadId, {
        status: 'failed',
        runId: 'run_lead_review_failed',
        note: 'The review worker failed before dispatch.',
      }),
    ).toEqual(
      expect.objectContaining({
        status: 'failed',
        reviewNotes: 'The review worker failed before dispatch.',
        reviewedAt: expect.any(String),
      }),
    )

    const escalated = await queue.enqueuePredictionSubmission(
      escalatedRegistration.agent,
      {
        headline: 'Hyperloop opens an intercity demo by December 31, 2028',
        subject: 'Hyperloop intercity demo',
        category: 'transport',
        promisedDate: '2028-12-31T23:59:59.000Z',
        summary:
          'A sourced claim used to exercise escalated internal status updates.',
        sourceUrl: 'https://example.com/hyperloop-intercity-demo',
        tags: ['hyperloop'],
      },
    )
    const escalatedLeadId = escalated.leadId

    expect(
      await workflow.updatePredictionLeadStatusForInternal(escalatedLeadId, {
        status: 'escalated',
        runId: 'run_lead_review_escalated',
        note: 'Manual review required before resolution.',
      }),
    ).toEqual(
      expect.objectContaining({
        status: 'escalated',
        reviewNotes: 'Manual review required before resolution.',
        reviewedAt: expect.any(String),
      }),
    )

    const retained = await queue.enqueuePredictionSubmission(
      retainedNotesRegistration.agent,
      {
        headline: 'X launches a notes API by December 31, 2028',
        subject: 'X notes API',
        category: 'social',
        promisedDate: '2028-12-31T23:59:59.000Z',
        summary:
          'A sourced claim used to exercise retained review notes on blank updates.',
        sourceUrl: 'https://example.com/x-notes-api',
        tags: ['x'],
      },
    )
    const retainedLeadId = retained.leadId

    await workflow.updatePredictionLeadStatusForInternal(retainedLeadId, {
      status: 'in_review',
      note: 'Initial retained note.',
    })

    expect(
      await workflow.updatePredictionLeadStatusForInternal(retainedLeadId, {
        status: 'failed',
        note: '   ',
      }),
    ).toEqual(
      expect.objectContaining({
        status: 'failed',
        reviewNotes: 'Initial retained note.',
      }),
    )

    await context.pool.end()
  })

  it('supports direct manual lead review decisions for operator tooling', async () => {
    const context = await setupApiContext()
    const queue = await import('./submission-queue')
    const workflow = await import('./lead-review-workflow')
    const humanSubmissions = await import('./human-review-submissions')

    const acceptedRegistration = await registerAgent(
      context,
      'lead_review_manual_bot',
      'Lead Review Manual Bot',
    )
    const noteFreeRegistration = await registerAgent(
      context,
      'lead_review_manual_note_free_bot',
      'Lead Review Manual Note Free Bot',
    )
    await context.store.ensureStore()

    const acceptedLeadSubmission = await queue.enqueuePredictionSubmission(
      acceptedRegistration.agent,
      {
        headline: 'Tesla ships a cheaper Cybercab by December 31, 2027',
        subject: 'Cybercab cheaper trim',
        category: 'vehicle',
        promisedDate: '2027-12-31T23:59:59.000Z',
        summary:
          'A sourced claim that Tesla ships a cheaper Cybercab trim before the 2027 year-end close.',
        sourceUrl: 'https://example.com/cybercab-cheaper-trim',
        tags: ['tesla', 'cybercab'],
      },
    )
    const acceptedLeadId = acceptedLeadSubmission.leadId

    await expect(
      workflow.reviewPredictionLead({
        leadId: 'missing-lead',
        decision: 'rejected',
      }),
    ).rejects.toThrow('Prediction lead not found.')

    await expect(
      workflow.reviewPredictionLead({
        leadId: acceptedLeadId,
        decision: 'accepted',
      }),
    ).rejects.toThrow('Accepted leads must be linked to a market.')

    const accepted = await workflow.reviewPredictionLead({
      leadId: acceptedLeadId,
      decision: 'accepted',
      linkedMarketId: 'cybercab-volume-2026',
      reviewNotes: 'Linked manually by the operator.',
    })

    expect(accepted).toEqual(
      expect.objectContaining({
        id: acceptedLeadId,
        status: 'accepted',
        linkedMarketId: 'cybercab-volume-2026',
        duplicateOfMarketId: 'cybercab-volume-2026',
        reviewNotes: 'Linked manually by the operator.',
      }),
    )

    await expect(
      workflow.reviewPredictionLead({
        leadId: acceptedLeadId,
        decision: 'rejected',
      }),
    ).rejects.toThrow('Prediction lead has already been reviewed.')

    const challenge = await context.identity.createCaptchaChallenge()
    const humanSubmission = await humanSubmissions.createHumanReviewSubmission(
      {
        sourceUrl: 'https://example.com/manual-human-review',
        note: 'Human submitted lead for operator rejection coverage.',
        captchaChallengeId: challenge.id,
        captchaAnswer: solveCaptcha(challenge.prompt),
      },
      'manual-owner@example.com',
    )
    const rejectedLeadId = humanSubmission.leadId

    const rejected = await workflow.reviewPredictionLead({
      leadId: rejectedLeadId,
      decision: 'rejected',
      reviewNotes: 'Rejected manually by the operator.',
    })

    expect(rejected).toEqual(
      expect.objectContaining({
        id: rejectedLeadId,
        status: 'rejected',
        linkedMarketId: null,
        reviewNotes: 'Rejected manually by the operator.',
      }),
    )

    const noteFreeSubmission = await queue.enqueuePredictionSubmission(
      noteFreeRegistration.agent,
      {
        headline: 'xAI ships a note-free rejection case by March 31, 2028',
        subject: 'xAI note-free rejection',
        category: 'ai',
        promisedDate: '2028-03-31T23:59:59.000Z',
        summary:
          'A sourced claim used only to cover manual rejection without operator notes.',
        sourceUrl: 'https://example.com/note-free-rejection',
        tags: ['xai'],
      },
    )
    const noteFreeLeadId = noteFreeSubmission.leadId

    const noteFreeRejected = await workflow.reviewPredictionLead({
      leadId: noteFreeLeadId,
      decision: 'rejected',
    })

    expect(noteFreeRejected).toEqual(
      expect.objectContaining({
        id: noteFreeLeadId,
        status: 'rejected',
        reviewNotes: null,
        linkedMarketId: null,
      }),
    )

    await context.pool.end()
  })

  it('syncs legacy human submission rows and exposes inspection detail for operator review', async () => {
    const context = await setupApiContext()
    const database = await import('./database')
    const leadIntake = await import('./lead-intake')
    const workflow = await import('./lead-review-workflow')

    const legacyLead = await database.withDatabaseTransaction(async (client) => {
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
            'legacy_human_workflow_submission',
            'https://example.com/legacy-human-workflow',
            'https://example.com/legacy-human-workflow',
            'example.com',
            'legacy-owner@example.com',
            'Legacy human workflow coverage.',
            'legacy-submitter-hash',
            'pending',
            NULL,
            NULL,
            '2026-03-18T16:00:00.000Z',
            '2026-03-18T16:00:00.000Z'
          )
        `,
      )

      return leadIntake.createHumanLeadFromSubmission(client, {
        ownerEmail: 'legacy-owner@example.com',
        submissionId: 'legacy_human_workflow_submission',
        submission: {
          sourceUrl: 'https://example.com/legacy-human-workflow',
          note: 'Legacy human workflow coverage.',
          captchaChallengeId: 'ignored',
          captchaAnswer: 'ignored',
        },
        now: new Date('2026-03-18T16:00:00.000Z'),
      })
    })

    expect(await workflow.readPredictionLeadInspectionForInternal('missing-lead')).toBeNull()
    expect(
      await workflow.readPredictionLeadInspectionForInternal(legacyLead.id),
    ).toEqual(
      expect.objectContaining({
        lead: expect.objectContaining({
          id: legacyLead.id,
          legacyHumanSubmissionId: 'legacy_human_workflow_submission',
          submittedBy: null,
        }),
        relatedPendingLeads: [],
        recentReviewedLeads: [],
        recentReviewResults: [],
      }),
    )

    expect(
      await workflow.reviewPredictionLead({
        leadId: legacyLead.id,
        decision: 'rejected',
        reviewNotes: 'Rejected with legacy sync.',
      }),
    ).toEqual(
      expect.objectContaining({
        id: legacyLead.id,
        status: 'rejected',
        reviewNotes: 'Rejected with legacy sync.',
      }),
    )

    const legacyRow = await context.pool.query<{
      status: string
      review_notes: string | null
    }>(
      `
        SELECT status, review_notes
        FROM human_review_submissions
        WHERE id = 'legacy_human_workflow_submission'
      `,
    )
    expect(legacyRow.rows).toEqual([
      {
        status: 'rejected',
        review_notes: 'Rejected with legacy sync.',
      },
    ])

    await context.pool.end()
  })
})
