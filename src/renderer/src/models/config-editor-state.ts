import { observable, resolve } from 'aurelia'
import { InstallerState } from './installer-state'
import type { Roster, Turnout } from '../utils/myAutomationParser'
import {
    serializeRosterToFile,
    serializeTurnoutToFile,
    parseRosterFromFile,
    parseTurnoutFromFile,
} from '../utils/myAutomationParser'

/**
 * ConfigEditorState — singleton that owns the in-memory editing state for all
 * configuration files.  It is the single source of truth for:
 *   • config.h                  (raw text)
 *   • myRoster.h                (structured Roster[] + raw text view)
 *   • myTurnouts.h              (structured Turnout[] + raw text view)
 *   • myAutomation.h            (auto-generated; read-only preview)
 *
 * It mirrors changes back to InstallerState.configFiles so the existing
 * workspace save flow continues to work without modification.
 */
export class ConfigEditorState {
    private readonly installerState = resolve(InstallerState)

    // ── config.h ─────────────────────────────────────────────────────────────
    configHContent = ''

    // ── Unsaved-changes tracking ──────────────────────────────────────────────
    hasChanges = false

    // ── myRoster.h ───────────────────────────────────────────────────────────
    @observable roster: Roster[] = []

    get rosterRaw(): string {
        return serializeRosterToFile(this.roster)
    }

    setRosterFromRaw(text: string): void {
        try {
            this.roster = parseRosterFromFile(text)
            this.hasChanges = true
        } catch {
            // keep existing roster if parse fails
        }
        this._syncToInstallerState()
    }

    updateRosterEntry(index: number, entry: Roster): void {
        this.roster = this.roster.map((r, i) => (i === index ? { ...entry } : r))
        this.hasChanges = true
        this._syncToInstallerState()
    }

    addRosterEntry(entry: Roster): void {
        this.roster = [...this.roster, entry]
        this.hasChanges = true
        this._syncToInstallerState()
    }

    removeRosterEntry(index: number): void {
        this.roster = this.roster.filter((_, i) => i !== index)
        this.hasChanges = true
        this._syncToInstallerState()
    }

    // ── myTurnouts.h ─────────────────────────────────────────────────────────
    @observable turnouts: Turnout[] = []

    get turnoutsRaw(): string {
        return serializeTurnoutToFile(this.turnouts)
    }

    setTurnoutsFromRaw(text: string): void {
        try {
            this.turnouts = parseTurnoutFromFile(text)
            this.hasChanges = true
        } catch {
            // keep existing turnouts if parse fails
        }
        this._syncToInstallerState()
    }

    updateTurnoutEntry(index: number, entry: Turnout): void {
        this.turnouts = this.turnouts.map((t, i) => (i === index ? { ...entry } : t))
        this.hasChanges = true
        this._syncToInstallerState()
    }

    addTurnoutEntry(entry: Turnout): void {
        this.turnouts = [...this.turnouts, entry]
        this.hasChanges = true
        this._syncToInstallerState()
    }

    removeTurnoutEntry(index: number): void {
        this.turnouts = this.turnouts.filter((_, i) => i !== index)
        this.hasChanges = true
        this._syncToInstallerState()
    }

    // ── Preserved content (non-ROSTER/TURNOUT lines from imported myAutomation.h)
    preservedAutomationContent = ''

    /** Names of the four built-in managed files — never auto-included */
    private static readonly BUILTIN = new Set(['config.h', 'myRoster.h', 'myTurnouts.h', 'myAutomation.h'])

    /** Returns true if this filename was created by the user (not a built-in) */
    isCustomFile(name: string): boolean {
        return !ConfigEditorState.BUILTIN.has(name)
    }

    /** All custom file names currently in the file list */
    get customFileNames(): string[] {
        return this.installerState.configFiles
            .map(f => f.name)
            .filter(n => this.isCustomFile(n))
    }

