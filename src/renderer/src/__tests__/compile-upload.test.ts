import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Workspace } from '../views/workspace'
import type { InstallerState } from '../models/installer-state'
import type { ArduinoCliService } from '../services/arduino-cli.service'
import type { FileService } from '../services/file.service'

// ── Factory ───────────────────────────────────────────────────────────────────

function makeWorkspace(overrides: {
    state?: Partial<InstallerState>
    cli?: Partial<ArduinoCliService>
    files?: Partial<FileService>
} = {}): Workspace {
    const ws = Object.create(Workspace.prototype) as Workspace

    const state = {
        selectedDevice: null,
        repoPath: null,
        configFiles: [],
        savedConfigurations: [],
        activeConfigId: null,
        selectedProduct: null,
        selectedVersion: null,
        ...overrides.state,
    } as InstallerState

    const files = {
        writeFile: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn().mockResolvedValue(''),
        exists: vi.fn().mockResolvedValue(true),
        ...overrides.files,
    } as unknown as FileService

    const cli = {
        compile: vi.fn().mockResolvedValue({ success: true, output: '' }),
        upload: vi.fn().mockResolvedValue({ success: true, output: '' }),
        ...overrides.cli,
    } as unknown as ArduinoCliService

    Object.assign(ws, {
        state,
        cli,
        files,
        router: { load: vi.fn() },
        dialogService: {},
        preferences: { get: vi.fn(), set: vi.fn() },
        isCompiling: false,
        compileLog: '',
        compileError: null,
        compileSuccess: null,
        progressPercent: 0,
        showDeviceMenu: false,
        savedConfigs: [],
        activeFileIndex: 0,
    })

    return ws
}

const REPO = '/home/user/ex-installer/repos/CommandStation-EX'

const megaDevice = {
    name: 'Arduino Mega 2560',
    port: '/dev/ttyACM0',
    fqbn: 'arduino:avr:mega',
    protocol: 'serial' as const,
    serialNumber: undefined,
}

// ── upload() — guard conditions ───────────────────────────────────────────────

describe('Workspace.upload — guard conditions', () => {
    it('returns immediately when selectedDevice is null', async () => {
        const ws = makeWorkspace({ state: { selectedDevice: null, repoPath: REPO } })
        await ws.upload()
        expect(ws.isCompiling).toBe(false)
        expect((ws as any).cli.upload).not.toHaveBeenCalled()
    })

    it('returns immediately when repoPath is null', async () => {
        const ws = makeWorkspace({ state: { selectedDevice: megaDevice, repoPath: null } })
        await ws.upload()
        expect((ws as any).cli.upload).not.toHaveBeenCalled()
    })

    it('sets compileSuccess=false when FQBN is empty', async () => {
        const ws = makeWorkspace({ state: { selectedDevice: { ...megaDevice, fqbn: '' }, repoPath: REPO } })
        await ws.upload()
        expect(ws.compileSuccess).toBe(false)
        expect(ws.compileError).toMatch(/fqbn/i)
    })
})

// ── upload() — invocation ──────────────────────────────────────────────────────

describe('Workspace.upload — cli.upload invocation', () => {
    it('calls upload with repoPath, fqbn, and port', async () => {
        const ws = makeWorkspace({ state: { selectedDevice: megaDevice, repoPath: REPO } })
        await ws.upload()
        expect((ws as any).cli.upload).toHaveBeenCalledWith(REPO, 'arduino:avr:mega', '/dev/ttyACM0')
    })

    it('does not call cli.compile', async () => {
        const ws = makeWorkspace({ state: { selectedDevice: megaDevice, repoPath: REPO } })
        await ws.upload()
        expect((ws as any).cli.compile).not.toHaveBeenCalled()
    })
})

// ── upload() — success outcome ────────────────────────────────────────────────

describe('Workspace.upload — success outcome', () => {
    it('sets compileSuccess=true', async () => {
        const ws = makeWorkspace({ state: { selectedDevice: megaDevice, repoPath: REPO } })
        await ws.upload()
        expect(ws.compileSuccess).toBe(true)
    })

    it('progressPercent reaches 100', async () => {
        const ws = makeWorkspace({ state: { selectedDevice: megaDevice, repoPath: REPO } })
        await ws.upload()
        expect(ws.progressPercent).toBe(100)
    })

    it('log contains upload output', async () => {
        const ws = makeWorkspace({
            state: { selectedDevice: megaDevice, repoPath: REPO },
            cli: { upload: vi.fn().mockResolvedValue({ success: true, output: 'avrdude done.' }) },
        })
        await ws.upload()
        expect(ws.compileLog).toContain('avrdude done.')
    })

    it('log contains upload complete marker', async () => {
        const ws = makeWorkspace({ state: { selectedDevice: megaDevice, repoPath: REPO } })
        await ws.upload()
        expect(ws.compileLog).toContain('✓ Upload complete!')
    })

    it('isCompiling is false when done', async () => {
        const ws = makeWorkspace({ state: { selectedDevice: megaDevice, repoPath: REPO } })
        await ws.upload()
        expect(ws.isCompiling).toBe(false)
    })
})

