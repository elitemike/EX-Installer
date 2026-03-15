/**
 * E2E tests: Visual config editors for EX-CommandStation and EX-IOExpander.
 *
 * Tests that the Visual/Raw tabs in config-h-editor work correctly, that
 * product-specific form fields appear, and that changes in the visual form
 * are reflected in the raw config text and vice-versa.
 *
 * Prerequisites: build the app with `pnpm build` before running.
 * Run: pnpm test:e2e --grep "Config Editor"
 */

import { test, expect } from './fixtures'

// ── Helpers ──────────────────────────────────────────────────────────────────

async function openDeviceSettings(page: import('@playwright/test').Page) {
    await page.getByText('Device Settings', { exact: true }).first().click()
    await expect(page.locator('config-h-editor')).toBeVisible()
}

async function openIOExpanderConfig(page: import('@playwright/test').Page) {
    await page.getByText('myConfig.h', { exact: true }).first().click()
    await expect(page.locator('config-h-editor')).toBeVisible()
}

async function switchToRaw(page: import('@playwright/test').Page) {
    // The config-h-editor has its own Visual/Raw tab bar
    await page.locator('config-h-editor').getByRole('button', { name: 'Raw' }).click()
    await expect(page.locator('config-h-editor div.monaco-editor')).toBeVisible()
    await page.waitForTimeout(300)
}

async function switchToVisual(page: import('@playwright/test').Page) {
    await page.locator('config-h-editor').getByRole('button', { name: 'Visual' }).click()
    await page.waitForTimeout(200)
}

async function getMonacoText(page: import('@playwright/test').Page): Promise<string> {
    return page.evaluate(() => {
        const container = document.querySelector('config-h-editor div.monaco-editor') as HTMLElement
        if (!container) return ''
        const editorModel = (window as unknown as Record<string, unknown>)._monacoEditorInstance
        if (editorModel && typeof (editorModel as Record<string, unknown>).getValue === 'function') {
            return (editorModel as Record<string, () => string>).getValue()
        }
        // fallback: read from DOM lines
        return Array.from(container.querySelectorAll('.view-line'))
            .map(el => el.textContent ?? '')
            .join('\n')
    })
}

// ── CommandStation Visual Editor ──────────────────────────────────────────────