    // ── Generated myAutomation.h preview ─────────────────────────────────────
    get automationPreview(): string {
        const lines: string[] = []
        if (this.roster.length > 0) lines.push('#include "myRoster.h"')
        if (this.turnouts.length > 0) lines.push('#include "myTurnouts.h"')
        for (const name of this.customFileNames) {
            lines.push(`#include "${name}"`)
        }
        if (this.preservedAutomationContent.trim()) {
            if (lines.length > 0) lines.push('')
            lines.push(this.preservedAutomationContent.trim())
        }
        return lines.join('\n')
    }

    // ── Custom file management ────────────────────────────────────────────────
    addCustomFile(name: string): void {
        const files = this.installerState.configFiles
        if (files.some(f => f.name === name)) return  // already exists
        // Insert before myAutomation.h if it exists, otherwise push
        const automationIdx = files.findIndex(f => f.name === 'myAutomation.h')
        const newFile = { name, content: `// ${name}\n// Add your custom DCC-EX commands here\n` }
        if (automationIdx !== -1) {
            files.splice(automationIdx, 0, newFile)
        } else {
            files.push(newFile)
        }
        this._syncToInstallerState()
    }

    removeCustomFile(name: string): void {
        if (!this.isCustomFile(name)) return  // refuse to delete built-ins
        const files = this.installerState.configFiles
        const idx = files.findIndex(f => f.name === name)
        if (idx !== -1) files.splice(idx, 1)
        this._syncToInstallerState()
    }

    // ── Initialise from InstallerState.configFiles ────────────────────────────
    loadFromInstallerState(): void {
        const files = this.installerState.configFiles
        for (const f of files) {
            if (f.name === 'config.h') {
                this.configHContent = f.content
            } else if (f.name === 'myRoster.h') {
                this.roster = parseRosterFromFile(f.content)
            } else if (f.name === 'myTurnouts.h') {
                this.turnouts = parseTurnoutFromFile(f.content)
            }
        }
        this.hasChanges = false
        // Ensure myRoster.h + myTurnouts.h always appear in the file list
        // so their visual editors are reachable from the sidebar.
        const names = files.map(f => f.name)
        if (!names.includes('myRoster.h')) {
            files.push({ name: 'myRoster.h', content: this.rosterRaw })
        }
        if (!names.includes('myTurnouts.h')) {
            files.push({ name: 'myTurnouts.h', content: this.turnoutsRaw })
        }
        if (!names.includes('myAutomation.h')) {
            files.push({ name: 'myAutomation.h', content: this.automationPreview })
        }
    }

    // ── Write back to InstallerState.configFiles ──────────────────────────────
    private _syncToInstallerState(): void {
        for (const f of this.installerState.configFiles) {
            if (f.name === 'config.h') {
                f.content = this.configHContent
            } else if (f.name === 'myRoster.h') {
                f.content = this.rosterRaw
            } else if (f.name === 'myTurnouts.h') {
                f.content = this.turnoutsRaw
            } else if (f.name === 'myAutomation.h') {
                f.content = this.automationPreview
            }
        }
        // Ensure myAutomation.h exists in configFiles if roster/turnouts populated
        this._ensureAutomationFile()
    }

    private _ensureAutomationFile(): void {
        const files = this.installerState.configFiles
        const hasAutomation = files.some(f => f.name === 'myAutomation.h')
        const needsIt = this.roster.length > 0 || this.turnouts.length > 0 || this.customFileNames.length > 0
        if (!hasAutomation && needsIt) {
            files.push({ name: 'myAutomation.h', content: this.automationPreview })
        } else if (hasAutomation) {
            // Always keep content up-to-date
            const af = files.find(f => f.name === 'myAutomation.h')!
            af.content = this.automationPreview
        }
    }

    syncConfigH(): void {
        this.hasChanges = true
        for (const f of this.installerState.configFiles) {
            if (f.name === 'config.h') {
                f.content = this.configHContent
            }
        }
    }

    /** Call after a successful save to disk to clear the dirty flag. */
    clearChanges(): void {
        this.hasChanges = false
    }
}
