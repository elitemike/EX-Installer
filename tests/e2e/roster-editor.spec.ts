/**
 * E2E tests: Roster editor — bidirectional visual ↔ raw editing.
 *
 * Tests that data added/edited/removed from the visual editor is reflected in
 * raw mode and vice-versa, covering the @observable-based sync pipeline.
 *
 * Prerequisites: build the app with `pnpm build` before running.
 * Run: pnpm test:e2e --grep "Roster Editor"
 */

import { test, expect, MOCK_ROSTER_H } from './fixtures'

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Open the Roster editor in the workspace by clicking the "Roster" sidebar tab.
 */
async function openRosterEditor(page: import('@playwright/test').Page) {
    await page.getByText('Roster', { exact: true }).first().click()
    // Wait for the Visual/Raw tab strip to appear
    await expect(page.getByRole('button', { name: 'Visual' })).toBeVisible()
}

/**
 * Switch to the Raw tab inside the roster editor.
 */
async function switchToRaw(page: import('@playwright/test').Page) {
    await page.getByRole('button', { name: 'Raw' }).click()
    await expect(page.locator('div.monaco-editor')).toBeVisible()
}

/**
 * Switch to the Visual tab inside the roster editor.
 */
async function switchToVisual(page: import('@playwright/test').Page) {
    await page.getByRole('button', { name: 'Visual' }).click()
    // Wait for nav list to appear
    await expect(page.locator('nav[aria-label="Roster entries"]')).toBeVisible()
}

/**
 * Replace the full content of the Monaco editor with `text`.
 * Uses Ctrl+A then type to overwrite.
 */
async function setMonacoContent(page: import('@playwright/test').Page, text: string) {
    const editor = page.locator('div.monaco-editor').first()
    await editor.click()
    // Select all and delete existing content
    await page.keyboard.press('Control+A')
    await page.keyboard.press('Delete')
    // Type new content line by line (handle newlines as Enter)
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i++) {
        await page.keyboard.type(lines[i])
        if (i < lines.length - 1) await page.keyboard.press('Enter')
    }
    // Wait for Monaco's debounce to fire (300ms) + a little buffer
    await page.waitForTimeout(500)
}

/**
 * Get the current raw text in the Monaco editor.
 */
