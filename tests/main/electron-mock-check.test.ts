import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/main/electron-app', () => ({
    app: {
        getPath: vi.fn(() => '/mock/home'),
        getAppPath: vi.fn(() => '/mock/app'),
        isPackaged: false,
    },
}))

vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>()
    return { ...actual, existsSync: vi.fn(() => true), mkdirSync: vi.fn() }
})

import { ArduinoCliService } from '../../src/main/arduino-cli'

describe('electron-app mock via source module', () => {
    it('ArduinoCliService.installDir uses the mocked app.getPath', () => {
        const svc = new ArduinoCliService()
        expect(svc.installDir).toContain('/mock/home')
        expect(svc.cliBinaryPath).toContain('/mock/home')
    })
})