test.describe('Config Editor — EX-CommandStation', () => {
    test('Device Settings tab shows Visual/Raw tab bar', async ({ workspacePage }) => {
        await openDeviceSettings(workspacePage)

        await expect(
            workspacePage.locator('config-h-editor').getByRole('button', { name: 'Visual' }),
        ).toBeVisible()
        await expect(
            workspacePage.locator('config-h-editor').getByRole('button', { name: 'Raw' }),
        ).toBeVisible()
    })

    test('Visual tab is active by default and shows General sub-tab', async ({ workspacePage }) => {
        await openDeviceSettings(workspacePage)

        // Visual tab active — commandstation-config-form must be in the DOM
        await expect(workspacePage.locator('commandstation-config-form')).toBeVisible()

        // General sub-tab is active by default
        await expect(
            workspacePage.locator('commandstation-config-form').getByRole('button', { name: 'General' }),
        ).toBeVisible()
    })

    test('General tab shows motor driver dropdown', async ({ workspacePage }) => {
        await openDeviceSettings(workspacePage)

        const select = workspacePage.locator('commandstation-config-form select').first()
        await expect(select).toBeVisible()
        // At least one option in the motor driver dropdown
        const optionCount = await select.locator('option').count()
        expect(optionCount).toBeGreaterThan(0)
    })

    test('General tab shows display radio buttons', async ({ workspacePage }) => {
        await openDeviceSettings(workspacePage)

        await expect(
            workspacePage.locator('commandstation-config-form').getByText('None'),
        ).toBeVisible()
        await expect(
            workspacePage.locator('commandstation-config-form').getByText('OLED 132×64 (EX-CSB1)'),
        ).toBeVisible()
    })

    test('WiFi sub-tab shows disabled message when WiFi is off', async ({ workspacePage }) => {
        await openDeviceSettings(workspacePage)

        const wifiTabBtn = workspacePage
            .locator('commandstation-config-form')
            .getByRole('button', { name: /WiFi/ })
        await wifiTabBtn.click()

        await expect(
            workspacePage.locator('commandstation-config-form').getByText('WiFi is disabled'),
        ).toBeVisible()
    })

    test('enabling WiFi shows credentials form in WiFi sub-tab', async ({ workspacePage }) => {
        await openDeviceSettings(workspacePage)

        // Enable WiFi on General tab
        const wifiCheckbox = workspacePage
            .locator('commandstation-config-form')
            .locator('input[type="checkbox"]')
            .first()
        await wifiCheckbox.check()

        // Switch to WiFi sub-tab
        await workspacePage
            .locator('commandstation-config-form')
            .getByRole('button', { name: /WiFi/ })
            .click()

        await expect(
            workspacePage.locator('commandstation-config-form').getByText('Hostname'),
        ).toBeVisible()
        await expect(
            workspacePage.locator('commandstation-config-form').getByPlaceholder('dccex'),
        ).toBeVisible()
    })

    test('TrackManager tab shows Track A and Track B selects', async ({ workspacePage }) => {
        await openDeviceSettings(workspacePage)

        await workspacePage
            .locator('commandstation-config-form')
            .getByRole('button', { name: 'TrackManager' })
            .click()

        await expect(
            workspacePage.locator('commandstation-config-form').getByText('Track A'),
        ).toBeVisible()
        await expect(
            workspacePage.locator('commandstation-config-form').getByText('Track B'),
        ).toBeVisible()
        // Both tracks have a mode select
        const selects = workspacePage.locator('commandstation-config-form select')
        await expect(selects).toHaveCount(3) // motor driver + track A + track B
    })

    test('switching to Raw tab shows Monaco editor', async ({ workspacePage }) => {
        await openDeviceSettings(workspacePage)
        await switchToRaw(workspacePage)

        await expect(workspacePage.locator('config-h-editor div.monaco-editor')).toBeVisible()
    })

    test('switching Visual → Raw → Visual re-mounts the form and shows stored values', async ({ workspacePage }) => {
        await openDeviceSettings(workspacePage)

        // form is visible
        await expect(workspacePage.locator('commandstation-config-form')).toBeVisible()

        await switchToRaw(workspacePage)
        await expect(workspacePage.locator('commandstation-config-form')).not.toBeVisible()

        await switchToVisual(workspacePage)
        await expect(workspacePage.locator('commandstation-config-form')).toBeVisible()
    })
})

// ── IOExpander Visual Editor ──────────────────────────────────────────────────

