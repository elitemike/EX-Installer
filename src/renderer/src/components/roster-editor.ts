import { queueTask, resolve } from 'aurelia'
import { IDialogService } from '@aurelia/dialog'
import { Splitter } from '@syncfusion/ej2-layouts'
import { ConfigEditorState } from '../models/config-editor-state'
import type { Roster, RosterFunction } from '../utils/myAutomationParser'
import { getRealFunctions, commentInvalidRosterLines } from '../utils/myAutomationParser'
import { ToastService } from '../services/toast.service'

type ViewTab = 'visual' | 'raw'

export class RosterEditorCustomElement {
    readonly state = resolve(ConfigEditorState)
    private readonly dialogService = resolve(IDialogService)
    private readonly toastService = resolve(ToastService)
    private splitterObj: Splitter | null = null

    // ── View tabs ─────────────────────────────────────────────────────────────
    activeTab: ViewTab = 'visual'

    setTab(tab: ViewTab): void {
        if (tab === 'raw' && this.editBuffer !== null) {
            this.commitBuffer()
        }
        if (tab === 'visual' && this.activeTab === 'raw') {
            // flush() cancels the debounce and returns the live model text.
            // Fall back to _rawText (last text received via onRawChange) in case
            // rawEditor is somehow null (e.g. race during component teardown).
            const text = this.rawEditor?.flush() ?? this._rawText
            this._processRawLeave(text)
            // Refresh the visual edit buffer from the newly-parsed state.
            if (this.editBufferIndex !== null) {
                const fresh = this.state.roster[this.editBufferIndex]
                if (fresh) this._setBuffer(this.editBufferIndex, fresh)
                else this.clearBuffer()
            }
        }
        if (tab === 'raw') {
            this.rawSnapshot = this.state.rosterRaw
            this._rawText = this.rawSnapshot
        }
        this.activeTab = tab
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    attached(): void {
        queueTask(() => {
            const savedWidth = this._loadSidebarWidth()
            this.splitterObj = new Splitter({
                paneSettings: [
                    { size: savedWidth, min: '200px', max: '600px' },
                    {},
                ],
                width: '100%',
                height: '100%',
                resizeStop: () => {
                    const pane = document.querySelector('#roster-splitter > div:first-child') as HTMLElement
                    if (pane) this._saveSidebarWidth(`${pane.offsetWidth}px`)
                },
            })
            this.splitterObj.appendTo('#roster-splitter')
        })
    }

    detaching(): void {
        if (this.activeTab === 'raw') {
            const text = this.rawEditor?.flush() ?? this._rawText
            this._processRawLeave(text)
        } else if (this.editBuffer !== null) {
            this.commitBuffer()
        }
        this.splitterObj?.destroy()
        this.splitterObj = null
    }

    /**
     * Called whenever the user navigates away from raw mode.
     *
     * 1. Comments out any newly-invalid ROSTER lines and fires a toast for them.
     * 2. Persists ALL `// [INVALID]` lines (new + pre-existing) so they survive
     *    subsequent raw↔visual round-trips and don't silently disappear.
     */
    _processRawLeave(text: string): void {
        const { processedText, invalidLines } = commentInvalidRosterLines(text)

        // Collect every [INVALID] line present in the processed text — this
        // includes lines that were already commented on a previous pass so they
        // are not lost when no *new* invalid lines are found this time.
        // Must be set BEFORE setRosterFromRaw so _syncToInstallerState (called
        // inside setRosterFromRaw) reads the updated rosterRaw getter.
        const allInvalidComments = processedText
            .split('\n')
            .filter(l => l.trimStart().startsWith('// [INVALID]'))

        this.state.rosterPreservedComments = allInvalidComments.join('\n')
        this.state.setRosterFromRaw(processedText)

        // Toast only when NEW invalid lines are found on this pass.
        // Already-commented lines are not re-toasted on subsequent toggles.
        if (invalidLines.length > 0) {
            this.toastService.show({
                title: 'Invalid Lines Commented Out',
                content: `${invalidLines.length} invalid roster line${invalidLines.length > 1 ? 's are' : ' is'} commented out to prevent data loss. Switch to Raw to review and fix.`,
                cssClass: 'e-toast-warning',
            })
        }
    }

    private _loadSidebarWidth(): string {
        try { return localStorage.getItem('roster-editor-sidebar-width') ?? '256px' } catch { return '256px' }
    }
    private _saveSidebarWidth(size: string): void {
        try { localStorage.setItem('roster-editor-sidebar-width', size) } catch { /* ignore */ }
    }

    // ── Raw snapshot for Monaco ───────────────────────────────────────────────
    rawEditor: { flush(): string } | null = null
    rawSnapshot = ''
    /** Last text received from Monaco (via onRawChange or on raw-tab entry). */
    private _rawText = ''

    // Arrow function so it can be passed as a bindable callback without losing `this`.
    onRawChange = (text: string): void => {
        this._rawText = text
        this.state.setRosterFromRaw(text)
        if (this.editBufferIndex !== null) {
            const fresh = this.state.roster[this.editBufferIndex]
            if (fresh) this._setBuffer(this.editBufferIndex, fresh)
            else this.clearBuffer()
        }
    }

    // ── Selection / edit buffer ───────────────────────────────────────────────
    editBuffer: Roster | null = null
    editBufferIndex: number | null = null
    errorMessage = ''

    get roster(): Roster[] {
        return this.state.roster
    }

    get selectedEntry(): Roster | null {
        if (this.editBufferIndex === null) return null
        return this.state.roster[this.editBufferIndex] ?? null
    }

    private _setBuffer(index: number, entry: Roster): void {
        this.editBufferIndex = index
        this.editBuffer = {
            dccAddress: entry.dccAddress,
            name: entry.name,
            comment: entry.comment,
            functions: entry.functions.map(f => ({ ...f })),
            functionMacro: entry.functionMacro,
        }
        this.dccAddressInput = String(entry.dccAddress)
        this.errorMessage = ''
    }

    selectEntry(entry: Roster): void {
        if (this.editBuffer !== null) this.commitBuffer()
        const idx = this.state.roster.indexOf(entry)
        if (idx !== -1) this._setBuffer(idx, entry)
    }

    clearBuffer(): void {
        this.editBuffer = null
        this.editBufferIndex = null
        this.errorMessage = ''
    }

    commitBuffer(): void {
        if (this.editBuffer === null || this.editBufferIndex === null) return
        const conflict = this.state.roster.find(
            (r, i) => i !== this.editBufferIndex && r.dccAddress === this.editBuffer!.dccAddress,
        )
        if (conflict) {
            this.errorMessage = `DCC address ${this.editBuffer.dccAddress} is already used by "${conflict.name}".`
            return
        }
        this.state.updateRosterEntry(this.editBufferIndex, { ...this.editBuffer })
        this.errorMessage = ''
    }

    // ── DCC address handling ──────────────────────────────────────────────────
    dccAddressInput = ''

    onDccAddressInput(): void {
        const n = parseInt(this.dccAddressInput, 10)
        if (!isNaN(n) && this.editBuffer) {
            this.editBuffer.dccAddress = n
        }
    }

    onDccAddressBlur(): void {
        this.commitBuffer()
    }

    onNameBlur(): void {
        this.commitBuffer()
    }

    onCommentBlur(): void {
        this.commitBuffer()
    }

    // ── Add / remove roster entries ───────────────────────────────────────────
    addEntry(): void {
        if (this.editBuffer !== null) this.commitBuffer()
        const maxAddr =
            this.state.roster.length > 0 ? Math.max(...this.state.roster.map(r => r.dccAddress)) + 1 : 1
        const newEntry: Roster = {
            dccAddress: maxAddr,
            name: `New Loco ${maxAddr}`,
            functions: [],
            comment: '',
        }
        this.state.addRosterEntry(newEntry)
        const idx = this.state.roster.length - 1
        this._setBuffer(idx, this.state.roster[idx])
    }

    async removeEntryByIndex(index: number, event?: Event): Promise<void> {
        event?.stopPropagation()
        const entry = this.state.roster[index]
        const name = entry?.name || `Roster ${index}`
        const confirmed = await this._confirm(`Delete "${name}"?`, `Are you sure you want to remove this roster entry?`)
        if (!confirmed) return
        if (this.editBufferIndex === index) this.clearBuffer()
        else if (this.editBufferIndex !== null && this.editBufferIndex > index) {
            this.editBufferIndex--
        }
        this.state.removeRosterEntry(index)
    }

    // ── Functions management ──────────────────────────────────────────────────
    newFunctionName = ''
    newFunctionIsMomentary = false
    newFunctionNoFunction = false

    addFunction(): void {
        if (!this.editBuffer) return
        if (!this.newFunctionNoFunction && !this.newFunctionName.trim()) return
        const fn: RosterFunction = {
            name: this.newFunctionNoFunction ? '' : this.newFunctionName.trim(),
            isMomentary: this.newFunctionIsMomentary,
            noFunction: this.newFunctionNoFunction,
        }
        this.editBuffer.functions = [...this.editBuffer.functions, fn]
        this.newFunctionName = ''
        this.newFunctionIsMomentary = false
        this.newFunctionNoFunction = false
        this.commitBuffer()
    }

    removeFunction(index: number): void {
        if (!this.editBuffer) return
        this.editBuffer.functions = this.editBuffer.functions.filter((_, i) => i !== index)
        this.commitBuffer()
    }

    updateFunctionName(index: number): void {
        // binding already updated editBuffer.functions[index].name
        this.commitBuffer()
    }

    toggleMomentary(index: number): void {
        if (!this.editBuffer) return
        this.editBuffer.functions[index] = {
            ...this.editBuffer.functions[index],
            isMomentary: !this.editBuffer.functions[index].isMomentary,
        }
        this.commitBuffer()
    }

    // Drag-to-reorder
    draggedIndex: number | null = null

    dragStart(index: number, event: DragEvent): void {
        this.draggedIndex = index
        event.dataTransfer!.effectAllowed = 'move'
    }

    dragOver(event: DragEvent): void {
        event.preventDefault()
        event.dataTransfer!.dropEffect = 'move'
    }

    drop(targetIndex: number, event: DragEvent): void {
        event.preventDefault()
        if (this.draggedIndex === null || this.draggedIndex === targetIndex || !this.editBuffer) return
        const fns = [...this.editBuffer.functions]
        const [moved] = fns.splice(this.draggedIndex, 1)
        fns.splice(targetIndex, 0, moved)
        this.editBuffer.functions = fns
        this.draggedIndex = null
        this.commitBuffer()
    }

    dragEnd(): void {
        this.draggedIndex = null
    }

    handleAddFunctionKeydown(event: KeyboardEvent): boolean {
        if (event.key === 'Enter') {
            this.addFunction()
            return false
        }
        return true
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    getRealFunctionCount(entry: Roster): number {
        return getRealFunctions(entry).length
    }

    get hasEntries(): boolean {
        return this.state.roster.length > 0
    }

    private async _confirm(title: string, message: string): Promise<boolean> {
        try {
            const { dialog } = await this.dialogService.open({
                component: () =>
                    import('./confirm-dialog').then(m => m.ConfirmDialog).catch(() => null),
                model: { title, message },
            })
            const result = await dialog.closed
            return result.status === 'ok'
        } catch {
            return window.confirm(`${title}\n\n${message}`)
        }
    }
}
