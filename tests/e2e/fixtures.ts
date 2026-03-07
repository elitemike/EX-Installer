/**
 * Shared Playwright fixtures for EX-Installer E2E tests.
 *
 * The `workspacePage` fixture:
 *   1. Creates an isolated temp directory for Electron userData.
 *   2. Seeds mock myRoster.h, myTurnouts.h, and config.h files on disk.
 *   3. Writes a SavedConfiguration into the preferences JSON so the home
 *      screen shows a card that can be clicked to load the workspace.
 *   4. Launches Electron with --mock --skip-startup --test-data-dir=<tmp>.
 *   5. Navigates: home → workspace (by clicking the mock config card).
 *   6. Returns the Playwright Page for the workspace view.
 */

import { test as base, expect } from '@playwright/test'
import { _electron as electron } from '@playwright/test'
import type { Page, ElectronApplication } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'

// ── Mock file content ─────────────────────────────────────────────────────────

export const MOCK_ROSTER_H = [
    'ROSTER(3, "Thomas", "LIGHT/HORN/*WHISTLE/BELL")',
    'ROSTER(5, "Percy", "LIGHT/HORN")',
].join('\n')

export const MOCK_TURNOUTS_H = [
    'SERVO_TURNOUT(200, 25, 410, 205, Slow, "Main Line Junction")',
    'SERVO_TURNOUT(201, 26, 410, 205, Fast, "Yard Entry")',
].join('\n')

export const MOCK_CONFIG_H = [
    '// config.h — mock test configuration',
    '#define MAIN_DRIVER_MOTOR_SHIELD STANDARD_MOTOR_SHIELD',
].join('\n')

// Resolve Electron main entry relative to repo root (tests/e2e/ → ../../src/out/main/index.js)
const ELECTRON_MAIN = resolve(__dirname, '../../src/out/main/index.js')

// ── Fixture types ─────────────────────────────────────────────────────────────

interface WorkspaceFixtures {
    electronApp: ElectronApplication
    workspacePage: Page
}

// ── Shared test base with workspace fixture ───────────────────────────────────

export const test = base.extend<WorkspaceFixtures>({
    // eslint-disable-next-line no-empty-pattern
    electronApp: async ({ }, use) => {
        // 1. Isolated temp directory acts as the full userData directory.
        const testDataDir = mkdtempSync(join(tmpdir(), 'ex-installer-e2e-'))

        // 2. Seed the scratch directory (where config files live on disk).
        const scratchPath = join(testDataDir, 'scratch', 'CommandStation-EX')
        mkdirSync(scratchPath, { recursive: true })
        writeFileSync(join(scratchPath, 'myRoster.h'), MOCK_ROSTER_H, 'utf-8')
        writeFileSync(join(scratchPath, 'myTurnouts.h'), MOCK_TURNOUTS_H, 'utf-8')
        writeFileSync(join(scratchPath, 'config.h'), MOCK_CONFIG_H, 'utf-8')

        // 3. Write the preferences JSON with a pre-built SavedConfiguration.
        const prefsDir = join(testDataDir, 'preferences')
        mkdirSync(prefsDir, { recursive: true })
        const savedConfig = {
            id: 'e2e-test-config',
            name: 'E2E Test Layout',
            deviceName: 'Arduino Mega 2560',
            devicePort: '/dev/ttyACM1',
            deviceFqbn: 'arduino:avr:mega:cpu=atmega2560',
            product: 'ex_commandstation',
            productName: 'EX-CommandStation',
            version: 'v5.4.0-Prod',
            repoPath: join(testDataDir, 'scratch'),
            scratchPath,
            configFiles: [
                { name: 'config.h', content: MOCK_CONFIG_H },
                { name: 'myRoster.h', content: MOCK_ROSTER_H },
                { name: 'myTurnouts.h', content: MOCK_TURNOUTS_H },
            ],
            lastModified: new Date().toISOString(),
        }
        writeFileSync(
            join(prefsDir, 'ex-installer-preferences.json'),
            JSON.stringify({ savedConfigurations: [savedConfig] }, null, 2),
            'utf-8',
        )

        // 4. Launch Electron in mock mode with startup checks skipped.
        const app = await electron.launch({
            args: [
                ELECTRON_MAIN,
                '--mock',
                '--skip-startup',
                `--test-data-dir=${testDataDir}`,
                // Prevent hardware acceleration issues in headless CI
                '--disable-gpu',
                '--no-sandbox',
                // Auto-dismiss window.confirm() dialogs triggered by delete actions
                '--js-flags=--no-expose-wasm',
            ],
            // Chromium switch: auto-accept all JS dialogs so window.confirm doesn't block
            chromiumSandbox: false,
        })

        await use(app)

        await app.close()
        rmSync(testDataDir, { recursive: true, force: true })
    },

    workspacePage: async ({ electronApp }, use) => {
        const page = await electronApp.firstWindow()
        // Auto-accept any window.confirm() dialogs (e.g. from delete confirmations)
        page.on('dialog', (dialog) => dialog.accept().catch(() => undefined))
        await page.waitForLoadState('domcontentloaded')

        // Dismiss any Syncfusion license alert overlays before interacting.
        // These fire on file:// origins in production builds when the license key
        // version doesn't exactly match the installed package version.
        await page.evaluate(() => {
            document.querySelectorAll('[id^="ej2-licensing"]').forEach(el => el.remove())
        }).catch(() => undefined)

        // Wait for home screen: the "E2E Test Layout" card should be present.
        await expect(page.getByText('E2E Test Layout')).toBeVisible({ timeout: 15_000 })

        // Click the card to load the mock workspace.
        await page.getByText('E2E Test Layout').click()

        // Wait for workspace: the file sidebar should show the Roster tab.
        await expect(page.getByText('Roster', { exact: true })).toBeVisible({ timeout: 10_000 })

        await use(page)
    },
})

export { expect }