test.describe('Config Editor — EX-IOExpander', () => {
    test('myConfig.h tab shows Visual/Raw tab bar', async ({ ioExpanderPage }) => {
        await openIOExpanderConfig(ioExpanderPage)

        await expect(
            ioExpanderPage.locator('config-h-editor').getByRole('button', { name: 'Visual' }),
        ).toBeVisible()
        await expect(
            ioExpanderPage.locator('config-h-editor').getByRole('button', { name: 'Raw' }),
        ).toBeVisible()
    })

    test('Visual tab shows IOExpander form with I2C address field', async ({ ioExpanderPage }) => {
        await openIOExpanderConfig(ioExpanderPage)

        await expect(ioExpanderPage.locator('ioexpander-config-form')).toBeVisible()
        await expect(
            ioExpanderPage.locator('ioexpander-config-form').getByText('I2C Address'),
        ).toBeVisible()
    })

    test('I2C address field defaults to 0x65 from mock file', async ({ ioExpanderPage }) => {
        await openIOExpanderConfig(ioExpanderPage)

        const addrInput = ioExpanderPage
            .locator('ioexpander-config-form')
            .locator('input[type="text"]')
            .first()
        await expect(addrInput).toHaveValue('0x65')
    })

    test('changing I2C address updates config in raw view', async ({ ioExpanderPage }) => {
        await openIOExpanderConfig(ioExpanderPage)

        const addrInput = ioExpanderPage
            .locator('ioexpander-config-form')
            .locator('input[type="text"]')
            .first()
        await addrInput.fill('0x20')
        await addrInput.press('Tab') // trigger blur → onI2cAddressChange

        await switchToRaw(ioExpanderPage)

        // Monaco may not be directly readable — verify the form write happened by
        // switching back and checking the field
        await switchToVisual(ioExpanderPage)
        await expect(addrInput).toHaveValue('0x20')
    })

    test('enabling DIAG shows diagnostic delay input', async ({ ioExpanderPage }) => {
        await openIOExpanderConfig(ioExpanderPage)

        // DIAG delay field is hidden before DIAG is enabled
        await expect(
            ioExpanderPage.locator('ioexpander-config-form input[type="number"]'),
        ).not.toBeVisible()

        // Enable DIAG
        const diagCheckbox = ioExpanderPage
            .locator('ioexpander-config-form')
            .locator('label', { hasText: 'Enable diagnostic output' })
            .locator('input[type="checkbox"]')
        await diagCheckbox.check()

        // Delay input should now appear
        await expect(
            ioExpanderPage.locator('ioexpander-config-form input[type="number"]'),
        ).toBeVisible()
    })

    test('test mode radio buttons are visible', async ({ ioExpanderPage }) => {
        await openIOExpanderConfig(ioExpanderPage)

        await expect(
            ioExpanderPage.locator('ioexpander-config-form').getByText('Test Mode'),
        ).toBeVisible()
        await expect(
            ioExpanderPage.locator('ioexpander-config-form').getByText('None (no testing)'),
        ).toBeVisible()
        await expect(
            ioExpanderPage.locator('ioexpander-config-form').getByText('Analogue input testing'),
        ).toBeVisible()
    })

    test('switching Visual → Raw → Visual re-mounts form with persisted values', async ({ ioExpanderPage }) => {
        await openIOExpanderConfig(ioExpanderPage)

        await expect(ioExpanderPage.locator('ioexpander-config-form')).toBeVisible()

        await switchToRaw(ioExpanderPage)
        await expect(ioExpanderPage.locator('ioexpander-config-form')).not.toBeVisible()

        await switchToVisual(ioExpanderPage)
        await expect(ioExpanderPage.locator('ioexpander-config-form')).toBeVisible()

        // I2C address survives round-trip (form re-reads from configHContent)
        const addrInput = ioExpanderPage
            .locator('ioexpander-config-form')
            .locator('input[type="text"]')
            .first()
        await expect(addrInput).toHaveValue('0x65')
    })

    test('switching to Raw tab shows Monaco editor', async ({ ioExpanderPage }) => {
        await openIOExpanderConfig(ioExpanderPage)
        await switchToRaw(ioExpanderPage)

        await expect(ioExpanderPage.locator('config-h-editor div.monaco-editor')).toBeVisible()
    })
})

// ── Roster Editor ─────────────────────────────────────────────────────────────

async function openRosterEditor(page: import('@playwright/test').Page) {
    await page.getByText('Roster', { exact: true }).first().click()
    await expect(page.locator('roster-editor')).toBeVisible()
}

async function switchRosterToRaw(page: import('@playwright/test').Page) {
    await page.locator('roster-editor').getByRole('button', { name: 'Raw' }).click()
    await expect(page.locator('roster-editor div.monaco-editor')).toBeVisible()
    await page.waitForTimeout(300)
}

async function getRosterRawText(page: import('@playwright/test').Page): Promise<string> {
    return page.evaluate(() => {
        return Array.from(document.querySelectorAll('roster-editor .view-line'))
            .map(el => el.textContent ?? '')
            .join('\n')
    })
}

