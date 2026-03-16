import { test, expect } from '@playwright/test'

test.describe('Board Create and Open Flow', () => {
  test('create a board and land in workspace', async ({ page }) => {
    await page.goto('/')

    // Starting screen is visible
    await expect(page.getByText('Context Board')).toBeVisible()

    // Click create board
    await page.getByRole('button', { name: 'Create Board' }).click()

    // Dialog appears
    await expect(page.getByText('Create New Board')).toBeVisible()

    // Clear default title and type new one
    const titleInput = page.getByRole('textbox')
    await titleInput.clear()
    await titleInput.fill('E2E Test Board')

    // Create the board
    await page.getByRole('button', { name: 'Create' }).click()

    // Should navigate to board workspace
    await expect(page).toHaveURL(/\/boards\//)

    // Board title visible in header
    await expect(page.getByText('E2E Test Board')).toBeVisible()

    // Canvas area is present
    await expect(page.getByText(/Canvas/)).toBeVisible()

    // Chat sidebar is present (expanded by default)
    await expect(page.getByText('Chat')).toBeVisible()
  })

  test('navigate back to home and see board in list', async ({ page }) => {
    // First create a board
    await page.goto('/')
    await page.getByRole('button', { name: 'Create Board' }).click()
    const titleInput = page.getByRole('textbox')
    await titleInput.clear()
    await titleInput.fill('Listed Board')
    await page.getByRole('button', { name: 'Create' }).click()
    await expect(page).toHaveURL(/\/boards\//)

    // Navigate back
    await page.getByText('← Boards').click()

    // Should be on home page with board in list
    await expect(page).toHaveURL('/')
    await expect(page.getByText('Listed Board')).toBeVisible()
  })
})
