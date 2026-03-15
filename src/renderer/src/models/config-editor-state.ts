import { observable, resolve } from 'aurelia'
import { InstallerState } from './installer-state'
import type { Roster, Turnout, RosterFunction } from '../utils/myAutomationParser'
import {
    serializeRosterToFile,
    serializeTurnoutToFile,
    parseRosterFromFile,
    parseTurnoutFromFile,
    buildGeneratorHeader,
} from '../utils/myAutomationParser'

/**
 * Open/close tag that delimits the auto-managed #include block at the top of
 * myAutomation.h.  The same string is used for both the opening and closing
 * line, matching the pattern used by the device header in config.h.
 */
export const MANAGED_INCLUDES_TAG = '// ==== EX-Installer Required Includes ===='

/**
 * Strips the managed-includes block (and any bare myRoster/myTurnouts includes
 * that appear outside it) from myAutomation.h content, returning only the
 * user's custom code.  Called when loading an existing file so that the custom
 * body survives subsequent auto-regeneration.
 */
export function extractAutomationCustomContent(content: string): string {
    // Remove the managed-includes block (open tag … close tag, inclusive)
    let text = content
    const openIdx = text.indexOf(MANAGED_INCLUDES_TAG)
    if (openIdx !== -1) {
        const closeIdx = text.indexOf(MANAGED_INCLUDES_TAG, openIdx + MANAGED_INCLUDES_TAG.length)
        if (closeIdx !== -1) {
            const afterClose = closeIdx + MANAGED_INCLUDES_TAG.length
            text = text.slice(0, openIdx) + text.slice(afterClose)
        }
    }

    // Also strip any bare managed #include lines left outside the block
    text = text
        .split('\n')
        .filter(line => {
            const t = line.trim()
            return t !== '#include "myRoster.h"' && t !== '#include "myTurnouts.h"'
        })
        .join('\n')

    return text.replace(/^\n+/, '').replace(/\n+$/, '')
}

/**
 * ConfigEditorState — singleton that owns the in-memory editing state for all
 * configuration files.  It is the single source of truth for:
 *   • config.h                  (raw text)
 *   • myRoster.h                (structured Roster[] + raw text view)
 *   • myTurnouts.h              (structured Turnout[] + raw text view)
 *   • myAutomation.h            (editable; managed includes pinned at top)
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

    /**
     * Lines that were detected as invalid ROSTER calls and have been commented
     * out. Preserved here so they survive the round-trip back to raw view.
     */
    rosterPreservedComments = ''

    get rosterRaw(): string {
        const header = buildGeneratorHeader('myRoster.h', this.installerState.appVersion)
        const serialized = serializeRosterToFile(this.roster)
        const body = this.rosterPreservedComments
            ? `${this.rosterPreservedComments}\n${serialized}`
            : serialized
        return `${header}\n${body}`
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

    /** Updates the function list on ALL roster entries that share `macroName`. */
    updateDefineFunctions(macroName: string, functions: RosterFunction[]): void {
        const fns = functions.map(f => ({ ...f }))
        this.roster = this.roster.map(r =>
            r.functionMacro === macroName ? { ...r, functions: fns } : r,
        )
        this.hasChanges = true
        this._syncToInstallerState()
    }

    /** Updates the friendly name on ALL roster entries that share `macroName`. */
    updateDefineFriendlyName(macroName: string, friendlyName: string): void {
        this.roster = this.roster.map(r =>
            r.functionMacro === macroName
                ? { ...r, defineFriendlyName: friendlyName || undefined }
                : r,
        )
        this.hasChanges = true
        this._syncToInstallerState()
    }

    /** Renames a #define macro across all roster entries that reference it. */
    renameMacro(oldName: string, newName: string): void {
        this.roster = this.roster.map(r =>
            r.functionMacro === oldName ? { ...r, functionMacro: newName } : r,
        )
        this.hasChanges = true
        this._syncToInstallerState()
    }

    // ── myTurnouts.h ─────────────────────────────────────────────────────────
    @observable turnouts: Turnout[] = []

    /**
     * Lines that were detected as invalid SERVO_TURNOUT calls and have been
     * commented out. Preserved here so they survive the round-trip back to raw.
     */
    turnoutPreservedComments = ''

    get turnoutsRaw(): string {
        const header = buildGeneratorHeader('myTurnouts.h', this.installerState.appVersion)
        const serialized = serializeTurnoutToFile(this.turnouts)
        const body = this.turnoutPreservedComments
            ? `${this.turnoutPreservedComments}\n${serialized}`
            : serialized
        return `${header}\n${body}`
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
        const includes: string[] = []
        if (this.roster.length > 0) includes.push('#include "myRoster.h"')
        if (this.turnouts.length > 0) includes.push('#include "myTurnouts.h"')
        for (const name of this.customFileNames) {
            includes.push(`#include "${name}"`)
        }

        const sections: string[] = []

        if (includes.length > 0) {
            sections.push(MANAGED_INCLUDES_TAG)
            sections.push('// These #includes are managed by EX-Installer.')
            sections.push('// Do not remove them — they are required for the installer to function correctly.')
            sections.push(...includes)
            sections.push(MANAGED_INCLUDES_TAG)
        }

        if (this.preservedAutomationContent.trim()) {
            if (sections.length > 0) sections.push('')
            sections.push(this.preservedAutomationContent.trim())
        }

        return sections.join('\n')
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
            if (f.name === 'config.h' || f.name === 'myConfig.h') {
                this.configHContent = f.content
            } else if (f.name === 'myRoster.h') {
                this.roster = parseRosterFromFile(f.content)
            } else if (f.name === 'myTurnouts.h') {
                this.turnouts = parseTurnoutFromFile(f.content)
            } else if (f.name === 'myAutomation.h') {
                // Strip managed includes block; preserve the user's custom code
                // so it survives every subsequent auto-regeneration.
                this.preservedAutomationContent = extractAutomationCustomContent(f.content)
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
            if (f.name === 'config.h' || f.name === 'myConfig.h') {
                f.content = this.configHContent
            } else if (f.name === 'myRoster.h') {
                f.content = this.rosterRaw
            } else if (f.name === 'myTurnouts.h') {
                f.content = this.turnoutsRaw
            }
            // myAutomation.h is handled by _ensureAutomationFile below,
            // which first re-extracts user edits from the current editor content.
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
            const af = files.find(f => f.name === 'myAutomation.h')!
            // Re-extract the user's custom code from the current editor content
            // so that direct Monaco edits survive the next auto-regeneration.
            this.preservedAutomationContent = extractAutomationCustomContent(af.content)
            af.content = this.automationPreview
        }
    }

    syncConfigH(): void {
        this.hasChanges = true
        for (const f of this.installerState.configFiles) {
            if (f.name === 'config.h' || f.name === 'myConfig.h') {
                f.content = this.configHContent
            }
        }
    }

    /** Call after a successful save to disk to clear the dirty flag. */
    clearChanges(): void {
        this.hasChanges = false
    }
}