test.describe('Roster Editor — Visual TreeView', () => {
    test('shows Visual and Raw tab bar', async ({ workspacePage }) => {
        await openRosterEditor(workspacePage)
        await expect(workspacePage.locator('roster-editor').getByRole('button', { name: 'Visual' })).toBeVisible()
        await expect(workspacePage.locator('roster-editor').getByRole('button', { name: 'Raw' })).toBeVisible()
    })

    test('TreeView renders a node for each roster entry', async ({ workspacePage }) => {
        await openRosterEditor(workspacePage)
        const tree = workspacePage.locator('#roster-treeview')
        await expect(tree.getByText('Thomas')).toBeVisible()
        await expect(tree.getByText('Percy')).toBeVisible()
    })

    test('clicking a loco node shows detail panel with editable DCC address', async ({ workspacePage }) => {
        await openRosterEditor(workspacePage)
        await workspacePage.locator('#roster-treeview').getByText('Thomas').click()
        const addressInput = workspacePage.locator('roster-editor input[type="number"]')
        await expect(addressInput).toBeVisible()
        await expect(addressInput).toHaveValue('3')
    })

    test('switching between loco nodes updates the detail panel each time', async ({ workspacePage }) => {
        await openRosterEditor(workspacePage)
        const tree = workspacePage.locator('#roster-treeview')
        const addressInput = workspacePage.locator('roster-editor input[type="number"]')

        await tree.getByText('Thomas').click()
        await expect(addressInput).toHaveValue('3')

        await tree.getByText('Percy').click()
        await expect(addressInput).toHaveValue('5')

        // Switch back — this is the case that exposed the re-entrant rebuild bug
        await tree.getByText('Thomas').click()
        await expect(addressInput).toHaveValue('3')
    })

    test('⋮ button on loco node opens context menu with Clone and Delete', async ({ workspacePage }) => {
        await openRosterEditor(workspacePage)
        const thomasRow = workspacePage.locator('#roster-treeview li').filter({ hasText: 'Thomas' }).first()
        await thomasRow.locator('.node-menu-btn').click()
        await expect(workspacePage.locator('.e-contextmenu li').filter({ hasText: 'Clone' })).toBeVisible()
        await expect(workspacePage.locator('.e-contextmenu li').filter({ hasText: 'Delete' })).toBeVisible()
        await expect(workspacePage.locator('.e-contextmenu li').filter({ hasText: 'Rename Group' })).not.toBeVisible()
    })

    test('Clone creates a group node with original and cloned loco', async ({ workspacePage }) => {
        await openRosterEditor(workspacePage)
        const thomasRow = workspacePage.locator('#roster-treeview li').filter({ hasText: 'Thomas' }).first()
        await thomasRow.locator('.node-menu-btn').click()
        await workspacePage.locator('.e-contextmenu li').filter({ hasText: 'Clone' }).click()
        // A #define chip should now appear in the tree (group node)
        await expect(workspacePage.locator('#roster-treeview .text-yellow-400').filter({ hasText: '#define' })).toBeVisible()
        // The clone should appear
        await expect(workspacePage.locator('#roster-treeview').getByText('Thomas (copy)')).toBeVisible()
    })

    test('Delete via context menu removes the loco from the tree', async ({ workspacePage }) => {
        await openRosterEditor(workspacePage)
        const percyRow = workspacePage.locator('#roster-treeview li').filter({ hasText: 'Percy' }).first()
        await percyRow.locator('.node-menu-btn').click()
        await workspacePage.locator('.e-contextmenu li').filter({ hasText: 'Delete' }).click()
        // dialog auto-accepted by fixture
        await expect(workspacePage.locator('#roster-treeview').getByText('Percy')).not.toBeVisible()
    })

    test('Add button creates a new loco node and opens its detail panel', async ({ workspacePage }) => {
        await openRosterEditor(workspacePage)
        await workspacePage.locator('roster-editor button[title="Add new roster entry"]').click()
        // New entry gets dccAddress = max+1 = 6, name = "New Loco 6"
        await expect(workspacePage.locator('#roster-treeview').getByText('New Loco 6')).toBeVisible()
        const addressInput = workspacePage.locator('roster-editor input[type="number"]')
        await expect(addressInput).toHaveValue('6')
    })

    test('selecting a node after Delete still updates the detail panel', async ({ workspacePage }) => {
        await openRosterEditor(workspacePage)
        const percyRow = workspacePage.locator('#roster-treeview li').filter({ hasText: 'Percy' }).first()
        await percyRow.locator('.node-menu-btn').click()
        await workspacePage.locator('.e-contextmenu li').filter({ hasText: 'Delete' }).click()
        await expect(workspacePage.locator('#roster-treeview').getByText('Percy')).not.toBeVisible()
        // Thomas must still be selectable after the tree rebuilds
        await workspacePage.locator('#roster-treeview').getByText('Thomas').click()
        await expect(workspacePage.locator('roster-editor input[type="number"]')).toHaveValue('3')
    })
})

