import { expect, test } from '@playwright/test'

const ownerEmail = process.env.PLAYWRIGHT_OWNER_EMAIL
const ownerSessionToken = process.env.PLAYWRIGHT_OWNER_SESSION_TOKEN
const claimToken = process.env.PLAYWRIGHT_CLAIM_TOKEN

test.describe('authenticated board flows', () => {
  test('configured owner email can request a login link', async ({
    page,
  }, testInfo) => {
    test.skip(
      !ownerEmail,
      'PLAYWRIGHT_OWNER_EMAIL is required for owner login-link smoke.',
    )
    test.skip(
      testInfo.project.name !== 'desktop-chromium',
      'Owner email smoke runs once to avoid duplicate live email sends.',
    )

    await page.goto('/')
    await page.getByRole('button', { name: 'Owner login' }).first().click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Owner login' })).toBeVisible()
    await dialog.getByLabel('Owner email').fill(ownerEmail!)
    await dialog.getByRole('button', { name: 'Email me a login link' }).click()

    await expect(
      dialog.getByText(`Check ${ownerEmail!} for your LemonSuk owner link.`),
    ).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Use another email' })).toBeVisible()
  })

  test('configured owner session token opens the signed-in board state', async ({
    page,
  }) => {
    test.skip(
      !ownerSessionToken,
      'PLAYWRIGHT_OWNER_SESSION_TOKEN is required for owner session smoke.',
    )

    await page.goto(`/?owner_session=${encodeURIComponent(ownerSessionToken!)}`)

    await expect(page.getByText(/Signed in as /i)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible()
    await expect(page.getByText('Observed agents')).toBeVisible()
    await expect(page.getByText('Submit a source URL')).toBeVisible()
  })

  test('configured claim token resolves to a readable claim view', async ({
    page,
  }) => {
    test.skip(
      !claimToken,
      'PLAYWRIGHT_CLAIM_TOKEN is required for claim-flow smoke.',
    )

    await page.goto('/')
    await page.getByRole('button', { name: 'Claim agent' }).first().click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Claim a bot' })).toBeVisible()
    await dialog.getByLabel('Claim link or token').fill(claimToken!)
    await dialog.getByRole('button', { name: 'Find my agent' }).click()

    await expect(dialog.getByText('Verification phrase:')).toBeVisible()
    await expect(dialog.getByText('Owner email linked:')).toBeVisible()
  })
})
