import { expect, test } from '@playwright/test'

const reviewKey = process.env.PLAYWRIGHT_REVIEW_KEY

test.describe('review console', () => {
  test.skip(!reviewKey, 'PLAYWRIGHT_REVIEW_KEY is required for unlocked review-console checks.')

  test('authorized review desk filters pending leads without posting mutations', async ({
    page,
  }) => {
    await page.goto(`/review?review_key=${reviewKey}`)

    await expect(
      page.getByRole('heading', { name: 'Eddie review desk' }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Filter leads' })).toBeVisible()

    await page.getByLabel('Lead type').selectOption('system_discovery_lead')
    await page.getByLabel('Family').selectOption('policy_promise')
    await page.getByLabel('Entity slug').fill('doge')
    await page.getByLabel('Source domain').fill('example.com')
    await page.getByRole('button', { name: 'Filter leads' }).click()

    await expect(page).toHaveURL(/leadType=system_discovery_lead/)
    await expect(page).toHaveURL(/familySlug=policy_promise/)
    await expect(page).toHaveURL(/entitySlug=doge/)
    await expect(page).toHaveURL(/sourceDomain=example\.com/)
  })
})
