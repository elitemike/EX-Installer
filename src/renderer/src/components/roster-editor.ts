import { queueTask, resolve } from 'aurelia'
import { IDialogService } from '@aurelia/dialog'
import { Splitter } from '@syncfusion/ej2-layouts'
import { ConfigEditorState } from '../models/config-editor-state'
import type { Roster, RosterFunction } from '../utils/myAutomationParser'
import { getRealFunctions } from '../utils/myAutomationParser'

type ViewTab = 'visual' | 'raw'

export class RosterEditorCustomElement {
    private readonly state = resolve(ConfigEditorState)
    private readonly dialogService = resolve(IDialogService)
    private splitterObj: Splitter | null = null

    // ── View tabs ─────────────────────────────────────────────────────────────
    activeTab: ViewTab = 'visual'

    setTab(tab: ViewTab): void {
        if (tab === 'raw' && this.editBuffer !== null) {
            this.commitBuffer()
        }
        // When leaving raw, flush any pending edits the debounce may not have
        // delivered yet, then refresh the edit buffer from the updated state.
        if (tab === 'visual' && this.activeTab === 'raw') {
            this.rawEditor?.flush()   // cancels debounce, pushes latest text → rawContent
            this.state.setRosterFromRaw(this.rawContent)
            if (this.editBufferIndex !== null) {
                const fresh = this.state.roster[this.editBufferIndex]
                if (fresh) this._setBuffer(this.editBufferIndex, fresh)
                else this.clearBuffer()
            }
        }
        this.activeTab = tab
        if (tab === 'raw') {
            this._refreshRaw()
        }
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
        this.splitterObj?.destroy()
        this.splitterObj = null
    }

    private _loadSidebarWidth(): string {
        try { return localStorage.getItem('roster-editor-sidebar-width') ?? '256px' } catch { return '256px' }
    }
    private _saveSidebarWidth(size: string): void {
        try { localStorage.setItem('roster-editor-sidebar-width', size) } catch { /* ignore */ }
    }

    private rawEditor: { flush(): void } | null = null

    // ── Raw content for Monaco ────────────────────────────────────────────────
    rawContent = ''

    private _refreshRaw(): void {
        this.rawContent = this.state.rosterRaw
    }

    onRawChange(event: CustomEvent<string>): void {
        this.state.setRosterFromRaw(event.detail)
        // Re-derive edit buffer if the selected entry still exists
        if (this.editBufferIndex !== null) {
            const fresh = this.state.roster[this.editBufferIndex]
            if (fresh) {
                this._setBuffer(this.editBufferIndex, fresh)
            } else {
                this.clearBuffer()
            }
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
        if (this.activeTab === 'raw') this._refreshRaw()
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
        if (this.activeTab === 'raw') this._refreshRaw()
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
        if (this.activeTab === 'raw') this._refreshRaw()
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
