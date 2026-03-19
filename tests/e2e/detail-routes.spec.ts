import { expect, test } from '@playwright/test'

test.describe('detail routes', () => {
  test('group and market detail pages expose the reviewed board model', async ({
    page,
  }) => {
    await page.goto('/groups/musk-deadline-board')

    await expect(
      page.getByRole('heading', { name: 'Accepted markets in this board' }),
    ).toBeVisible()
    await expect(page.getByText('Primary entity')).toBeVisible()
    await expect(page.getByText('Hero market')).toBeVisible()

    await page.goto('/markets/doge-savings-2026')

    await expect(
      page.getByRole('heading', { name: /DOGE produces \$150 billion/i }),
    ).toBeVisible()
    await expect(page.getByText('Current line', { exact: true })).toBeVisible()
    await expect(page.getByText('Book limits', { exact: true })).toBeVisible()
    await expect(page.getByText('Sources', { exact: true })).toBeVisible()
    await expect(page.getByText('Related groups', { exact: true })).toBeVisible()
    await expect(page.getByText('Related markets', { exact: true })).toBeVisible()
  })
})