async function getMonacoContent(page: import('@playwright/test').Page): Promise<string> {
    return page.evaluate(() => {
        const editorEl = document.querySelector('div.monaco-editor')
        if (!editorEl) return ''
        // Read each view line text
        const lines = Array.from(editorEl.querySelectorAll('.view-line'))
        if (lines.length === 0) {
            // Fallback: try the textarea
            const ta = editorEl.querySelector('textarea.inputarea') as HTMLTextAreaElement | null
            return ta?.value ?? ''
        }
        return lines.map(l => l.textContent ?? '').join('\n')
    })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Roster Editor', () => {
    // ── Verify initial mock data loaded ─────────────────────────────────────

    test('shows mock roster entries in visual tab', async ({ workspacePage: page }) => {
        await openRosterEditor(page)

        // Thomas and Percy were in the mock myRoster.h
        await expect(page.getByText('Thomas')).toBeVisible()
        await expect(page.getByText('Percy')).toBeVisible()
        await expect(page.getByText('2 entries')).toBeVisible()
    })

    test('raw tab shows correct ROSTER() macros for mock data', async ({ workspacePage: page }) => {
        await openRosterEditor(page)
        await switchToRaw(page)

        // Both initial entries should appear in the raw text
        await expect(page.locator('div.monaco-editor')).toContainText('ROSTER(3')
        await expect(page.locator('div.monaco-editor')).toContainText('Thomas')
        await expect(page.locator('div.monaco-editor')).toContainText('ROSTER(5')
        await expect(page.locator('div.monaco-editor')).toContainText('Percy')
    })

    // ── Visual → Raw sync ─────────────────────────────────────────────────────

    test('adding entry via visual appears in raw tab', async ({ workspacePage: page }) => {
        await openRosterEditor(page)

        // Click + to add a new entry
        await page.getByTitle('Add new roster entry').click()

        // Wait for the detail panel to open (DCC Address spinbutton appears)
        await expect(page.locator('input[type="number"]').first()).toBeVisible({ timeout: 5_000 })

        // Edit the name field — label text is "Name", input is the sibling text input
        const nameInput = page.locator('label:has-text("Name") ~ input[type="text"], label:has-text("Name") + input[type="text"]')
            .or(page.locator('div:has(> label:has-text("Name")) input[type="text"]'))
        await nameInput.first().clear()
        await nameInput.first().fill('Gordon')
        await nameInput.first().blur()

        // Edit the DCC address
        const addrInput = page.locator('input[type="number"]').first()
        await addrInput.fill('7')
        await addrInput.blur()

        // Entry should now appear in the list
        await expect(page.locator('nav[aria-label="Roster entries"]').getByText('Gordon')).toBeVisible()

        // Switch to raw — Gordon must appear as a ROSTER() macro
        await switchToRaw(page)
        await expect(page.locator('div.monaco-editor')).toContainText('Gordon')
        await expect(page.locator('div.monaco-editor')).toContainText('ROSTER(7')
    })

    test('removing entry via visual disappears from raw tab', async ({ workspacePage: page }) => {
        await openRosterEditor(page)

        // Remove Thomas (first entry) via the × button
        const rosterNav = page.locator('nav[aria-label="Roster entries"]')
        const thomasRow = rosterNav.locator('a', { hasText: 'Thomas' })
        await thomasRow.hover()
        await thomasRow.locator('button[title="Remove"]').click()

        // ConfirmDialog appears as an Aurelia dialog overlay — click "Delete".
        // The dialog handler on the page fixture auto-accepts window.confirm() fallback.
        const deleteBtn = page.getByRole('button', { name: 'Delete' })
        if (await deleteBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await deleteBtn.click()
        }

        // Thomas should be gone from the roster nav list
        await expect(rosterNav.getByText('Thomas')).not.toBeVisible({ timeout: 5_000 })
        await expect(rosterNav.getByText('Percy')).toBeVisible()

        // Switch to raw — Thomas must be gone
        await switchToRaw(page)
        const content = await getMonacoContent(page)
        expect(content).not.toContain('Thomas')
        expect(content).toContain('Percy')
    })

    // ── Raw → Visual sync ─────────────────────────────────────────────────────

    test('new entry added in raw appears in visual after switching tab', async ({ workspacePage: page }) => {
        await openRosterEditor(page)
        await switchToRaw(page)

        // Append a new ROSTER entry to the raw content
        const newContent = MOCK_ROSTER_H + '\nROSTER(10, "Gordon", "LIGHT/HORN")'
        await setMonacoContent(page, newContent)

        // Switch back to visual
        await switchToVisual(page)

        // Gordon should now appear in the visual entry list
        await expect(page.getByText('Gordon')).toBeVisible({ timeout: 5_000 })
        await expect(page.getByText('3 entries')).toBeVisible()
    })

    test('entry edited in raw updates in visual after switching tab', async ({ workspacePage: page }) => {
        await openRosterEditor(page)
        await switchToRaw(page)

        // Change Percy's name to "Bertie" and DCC address to 15
        const editedContent = [
            'ROSTER(3, "Thomas", "LIGHT/HORN/*WHISTLE/BELL")',
            'ROSTER(15, "Bertie", "LIGHT/HORN")',
        ].join('\n')
        await setMonacoContent(page, editedContent)

        // Switch back to visual
        await switchToVisual(page)

        // Bertie should be present, Percy should be gone
        await expect(page.getByText('Bertie')).toBeVisible({ timeout: 5_000 })
        await expect(page.getByText('Percy')).not.toBeVisible()
        await expect(page.getByText('15')).toBeVisible()
    })

    test('entry removed in raw disappears from visual after switching tab', async ({ workspacePage: page }) => {
        await openRosterEditor(page)
        await switchToRaw(page)

        // Keep only Thomas, remove Percy
        const reducedContent = 'ROSTER(3, "Thomas", "LIGHT/HORN/*WHISTLE/BELL")'
        await setMonacoContent(page, reducedContent)

        // Switch back to visual
        await switchToVisual(page)

        // Only Thomas should remain
        await expect(page.getByText('Thomas')).toBeVisible({ timeout: 5_000 })
        await expect(page.getByText('Percy')).not.toBeVisible()
        await expect(page.getByText('1 entries')).toBeVisible()
    })

    // ── Round-trip consistency ────────────────────────────────────────────────

    test('add entry in raw, edit in visual, verify raw again', async ({ workspacePage: page }) => {
        await openRosterEditor(page)
        await switchToRaw(page)

        // Add Gordon in raw
        const withGordon = MOCK_ROSTER_H + '\nROSTER(10, "Gordon", "")'
        await setMonacoContent(page, withGordon)
        await switchToVisual(page)

        // Gordon should be in visual
        await expect(page.getByText('Gordon')).toBeVisible({ timeout: 5_000 })

        // Edit Gordon's name to "Gordon the Big Engine" via visual
        await page.locator('nav[aria-label="Roster entries"] a', { hasText: 'Gordon' }).click()
        const nameInput = page.locator('label', { hasText: 'Name' }).locator('..').locator('input[type="text"]')
        await nameInput.clear()
        await nameInput.fill('Gordon the Big Engine')
        await nameInput.blur()

        // Switch to raw and verify the change
        await switchToRaw(page)
        await expect(page.locator('div.monaco-editor')).toContainText('Gordon the Big Engine')
    })
})
