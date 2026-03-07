import { app, BrowserWindow, dialog, shell } from 'electron'
import { join } from 'path'
import { config } from './config'
import { registerAllIpcHandlers } from './ipc'
import { UsbManager } from './usb-manager'
import { PythonRunner } from './python-runner'
import { ArduinoCliService } from './arduino-cli'
import { GitService } from './git-client'
import { FileService } from './file-manager'
import { PreferencesService } from './preferences'

// ── E2E Test isolation ───────────────────────────────────────────────────────
// Allow tests to point userData at a temp directory so preferences don't bleed.
const testDataDir = app.commandLine.getSwitchValue('test-data-dir')
if (testDataDir) {
    app.setPath('userData', testDataDir)
}

// ── Mock mode flag ──────────────────────────────────────────────────────────
/**
 * Runtime mock mode flag.
 *
 * Works for both `electron-vite dev -- --mock` and packaged executables
 * launched with `./EX-Installer --mock`.
 */
export const IS_DEV_MOCK =
    app.commandLine.hasSwitch('mock') || process.argv.includes('--mock')

if (config.disableHardwareAcceleration) app.disableHardwareAcceleration()

if (config.disableDBus && process.platform === 'linux') {
    process.env['DBUS_SESSION_BUS_ADDRESS'] ??= 'disabled:'
}
if (config.disableMediaSession) {
    app.commandLine.appendSwitch('disable-features', 'MediaSessionService')
}

// Enable Chromium remote DevTools protocol so VS Code's Chrome debugger
// can attach to the renderer process on port 9222 during development.
if (process.env['ELECTRON_RENDERER_URL']) {
    app.commandLine.appendSwitch('remote-debugging-port', '9222')
}

// ── Singletons shared between IPC handlers ──────────────────────────────────
export const usbManager = new UsbManager()
export const pythonRunner = new PythonRunner()
export const arduinoCliService = new ArduinoCliService()
export const gitService = new GitService()
export const fileService = new FileService()
export const preferencesService = new PreferencesService()

// ── Window factory ───────────────────────────────────────────────────────────
function createWindow(): BrowserWindow {
    const win = new BrowserWindow({
        width: config.window.width,
        height: config.window.height,
        minWidth: config.window.minWidth,
        minHeight: config.window.minHeight,
        resizable: config.window.resizable,
        maximizable: config.window.maximizable,
        show: false,
        autoHideMenuBar: true,
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            sandbox: false,
            contextIsolation: true,
            nodeIntegration: false,
            // In E2E test mode the renderer loads from file:// rather than a
            // localhost dev-server URL.  Third-party libraries (e.g. Syncfusion)
            // perform domain-based license validation that passes on localhost
            // but fires alert overlays on file://.  Disabling web-security for
            // the test window makes file:// behave like a local trusted origin.
            webSecurity: !testDataDir,
        },
    })

    win.on('ready-to-show', () => {
        win.show()
        if (process.env['ELECTRON_RENDERER_URL']) {
            //win.webContents.openDevTools()
        }
    })

    // ── Unsaved-changes prompt ────────────────────────────────────────────────
    // Renderer sets window.onbeforeunload to return 'unsaved' when hasChanges.
    // Electron fires will-prevent-unload here instead of showing a browser dialog.
    win.webContents.on('will-prevent-unload', (event) => {
        // In E2E test mode, skip the dialog and close immediately.
        if (testDataDir) {
            event.preventDefault()
            win.destroy()
            return
        }
        const choice = dialog.showMessageBoxSync(win, {
            type: 'question',
            buttons: ['Discard & Close', 'Cancel'],
            defaultId: 1,
            cancelId: 1,
            title: 'Unsaved Changes',
            message: 'You have unsaved configuration changes.',
            detail: 'If you close now, your changes will be lost.',
        })
        if (choice === 0) {
            // User chose "Discard & Close" — forcefully destroy the window.
            event.preventDefault()
            win.destroy()
        }
        // choice === 1 (Cancel) → do nothing, the unload is already prevented.
    })

    // F5 or Ctrl+R / Cmd+R → reload the renderer
    // F12 or Ctrl+Shift+I / Cmd+Option+I → toggle DevTools
    win.webContents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown') return
        const reload =
            input.key === 'F5' ||
            ((input.control || input.meta) && input.key === 'r')
        if (reload) {
            event.preventDefault()   // stop Chromium's built-in reload (would restore the hash URL)
            if (process.env['ELECTRON_RENDERER_URL']) {
                win.loadURL(process.env['ELECTRON_RENDERER_URL'])
            } else {
                win.loadFile(join(__dirname, '../renderer/index.html'))
            }
            return
        }

        const devtools =
            input.key === 'F12' ||
            ((input.control || input.meta) && input.shift && input.key === 'I')
        if (devtools) win.webContents.toggleDevTools()
    })

    // Open external links in the OS browser, not in Electron
    win.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url)
        return { action: 'deny' }
    })

    if (process.env['ELECTRON_RENDERER_URL']) {
        // Dev: Vite dev-server URL injected by electron-vite
        win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
        // Prod: load compiled HTML
        win.loadFile(join(__dirname, '../renderer/index.html'))
    }

    return win
}

// ── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
    registerAllIpcHandlers({
        usbManager,
        pythonRunner,
        arduinoCliService,
        gitService,
        fileService,
        preferencesService,
    })
    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('window-all-closed', () => {
    usbManager.dispose()
    pythonRunner.killAll()
    if (process.platform !== 'darwin') app.quit()
})
