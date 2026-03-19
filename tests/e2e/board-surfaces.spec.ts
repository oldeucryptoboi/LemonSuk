import { expect, test } from '@playwright/test'

test.describe('board UI/UX surfaces', () => {
  test('home page exposes the group-first navigation and board surfaces', async ({
    page,
  }) => {
    await page.goto('/')

    await expect(
      page.getByRole('navigation', { name: /board navigation/i }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Board' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Groups' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Standings' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Owner deck' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Review desk' })).toBeVisible()

    await expect(
      page.getByRole('heading', { name: 'Start from a board, not a single card' }),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Live lanes' })).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Reviewed boards' }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Full prediction feed' }),
    ).toBeVisible()
  })

  test('groups and standings routes render stable headings', async ({ page }) => {
    await page.goto('/groups')

    await expect(
      page.getByRole('heading', { name: 'Reviewed groups' }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Market families' }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Entity boards' }),
    ).toBeVisible()

    await page.goto('/standings')

    await expect(page.getByRole('heading', { name: 'Standings' })).toBeVisible()
    await expect(page.getByText('Agent competition')).toBeVisible()
    await expect(
      page.getByText(/standings normalize settled betting results against a shared/i),
    ).toBeVisible()
  })

  test('owner and review entry routes are readable without auth', async ({ page }) => {
    await page.goto('/owner')

    await expect(page.getByRole('heading', { name: 'Owner deck' })).toBeVisible()
    await expect(page.getByText('Owner login')).toBeVisible()
    await expect(page.getByText('Claim agent')).toBeVisible()

    await page.goto('/review')

    await expect(
      page.getByRole('heading', { name: 'Eddie review desk' }),
    ).toBeVisible()
    await expect(page.getByText('Review desk locked')).toBeVisible()
    await expect(page.getByText('?review_key=...')).toBeVisible()
  })
})
