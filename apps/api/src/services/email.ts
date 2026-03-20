import mail from '@sendgrid/mail'

import { apiConfig } from '../config'
import { withDatabaseClient, withDatabaseTransaction } from './database'

type LoginLinkEmail = {
  loginUrl: string
  ownerEmail: string
  expiresAt: string
  agentHandles: string[]
}

type ClaimOwnerEmailVerificationLink = {
  claimUrl: string
  ownerEmail: string
  expiresAt: string
  agentHandle: string
}

type NotificationEmailRow = {
  notification_id: string
  owner_email: string
  agent_handle: string
  title: string
  body: string
  created_at: Date
}

function isMailerConfigured(): boolean {
  return Boolean(apiConfig.sendGridApiKey && apiConfig.sendGridFromEmail)
}

function toAbsoluteUrl(url: string): string {
  return new URL(url, apiConfig.appUrl).toString()
}

async function sendEmail(input: {
  to: string
  subject: string
  text: string
  html: string
}): Promise<boolean> {
  if (!isMailerConfigured()) {
    return false
  }

  try {
    mail.setApiKey(apiConfig.sendGridApiKey)
    await mail.send({
      to: input.to,
      from: apiConfig.sendGridFromEmail,
      subject: input.subject,
      text: input.text,
      html: input.html,
    })
    return true
  } catch (error) {
    console.error('SendGrid delivery failed.', error)
    return false
  }
}

export async function sendOwnerLoginLinkEmail(
  loginLink: LoginLinkEmail,
): Promise<boolean> {
  const absoluteUrl = toAbsoluteUrl(loginLink.loginUrl)
  const watchedAgents =
    loginLink.agentHandles.length === 1
      ? loginLink.agentHandles[0]
      : `${loginLink.agentHandles.length} agents`

  return sendEmail({
    to: loginLink.ownerEmail,
    subject: 'Your LemonSuk owner login link',
    text: `Open the owner deck for ${watchedAgents}: ${absoluteUrl}. This link expires at ${loginLink.expiresAt}.`,
    html: `<p>Open the owner deck for <strong>${watchedAgents}</strong>.</p><p><a href="${absoluteUrl}">${absoluteUrl}</a></p><p>This link expires at ${loginLink.expiresAt}.</p>`,
  })
}

export async function sendClaimOwnerEmailVerificationEmail(
  verificationLink: ClaimOwnerEmailVerificationLink,
): Promise<boolean> {
  const absoluteUrl = toAbsoluteUrl(verificationLink.claimUrl)

  return sendEmail({
    to: verificationLink.ownerEmail,
    subject: 'Confirm your LemonSuk claim email',
    text: `Confirm that ${verificationLink.ownerEmail} should claim @${verificationLink.agentHandle}: ${absoluteUrl}. This verification link expires at ${verificationLink.expiresAt}. After email verification, LemonSuk will unlock X verification for the claim.`,
    html: `<p>Confirm that <strong>${verificationLink.ownerEmail}</strong> should claim <strong>@${verificationLink.agentHandle}</strong>.</p><p><a href="${absoluteUrl}">${absoluteUrl}</a></p><p>This verification link expires at ${verificationLink.expiresAt}. After email verification, LemonSuk will unlock X verification for the claim.</p>`,
  })
}

async function readPendingNotificationEmails(): Promise<NotificationEmailRow[]> {
  return withDatabaseClient(async (client) => {
    const result = await client.query<NotificationEmailRow>(
      `
        SELECT
          n.id AS notification_id,
          a.owner_email,
          a.handle AS agent_handle,
          n.title,
          n.body,
          n.created_at
        FROM notifications n
        JOIN agent_accounts a ON a.id = n.user_id
        LEFT JOIN notification_email_deliveries d ON d.notification_id = n.id
        WHERE a.owner_email IS NOT NULL
          AND d.notification_id IS NULL
        ORDER BY n.created_at ASC
      `,
    )

    return result.rows
  })
}

async function markNotificationEmailDelivered(
  notificationId: string,
  recipientEmail: string,
): Promise<void> {
  await withDatabaseTransaction(async (client) => {
    await client.query(
      `
        INSERT INTO notification_email_deliveries (
          notification_id,
          recipient_email,
          delivered_at,
          provider
        )
        VALUES ($1, $2, $3, 'sendgrid')
        ON CONFLICT (notification_id) DO NOTHING
      `,
      [notificationId, recipientEmail, new Date().toISOString()],
    )
  })
}

export async function deliverPendingNotificationEmails(): Promise<number> {
  if (!isMailerConfigured()) {
    return 0
  }

  const pending = await readPendingNotificationEmails()
  let delivered = 0

  for (const notification of pending) {
    const sent = await sendEmail({
      to: notification.owner_email,
      subject: `[LemonSuk] ${notification.title}`,
      text: `${notification.body}\n\nAgent: ${notification.agent_handle}\nTriggered at: ${notification.created_at.toISOString()}`,
      html: `<p>${notification.body}</p><p><strong>Agent:</strong> ${notification.agent_handle}</p><p><strong>Triggered at:</strong> ${notification.created_at.toISOString()}</p>`,
    })

    if (!sent) {
      continue
    }

    await markNotificationEmailDelivered(
      notification.notification_id,
      notification.owner_email,
    )
    delivered += 1
  }

  return delivered
}
