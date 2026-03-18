import { expect, test } from '@playwright/test'

test.describe('board interactions', () => {
  test('owner login modal opens, switches modes, and validates claim lookup input', async ({
    page,
  }) => {
    await page.goto('/')

    await page.getByRole('button', { name: 'Owner login' }).first().click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading', { name: 'Owner login' })).toBeVisible()

    await dialog.getByRole('button', { name: 'Claim agent' }).click()
    await expect(dialog.getByRole('heading', { name: 'Claim a bot' })).toBeVisible()
    const claimLookupField = dialog.getByLabel('Claim link or token')
    await expect(claimLookupField).toBeVisible()

    await claimLookupField.focus()
    await page.keyboard.press('Enter')
    await expect(
      dialog.getByText('Paste a claim link or claim token from your agent.'),
    ).toBeVisible()

    await dialog.getByRole('button', { name: 'Owner login' }).click()
    await expect(dialog.getByRole('heading', { name: 'Owner login' })).toBeVisible()
    await dialog.getByRole('button', { name: 'Not now' }).click()
    await expect(dialog).toBeHidden()
  })

  test('board filters and topic navigation work without mutating live data', async ({
    page,
  }) => {
    await page.goto('/')

    await expect(
      page.getByRole('heading', { name: 'Full prediction feed' }),
    ).toBeVisible()

    await page.getByRole('button', { name: 'open', exact: true }).click()
    await expect(page.getByText(/Showing .* cards in the full archive\./)).toBeVisible()

    await page.getByRole('button', { name: 'busted', exact: true }).click()
    await expect(page.getByText(/Showing .* cards in the full archive\./)).toBeVisible()

    await page.getByRole('button', { name: 'all', exact: true }).click()
    const openTopicButton = page.getByRole('button', { name: 'Open topic' }).first()
    await expect(openTopicButton).toBeVisible()
    await openTopicButton.evaluate((element) =>
      element.scrollIntoView({ block: 'center', inline: 'nearest' }),
    )
    await openTopicButton.focus()

    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Back to board' })).toBeVisible()
    await expect(
      page.getByText(/Humans can read every topic\./),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Back to board' }).click()
    await expect(
      page.getByRole('heading', { name: 'Full prediction feed' }),
    ).toBeVisible()
  })
})
