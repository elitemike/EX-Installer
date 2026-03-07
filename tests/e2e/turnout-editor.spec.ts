/**
 * E2E tests: Turnout editor — bidirectional visual ↔ raw editing.
 *
 * Tests that data added/edited/removed from the visual editor is reflected in
 * raw mode and vice-versa, covering the @observable-based sync pipeline.
 *
 * Prerequisites: build the app with `pnpm build` before running.
 * Run: pnpm test:e2e --grep "Turnout Editor"
 */

import { test, expect, MOCK_TURNOUTS_H } from './fixtures'

// ── Helpers ─────────────────────────────────────────────────────────────────

async function openTurnoutEditor(page: import('@playwright/test').Page) {
    await page.getByText('Turnouts', { exact: true }).first().click()
    await expect(page.getByRole('button', { name: 'Visual' })).toBeVisible()
}

async function switchToRaw(page: import('@playwright/test').Page) {
    await page.getByRole('button', { name: 'Raw' }).click()
    await expect(page.locator('div.monaco-editor')).toBeVisible()
}

async function switchToVisual(page: import('@playwright/test').Page) {
    await page.getByRole('button', { name: 'Visual' }).click()
    await expect(page.locator('nav[aria-label="Turnouts"]')).toBeVisible()
}

async function setMonacoContent(page: import('@playwright/test').Page, text: string) {
    const editor = page.locator('div.monaco-editor').first()
    await editor.click()
    await page.keyboard.press('Control+A')
    await page.keyboard.press('Delete')
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i++) {
        await page.keyboard.type(lines[i])
        if (i < lines.length - 1) await page.keyboard.press('Enter')
    }
    await page.waitForTimeout(500)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Turnout Editor', () => {
    // ── Verify initial mock data loaded ─────────────────────────────────────

    test('shows mock turnout entries in visual tab', async ({ workspacePage: page }) => {
        await openTurnoutEditor(page)

        // Both turnouts from the mock data should be listed
        await expect(page.getByText('Main Line Junction')).toBeVisible()
        await expect(page.getByText('Yard Entry')).toBeVisible()
        await expect(page.getByText('2 entries')).toBeVisible()
    })

    test('raw tab shows correct SERVO_TURNOUT() macros for mock data', async ({ workspacePage: page }) => {
        await openTurnoutEditor(page)
        await switchToRaw(page)

        await expect(page.locator('div.monaco-editor')).toContainText('SERVO_TURNOUT(200')
        await expect(page.locator('div.monaco-editor')).toContainText('Main Line Junction')
        await expect(page.locator('div.monaco-editor')).toContainText('SERVO_TURNOUT(201')
        await expect(page.locator('div.monaco-editor')).toContainText('Yard Entry')
    })

    // ── Visual → Raw sync ─────────────────────────────────────────────────────

    test('adding entry via visual appears in raw tab', async ({ workspacePage: page }) => {
        await openTurnoutEditor(page)

        // Click + to add a new turnout
        await page.getByTitle('Add new turnout').click()

        // The new entry form should open — find and fill the description field
        const descInput = page.locator('label', { hasText: /Description/i })
            .locator('..').locator('input[type="text"]')
        await descInput.clear()
        await descInput.fill('Goods Yard Switch')
        await descInput.blur()

        // Entry should now appear in the list (uses description as display name)
        await expect(page.getByText('Goods Yard Switch')).toBeVisible()

        // Switch to raw — Goods Yard Switch must appear as a SERVO_TURNOUT()
        await switchToRaw(page)
        await expect(page.locator('div.monaco-editor')).toContainText('Goods Yard Switch')
        await expect(page.locator('div.monaco-editor')).toContainText('SERVO_TURNOUT(')
    })

    test('removing entry via visual disappears from raw tab', async ({ workspacePage: page }) => {
        await openTurnoutEditor(page)

        // Remove "Yard Entry" (second entry) via the × button
        const entryRow = page.locator('nav[aria-label="Turnouts"] a', { hasText: 'Yard Entry' })
        await entryRow.hover()
        const removeBtn = entryRow.locator('button[title="Remove"]')
        await removeBtn.click()

        // Accept any confirmation dialog
        const deleteBtn = page.getByRole('button', { name: 'Delete' })
        if (await deleteBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await deleteBtn.click()
        }

        // Yard Entry should be gone from the turnout nav list
        const turnoutNav = page.locator('nav[aria-label="Turnouts"]')
        await expect(turnoutNav.getByText('Yard Entry')).not.toBeVisible({ timeout: 5_000 })

        // Switch to raw
        await switchToRaw(page)
        await expect(page.locator('div.monaco-editor')).not.toContainText('Yard Entry')
        await expect(page.locator('div.monaco-editor')).toContainText('Main Line Junction')
    })

    // ── Raw → Visual sync ─────────────────────────────────────────────────────

    test('new entry added in raw appears in visual after switching tab', async ({ workspacePage: page }) => {
        await openTurnoutEditor(page)
        await switchToRaw(page)

        const newContent =
            MOCK_TURNOUTS_H + '\nSERVO_TURNOUT(202, 27, 410, 205, Slow, "Coal Siding")'
        await setMonacoContent(page, newContent)

        await switchToVisual(page)

        await expect(page.getByText('Coal Siding')).toBeVisible({ timeout: 5_000 })
        await expect(page.getByText('3 entries')).toBeVisible()
    })

    test('entry edited in raw updates in visual after switching tab', async ({ workspacePage: page }) => {
        await openTurnoutEditor(page)
        await switchToRaw(page)

        // Change Yard Entry's description to "Engine Shed" and ID to 210
        const editedContent = [
            'SERVO_TURNOUT(200, 25, 410, 205, Slow, "Main Line Junction")',
            'SERVO_TURNOUT(210, 26, 410, 205, Fast, "Engine Shed")',
        ].join('\n')
        await setMonacoContent(page, editedContent)

        await switchToVisual(page)

        await expect(page.getByText('Engine Shed')).toBeVisible({ timeout: 5_000 })
        await expect(page.getByText('Yard Entry')).not.toBeVisible()
    })

    test('entry removed in raw disappears from visual after switching tab', async ({ workspacePage: page }) => {
        await openTurnoutEditor(page)
        await switchToRaw(page)

        // Keep only Main Line Junction
        const reducedContent = 'SERVO_TURNOUT(200, 25, 410, 205, Slow, "Main Line Junction")'
        await setMonacoContent(page, reducedContent)

        await switchToVisual(page)

        await expect(page.getByText('Main Line Junction')).toBeVisible({ timeout: 5_000 })
        await expect(page.getByText('Yard Entry')).not.toBeVisible()
        await expect(page.getByText('1 entries')).toBeVisible()
    })

    // ── Round-trip consistency ────────────────────────────────────────────────

    test('add entry in raw, edit in visual, verify raw again', async ({ workspacePage: page }) => {
        await openTurnoutEditor(page)
        await switchToRaw(page)

        // Add a new turnout in raw
        const withNew = MOCK_TURNOUTS_H + '\nSERVO_TURNOUT(202, 27, 390, 190, Medium, "Water Tower")'
        await setMonacoContent(page, withNew)
        await switchToVisual(page)

        // Water Tower should appear
        await expect(page.getByText('Water Tower')).toBeVisible({ timeout: 5_000 })

        // Click on it to edit, change description
        await page.locator('nav[aria-label="Turnouts"] a', { hasText: 'Water Tower' }).click()
        const descInput = page.locator('label', { hasText: /Description/i })
            .locator('..').locator('input[type="text"]')
        await descInput.clear()
        await descInput.fill('Water Tower Siding')
        await descInput.blur()

        // Go back to raw and verify
        await switchToRaw(page)
        await expect(page.locator('div.monaco-editor')).toContainText('Water Tower Siding')
    })
})
