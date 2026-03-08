/**
 * E2E tests: Compile button.
 *
 * The default describe block always runs using the mock compile handler
 * (--mock-compile flag is passed by the standard e2e fixture).
 *
 * The "real compiler" block requires a working arduino-cli installation and
 * is skipped by default. Enable with:
 *
 *   COMPILE_E2E=1 pnpm test:e2e --grep "Compile"
 *
 * Prerequisites: build the app with `pnpm build` before running.
 */

import { test, expect } from './fixtures'

const COMPILE_E2E = !!process.env['COMPILE_E2E']

// ── Default: runs with mock compile (always on in e2e fixture) ────────────────

test.describe('Compile button', () => {
    test('compile button is visible in mock mode', async ({ workspacePage }) => {
        const compileBtn = workspacePage.getByRole('button', { name: 'Compile' })
        await expect(compileBtn).toBeVisible()
        await expect(workspacePage.getByRole('button', { name: 'Compile & Upload' })).not.toBeVisible()
    })

    test('clicking Compile shows Compiling... then ✓ Success and a success toast', async ({ workspacePage }) => {
        await workspacePage.getByRole('button', { name: 'Compile' }).click()

        await expect(workspacePage.getByRole('button', { name: 'Compiling...' })).toBeVisible()
        await expect(workspacePage.getByRole('button', { name: 'Compiling...' })).toBeDisabled()

        await expect(workspacePage.getByText('✓ Success')).toBeVisible({ timeout: 10_000 })
        await expect(workspacePage.getByRole('button', { name: 'Compile' })).toBeEnabled()

        await expect(workspacePage.locator('.e-toast-success')).toBeVisible({ timeout: 5_000 })
        await expect(workspacePage.locator('.e-toast-success')).toContainText('Compile Successful')
    })

    test('compile output panel shows log text', async ({ workspacePage }) => {
        await workspacePage.getByRole('button', { name: 'Compile' }).click()
        await expect(workspacePage.getByText('✓ Success')).toBeVisible({ timeout: 10_000 })

        const outputPanel = workspacePage.locator('pre.whitespace-pre-wrap')
        await expect(outputPanel).toContainText('Compiling for')
        await expect(outputPanel).toContainText('program storage space')
        await expect(outputPanel).toContainText('✓ Compile successful!')
    })

    test('Clear button hides the output panel', async ({ workspacePage }) => {
        await workspacePage.getByRole('button', { name: 'Compile' }).click()
        await expect(workspacePage.getByText('✓ Success')).toBeVisible({ timeout: 10_000 })

        await workspacePage.getByRole('button', { name: /Clear/ }).click()

        await expect(workspacePage.getByText('✓ Success')).not.toBeVisible()
        await expect(workspacePage.locator('pre.whitespace-pre-wrap')).not.toBeVisible()
    })

    test('a second compile after clearing also succeeds', async ({ workspacePage }) => {
        await workspacePage.getByRole('button', { name: 'Compile' }).click()
        await expect(workspacePage.getByText('✓ Success')).toBeVisible({ timeout: 10_000 })

        await workspacePage.getByRole('button', { name: /Clear/ }).click()
        await expect(workspacePage.getByText('✓ Success')).not.toBeVisible()

        await workspacePage.getByRole('button', { name: 'Compile' }).click()
        await expect(workspacePage.getByText('✓ Success')).toBeVisible({ timeout: 10_000 })
    })

    test('compile succeeds with invalid lines present in roster raw', async ({ workspacePage }) => {
        await workspacePage.getByText('Roster', { exact: true }).first().click()
        await workspacePage.getByRole('button', { name: 'Raw' }).click()
        await expect(workspacePage.locator('div.monaco-editor')).toBeVisible()

        const editor = workspacePage.locator('div.monaco-editor').first()
        await editor.click()
        await workspacePage.keyboard.press('Control+End')
        await workspacePage.keyboard.type('\nROSTER(badentry)')
        await workspacePage.getByRole('button', { name: 'Visual' }).click()
        await workspacePage.waitForTimeout(300)

        await workspacePage.getByRole('button', { name: 'Compile' }).click()
        await expect(workspacePage.getByText('✓ Success')).toBeVisible({ timeout: 10_000 })
    })
})

// ── Real compiler: requires arduino-cli installed (COMPILE_E2E=1) ─────────────

test.describe('Compile button — real compiler', () => {
    test.skip(!COMPILE_E2E, 'Set COMPILE_E2E=1 to run against the real arduino-cli toolchain')

    test('real compile succeeds and shows ✓ Success', async ({ workspacePageNative }) => {
        await workspacePageNative.getByRole('button', { name: 'Compile' }).click()

        await expect(workspacePageNative.getByRole('button', { name: 'Compiling...' })).toBeVisible()

        // Real compilation can take a few minutes
        await expect(workspacePageNative.getByText('✓ Success')).toBeVisible({ timeout: 120_000 })
        await expect(workspacePageNative.getByRole('button', { name: 'Compile' })).toBeEnabled()

        await expect(workspacePageNative.locator('.e-toast-success')).toBeVisible({ timeout: 5_000 })
        await expect(workspacePageNative.locator('.e-toast-success')).toContainText('Compile Successful')
    })

    test('real compile output contains Compiling for', async ({ workspacePageNative }) => {
        await workspacePageNative.getByRole('button', { name: 'Compile' }).click()
        await expect(workspacePageNative.getByText('✓ Success')).toBeVisible({ timeout: 120_000 })

        const outputPanel = workspacePageNative.locator('pre.whitespace-pre-wrap')
        await expect(outputPanel).toContainText('Compiling for')
        await expect(outputPanel).toContainText('✓ Compile successful!')
    })
})

