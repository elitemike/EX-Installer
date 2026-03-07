import { ipcMain, app } from 'electron'
import { IS_DEV_MOCK } from '../index'

export function registerConfigIpcHandlers(): void {
    ipcMain.handle('config:get-mock', () => {
        return IS_DEV_MOCK
    })

    ipcMain.handle('config:get-skip-startup', () => {
        return app.commandLine.hasSwitch('skip-startup') || process.argv.includes('--skip-startup')
    })
}