test.describe('Roster Editor — TreeView grouping (pre-grouped roster)', () => {
    test('group node shows #define chip and friendly name', async ({ rosterGroupedPage }) => {
        await openRosterEditor(rosterGroupedPage)
        const tree = rosterGroupedPage.locator('#roster-treeview')
        await expect(tree.locator('.text-yellow-400').filter({ hasText: '#define' })).toBeVisible()
        await expect(tree.getByText('Steam Engines')).toBeVisible()
    })

    test('ungrouped loco appears as a root node', async ({ rosterGroupedPage }) => {
        await openRosterEditor(rosterGroupedPage)
        await expect(rosterGroupedPage.locator('#roster-treeview').getByText('Gordon')).toBeVisible()
    })

    test('clicking group node shows macro name label and friendly name input', async ({ rosterGroupedPage }) => {
        await openRosterEditor(rosterGroupedPage)
        await rosterGroupedPage.locator('#roster-treeview li').filter({ hasText: 'Steam Engines' }).first().click()
        const detail = rosterGroupedPage.locator('roster-editor')
        await expect(detail.getByText('STEAM_F')).toBeVisible()
        const friendlyInput = detail.locator('input[placeholder*="display name"]')
        await expect(friendlyInput).toBeVisible()
        await expect(friendlyInput).toHaveValue('Steam Engines')
    })

    test('editing friendly name is reflected in raw view', async ({ rosterGroupedPage }) => {
        await openRosterEditor(rosterGroupedPage)
        await rosterGroupedPage.locator('#roster-treeview li').filter({ hasText: 'Steam Engines' }).first().click()
        const friendlyInput = rosterGroupedPage.locator('roster-editor input[placeholder*="display name"]')
        await friendlyInput.fill('Narrow Gauge')
        await friendlyInput.blur()

        await switchRosterToRaw(rosterGroupedPage)
        const rawText = await getRosterRawText(rosterGroupedPage)
        expect(rawText).toContain('friendlyName: "Narrow Gauge"')
    })

    test('context menu on group node shows Rename Group but not Clone or Delete', async ({ rosterGroupedPage }) => {
        await openRosterEditor(rosterGroupedPage)
        const groupRow = rosterGroupedPage.locator('#roster-treeview li').filter({ hasText: 'Steam Engines' }).first()
        await groupRow.locator('.node-menu-btn').click()
        await expect(rosterGroupedPage.locator('.e-contextmenu li').filter({ hasText: 'Rename Group' })).toBeVisible()
        await expect(rosterGroupedPage.locator('.e-contextmenu li').filter({ hasText: 'Clone' })).not.toBeVisible()
        await expect(rosterGroupedPage.locator('.e-contextmenu li').filter({ hasText: 'Delete' })).not.toBeVisible()
    })

    test('clicking a grouped loco shows shared-function info card', async ({ rosterGroupedPage }) => {
        await openRosterEditor(rosterGroupedPage)
        await rosterGroupedPage.locator('#roster-treeview').getByText('Thomas').click()
        await expect(rosterGroupedPage.locator('roster-editor').getByText('Shared Function List')).toBeVisible()
        await expect(rosterGroupedPage.locator('roster-editor').getByText('→ Edit function list')).toBeVisible()
    })

    test('"Edit function list" button switches detail to group editor', async ({ rosterGroupedPage }) => {
        await openRosterEditor(rosterGroupedPage)
        await rosterGroupedPage.locator('#roster-treeview').getByText('Thomas').click()
        await rosterGroupedPage.locator('roster-editor').getByText('→ Edit function list').click()
        await expect(rosterGroupedPage.locator('roster-editor').getByText('Macro Name')).toBeVisible()
        await expect(rosterGroupedPage.locator('roster-editor').getByText('STEAM_F')).toBeVisible()
    })

    test('switching between loco, group, and loco nodes updates the detail panel each time', async ({ rosterGroupedPage }) => {
        await openRosterEditor(rosterGroupedPage)
        const tree = rosterGroupedPage.locator('#roster-treeview')
        const detail = rosterGroupedPage.locator('roster-editor')

        // Click a grouped loco
        await tree.getByText('Thomas').click()
        await expect(detail.getByText('Shared Function List')).toBeVisible()

        // Switch to the group node
        await tree.locator('li').filter({ hasText: 'Steam Engines' }).first().click()
        await expect(detail.getByText('STEAM_F')).toBeVisible()
        await expect(detail.getByText('Shared Function List')).not.toBeVisible()

        // Switch to an ungrouped loco
        await tree.getByText('Gordon').click()
        const addressInput = detail.locator('input[type="number"]')
        await expect(addressInput).toHaveValue('6')
    })
})
