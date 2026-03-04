import { resolve } from 'aurelia'
import { ConfigEditorState } from '../models/config-editor-state'

/**
 * config-h-editor — editor for config.h files.
 * Shows a Monaco raw editor (Visual form editor reserved for a
 * future product-specific phase).
 */
export class ConfigHEditorCustomElement {
    private readonly state = resolve(ConfigEditorState)

    get content(): string {
        return this.state.configHContent
    }

    onRawChange(event: CustomEvent<string>): void {
        this.state.configHContent = event.detail
        this.state.syncConfigH()
    }
}
