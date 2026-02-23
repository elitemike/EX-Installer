import { ipcMain } from 'electron'
import type { GitService } from '../git-client'
import { IS_DEV_MOCK, MOCK_VERSIONS, seedMockRepo } from '../dev-mock'

export function registerGitIpcHandlers(gitService: GitService): void {
    ipcMain.handle('git:clone', async (_event, url: string, dest: string, _branch?: string) => {
        if (IS_DEV_MOCK) {
            await seedMockRepo(dest)
            return { success: true }
        }
        return gitService.clone(url, dest, _branch)
    })

    ipcMain.handle('git:pull', async (_event, repoPath: string) => {
        if (IS_DEV_MOCK) {
            // Re-seed config files on every pull so existing repos always have them
            await seedMockRepo(repoPath)
            return { success: true }
        }
        return gitService.pull(repoPath)
    })

    ipcMain.handle('git:list-tags', async (_event, repoPath: string) => {
        if (IS_DEV_MOCK) return [...MOCK_VERSIONS]
        return gitService.listTags(repoPath)
    })

    ipcMain.handle('git:checkout', async (_event, repoPath: string, ref: string) => {
        if (IS_DEV_MOCK) return { success: true }
        return gitService.checkout(repoPath, ref)
    })

    ipcMain.handle('git:check-local-changes', async (_event, repoPath: string) => {
        if (IS_DEV_MOCK) return { hasChanges: false, files: [] }
        return gitService.checkLocalChanges(repoPath)
    })

    ipcMain.handle('git:hard-reset', async (_event, repoPath: string) => {
        if (IS_DEV_MOCK) return { success: true }
        return gitService.hardReset(repoPath)
    })
}
