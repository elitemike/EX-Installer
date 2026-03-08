import { describe, it, expect, vi } from 'vitest'
import { RosterEditorCustomElement } from '../../src/renderer/src/components/roster-editor'
import type { ConfigEditorState } from '../../src/renderer/src/models/config-editor-state'

// ── Factory ───────────────────────────────────────────────────────────────────

function makeEditor() {
    const editor = Object.create(RosterEditorCustomElement.prototype) as RosterEditorCustomElement

    const state = {
        roster: [],
        rosterPreservedComments: '',
        setRosterFromRaw: vi.fn(),
    } as unknown as ConfigEditorState

    const eaPublish = vi.fn()
    const ea = { publish: eaPublish, subscribe: vi.fn() }
    const toastShow = vi.fn()

    Object.assign(editor, {
        state,
        ea,
        toastService: { show: toastShow },
        dialogService: {},
        splitterObj: null,
        activeTab: 'raw' as const,
        editBuffer: null,
        editBufferIndex: null,
        rawEditor: null,
        rawSnapshot: '',
        _rawText: '',
        errorMessage: '',
        dccAddressInput: '',
        draggedIndex: null,
        newFunctionName: '',
        newFunctionIsMomentary: false,
        newFunctionNoFunction: false,
    })

    return { editor, state, eaPublish, toastShow }
}

// ── _processRawLeave: toast publishing ────────────────────────────────────────

describe('RosterEditorCustomElement._processRawLeave', () => {
    describe('toast event', () => {
        it('publishes SHOW_TOAST_EVENT when the raw text contains an invalid ROSTER line', () => {
            const { editor, toastShow } = makeEditor()

            editor._processRawLeave('ROSTER(bad input here)')

            expect(toastShow).toHaveBeenCalledOnce()
            const [payload] = toastShow.mock.calls[0]
            expect(payload).toMatchObject({
                title: 'Invalid Lines Commented Out',
                cssClass: 'e-toast-warning',
            })
            expect(payload.content).toContain('1 invalid roster line is commented out')
        })

        it('pluralises the message for multiple invalid lines', () => {
            const { editor, toastShow } = makeEditor()

            editor._processRawLeave(
                'ROSTER(bad one)\nROSTER(bad two)',
            )

            expect(toastShow).toHaveBeenCalledOnce()
            const [payload] = toastShow.mock.calls[0]
            expect(payload.content).toContain('2 invalid roster lines are commented out')
        })

        it('does NOT publish when all ROSTER lines are valid', () => {
            const { editor, toastShow } = makeEditor()

            editor._processRawLeave('ROSTER(42, "Thomas", "LIGHT/HORN")')

            expect(toastShow).not.toHaveBeenCalled()
        })

        it('does NOT publish when the text contains no ROSTER calls at all', () => {
            const { editor, toastShow } = makeEditor()

            editor._processRawLeave('// just a comment\n')

            expect(toastShow).not.toHaveBeenCalled()
        })
    })

    // ── rosterPreservedComments persistence ───────────────────────────────────

    describe('rosterPreservedComments persistence across multiple toggles', () => {
        it('sets rosterPreservedComments when an invalid line is first encountered', () => {
            const { editor, state } = makeEditor()

            editor._processRawLeave('ROSTER(bad input)')

            expect(state.rosterPreservedComments).toMatch(/\/\/ \[INVALID\]/)
            expect(state.rosterPreservedComments).toContain('ROSTER(bad input)')
        })

        it('preserves the [INVALID] comment on a second toggle (the bug scenario)', () => {
            const { editor, state } = makeEditor()

            // First pass — raw tab has a malformed line; user switches to visual.
            editor._processRawLeave('ROSTER(bad input)\nROSTER(1, "Good Loco", "LIGHT")')
            const afterFirstPass = state.rosterPreservedComments
            expect(afterFirstPass).toContain('// [INVALID]')

            // Simulate the round-trip: rosterRaw getter would return the
            // preserved comment + serialized valid lines. We fake the concatenated
            // text that flush() would return when the user is back in raw mode.
            const rawOnSecondVisit = `${afterFirstPass}\nROSTER(1, "Good Loco", "LIGHT")`

            // Second pass — user switches back to visual again.
            editor._processRawLeave(rawOnSecondVisit)

            // The [INVALID] line must still be preserved — it must not be wiped.
            expect(state.rosterPreservedComments).toContain('// [INVALID]')
            expect(state.rosterPreservedComments).toContain('ROSTER(bad input)')
        })

        it('does NOT publish toast on second toggle when the [INVALID] line is already commented out', () => {
            const { editor, state, toastShow } = makeEditor()

            // First pass: bad line gets commented and toast fires.
            editor._processRawLeave('ROSTER(bad input)')
            expect(toastShow).toHaveBeenCalledOnce()
            toastShow.mockClear()

            // Second pass: the text now contains the already-commented line.
            // commentInvalidRosterLines skips lines starting with '//', so
            // invalidLines is empty → no toast should fire.
            const rawOnSecondVisit = `${state.rosterPreservedComments}\nROSTER(1, "Good Loco", "LIGHT")`
            editor._processRawLeave(rawOnSecondVisit)

            // Already-commented lines are not re-toasted on subsequent toggles.
            expect(toastShow).not.toHaveBeenCalled()
        })

        it('clears rosterPreservedComments when all invalid lines have been corrected', () => {
            const { editor, state } = makeEditor()

            // First pass: creates a preserved comment.
            editor._processRawLeave('ROSTER(bad input)')
            expect(state.rosterPreservedComments).not.toBe('')

            // User fixes the line in raw and switches to visual with only valid content.
            editor._processRawLeave('ROSTER(42, "Fixed Loco", "LIGHT")')

            expect(state.rosterPreservedComments).toBe('')
        })
    })
})
