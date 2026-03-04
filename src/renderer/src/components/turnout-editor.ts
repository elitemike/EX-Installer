import { queueTask, resolve } from 'aurelia'
import { IDialogService } from '@aurelia/dialog'
import { Splitter } from '@syncfusion/ej2-layouts'
import { ConfigEditorState } from '../models/config-editor-state'
import type { Turnout, TurnoutProfile } from '../utils/myAutomationParser'

type ViewTab = 'visual' | 'raw'

export class TurnoutEditorCustomElement {
    private readonly state = resolve(ConfigEditorState)
    private readonly dialogService = resolve(IDialogService)
    private splitterObj: Splitter | null = null

    readonly profiles: TurnoutProfile[] = ['Instant', 'Fast', 'Medium', 'Slow', 'Bounce']

    // ── View tabs ─────────────────────────────────────────────────────────────
    activeTab: ViewTab = 'visual'

    setTab(tab: ViewTab): void {
        if (tab === 'raw' && this.editBuffer !== null) {
            this.commitBuffer()
        }
        this.activeTab = tab
        if (tab === 'raw') this._refreshRaw()
    }

    // ── Lifecycle ──────────────────────────────────────────────────────
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
                    const pane = document.querySelector('#turnout-splitter > div:first-child') as HTMLElement
                    if (pane) this._saveSidebarWidth(`${pane.offsetWidth}px`)
                },
            })
            this.splitterObj.appendTo('#turnout-splitter')
        })
    }

    detaching(): void {
        this.splitterObj?.destroy()
        this.splitterObj = null
    }

    private _loadSidebarWidth(): string {
        try { return localStorage.getItem('turnout-editor-sidebar-width') ?? '256px' } catch { return '256px' }
    }
    private _saveSidebarWidth(size: string): void {
        try { localStorage.setItem('turnout-editor-sidebar-width', size) } catch { /* ignore */ }
    }

    // ── Raw content for Monaco ────────────────────────────────────────────────
    rawContent = ''

    private _refreshRaw(): void {
        this.rawContent = this.state.turnoutsRaw
    }

    onRawChange(event: CustomEvent<string>): void {
        this.state.setTurnoutsFromRaw(event.detail)
        if (this.editBufferIndex !== null) {
            const fresh = this.state.turnouts[this.editBufferIndex]
            if (fresh) {
                this._setBuffer(this.editBufferIndex, fresh)
            } else {
                this.clearBuffer()
            }
        }
    }

    // ── Selection / edit buffer ───────────────────────────────────────────────
    editBuffer: Turnout | null = null
    editBufferIndex: number | null = null

    get turnouts(): Turnout[] {
        return this.state.turnouts
    }

    private _setBuffer(index: number, entry: Turnout): void {
        this.editBufferIndex = index
        this.editBuffer = { ...entry }
    }

    selectEntry(entry: Turnout): void {
        if (this.editBuffer !== null) this.commitBuffer()
        const idx = this.state.turnouts.indexOf(entry)
        if (idx !== -1) this._setBuffer(idx, entry)
    }

    clearBuffer(): void {
        this.editBuffer = null
        this.editBufferIndex = null
    }

    commitBuffer(): void {
        if (this.editBuffer === null || this.editBufferIndex === null) return
        this.state.updateTurnoutEntry(this.editBufferIndex, { ...this.editBuffer })
        if (this.activeTab === 'raw') this._refreshRaw()
    }

    // ── Field blur handlers (commit on leave) ─────────────────────────────────
    onFieldBlur(): void {
        this.commitBuffer()
    }

    updateProfile(profile: TurnoutProfile): void {
        if (!this.editBuffer) return
        this.editBuffer.profile = profile
        this.commitBuffer()
    }

    // ── Add / remove entries ──────────────────────────────────────────────────
    addEntry(): void {
        if (this.editBuffer !== null) this.commitBuffer()
        const ts = this.state.turnouts
        const maxId = ts.length > 0 ? Math.max(...ts.map(t => t.id)) + 1 : 200
        const maxPin = ts.length > 0 ? Math.max(...ts.map(t => t.pin)) + 1 : 101
        const newEntry: Turnout = {
            id: maxId,
            pin: maxPin,
            activeAngle: 400,
            inactiveAngle: 100,
            profile: 'Slow',
            description: 'New Turnout',
            comment: '',
        }
        this.state.addTurnoutEntry(newEntry)
        const idx = this.state.turnouts.length - 1
        this._setBuffer(idx, this.state.turnouts[idx])
        if (this.activeTab === 'raw') this._refreshRaw()
    }

    async removeEntryByIndex(index: number, event?: Event): Promise<void> {
        event?.stopPropagation()
        const entry = this.state.turnouts[index]
        const name = this.getDisplayName(entry)
        const confirmed = await this._confirm(`Delete "${name}"?`, `Are you sure you want to remove this turnout?`)
        if (!confirmed) return
        if (this.editBufferIndex === index) this.clearBuffer()
        else if (this.editBufferIndex !== null && this.editBufferIndex > index) {
            this.editBufferIndex--
        }
        this.state.removeTurnoutEntry(index)
        if (this.activeTab === 'raw') this._refreshRaw()
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    getDisplayName(t: Turnout): string {
        return t.description ? `${t.description} (${t.id})` : `Turnout ${t.id}`
    }

    profileColor(profile: TurnoutProfile): string {
        const map: Record<TurnoutProfile, string> = {
            Instant: 'bg-red-500',
            Fast: 'bg-amber-500',
            Medium: 'bg-blue-500',
            Slow: 'bg-green-500',
            Bounce: 'bg-purple-500',
        }
        return map[profile] ?? 'bg-gray-500'
    }

    get selectedIndex(): number | null {
        return this.editBufferIndex
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
