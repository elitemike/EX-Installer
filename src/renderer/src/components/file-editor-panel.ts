import { bindable, resolve } from 'aurelia'
import { ConfigEditorState } from '../models/config-editor-state'
import { InstallerState } from '../models/installer-state'
import { friendlyName } from '../utils/friendly-names'

/**
 * file-editor-panel — replaces the raw textarea in workspace.html.
 * Shows a specialized editor based on the active config file name, falling
 * back to a plain Monaco editor for unknown file types.
 */
export class FileEditorPanelCustomElement {
    readonly state = resolve(ConfigEditorState)
    readonly installer = resolve(InstallerState)

    /** Currently selected file index (passed in from workspace) */
    @bindable activeFileIndex = 0

    get activeFile(): { name: string; content: string } | null {
        return this.installer.configFiles[this.activeFileIndex] ?? null
    }

    get isConfigH(): boolean {
        return this.activeFile?.name === 'config.h'
    }

    get isRoster(): boolean {
        return this.activeFile?.name === 'myRoster.h'
    }

    get isTurnouts(): boolean {
        return this.activeFile?.name === 'myTurnouts.h'
    }

    get isAutomation(): boolean {
        return this.activeFile?.name === 'myAutomation.h'
    }

    readonly friendlyName = friendlyName

    get isGeneric(): boolean {
        return !this.isConfigH && !this.isRoster && !this.isTurnouts && !this.isAutomation
    }

    // Raw content for generic files — getter/setter so two-way binding works
    get genericContent(): string {
        return this.activeFile?.content ?? ''
    }

    set genericContent(val: string) {
        if (this.activeFile) {
            this.activeFile.content = val
        }
    }

    get automationPreview(): string {
        return this.state.automationPreview
    }
}