// ── upload() — failure outcomes ───────────────────────────────────────────────

describe('Workspace.upload — failure outcomes', () => {
    it('sets compileSuccess=false', async () => {
        const ws = makeWorkspace({
            state: { selectedDevice: megaDevice, repoPath: REPO },
            cli: { upload: vi.fn().mockResolvedValue({ success: false, output: '', error: 'port busy' }) },
        })
        await ws.upload()
        expect(ws.compileSuccess).toBe(false)
    })

    it('surfaces the upload error string', async () => {
        const ws = makeWorkspace({
            state: { selectedDevice: megaDevice, repoPath: REPO },
            cli: { upload: vi.fn().mockResolvedValue({ success: false, output: '', error: 'port busy' }) },
        })
        await ws.upload()
        expect(ws.compileError).toBe('port busy')
    })

    it("falls back to 'Upload failed' when no error string is provided", async () => {
        const ws = makeWorkspace({
            state: { selectedDevice: megaDevice, repoPath: REPO },
            cli: { upload: vi.fn().mockResolvedValue({ success: false, output: '' }) },
        })
        await ws.upload()
        expect(ws.compileError).toBe('Upload failed')
    })

    it('isCompiling is false after failure', async () => {
        const ws = makeWorkspace({
            state: { selectedDevice: megaDevice, repoPath: REPO },
            cli: { upload: vi.fn().mockResolvedValue({ success: false, output: '', error: 'err' }) },
        })
        await ws.upload()
        expect(ws.isCompiling).toBe(false)
    })

    it('isCompiling is false when cli.upload throws unexpectedly', async () => {
        const ws = makeWorkspace({
            state: { selectedDevice: megaDevice, repoPath: REPO },
            cli: { upload: vi.fn().mockRejectedValue(new Error('IPC channel closed')) },
        })
        await ws.upload()
        expect(ws.isCompiling).toBe(false)
        expect(ws.compileSuccess).toBe(false)
    })
})

// ── compileAndUpload() — orchestration ────────────────────────────────────────

describe('Workspace.compileAndUpload — orchestration', () => {
    it('calls compile then upload on success', async () => {
        const callOrder: string[] = []
        const cli = {
            compile: vi.fn().mockImplementation(async () => { callOrder.push('compile'); return { success: true, output: '' } }),
            upload: vi.fn().mockImplementation(async () => { callOrder.push('upload'); return { success: true, output: '' } }),
        } as unknown as ArduinoCliService
        const ws = makeWorkspace({ state: { selectedDevice: megaDevice, repoPath: REPO, configFiles: [] }, cli })
        await ws.compileAndUpload()
        expect(callOrder).toEqual(['compile', 'upload'])
    })

    it('does not call upload when compile fails', async () => {
        const uploadMock = vi.fn()
        const ws = makeWorkspace({
            state: { selectedDevice: megaDevice, repoPath: REPO, configFiles: [] },
            cli: {
                compile: vi.fn().mockResolvedValue({ success: false, output: '', error: 'compile error' }),
                upload: uploadMock,
            },
        })
        await ws.compileAndUpload()
        expect(uploadMock).not.toHaveBeenCalled()
    })

    it('does not call upload when device is null', async () => {
        const uploadMock = vi.fn()
        const ws = makeWorkspace({ state: { selectedDevice: null, repoPath: REPO }, cli: { upload: uploadMock } })
        await ws.compileAndUpload()
        expect(uploadMock).not.toHaveBeenCalled()
    })

    describe('full happy path', () => {
        let ws: Workspace

        beforeEach(async () => {
            const configFiles = [{ name: 'config.h', content: '#define MOTOR_SHIELD_TYPE STANDARD_MOTOR_SHIELD\n' }]
            ws = makeWorkspace({
                state: { selectedDevice: megaDevice, repoPath: REPO, configFiles },
                cli: {
                    compile: vi.fn().mockResolvedValue({ success: true, output: 'Sketch uses 12345 bytes' }),
                    upload: vi.fn().mockResolvedValue({ success: true, output: 'avrdude done.' }),
                },
            })
            await ws.compileAndUpload()
        })

        it('compileSuccess=true', () => { expect(ws.compileSuccess).toBe(true) })
        it('compileError is null', () => { expect(ws.compileError).toBeNull() })
        it('isCompiling is false', () => { expect(ws.isCompiling).toBe(false) })
        it('progressPercent is 100', () => { expect(ws.progressPercent).toBe(100) })
        it('log contains compile output', () => { expect(ws.compileLog).toContain('Sketch uses 12345 bytes') })
        it('log contains upload output', () => { expect(ws.compileLog).toContain('avrdude done.') })
        it('log contains upload complete marker', () => { expect(ws.compileLog).toContain('✓ Upload complete!') })
    })
})
