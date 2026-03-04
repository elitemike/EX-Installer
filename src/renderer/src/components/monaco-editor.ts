import {
    bindable,
    BindingMode,
    ICustomElementViewModel,
} from 'aurelia'
import * as monaco from 'monaco-editor'
import { getCompletions } from '../config/file-configs'

// ── Global filename-aware completion + hover providers (registered once) ──────
// Stored on `window` so Vite HMR module re-evaluation cannot reset the flag.
const WIN = window as Window & { __dccexProvidersRegistered?: boolean }

function registerProviders(): void {
    if (WIN.__dccexProvidersRegistered) return
    WIN.__dccexProvidersRegistered = true

    // Completion — returns snippets for the file currently open in this model
    monaco.languages.registerCompletionItemProvider('cpp', {
        provideCompletionItems(model, position) {
            const filename = model.uri.path.replace(/^\//, '')
            const snippets = getCompletions(filename)
            if (!snippets.length) return { suggestions: [] }

            const word = model.getWordUntilPosition(position)
            const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn,
            }

            return {
                suggestions: snippets.map(s => ({
                    label: s.label,
                    kind: monaco.languages.CompletionItemKind.Function,
                    detail: s.detail,
                    documentation: s.documentation,
                    insertText: s.insertText,
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    range,
                })),
            }
        },
    })

    // Hover — looks up hover doc from the same config for the active file
    monaco.languages.registerHoverProvider('cpp', {
        provideHover(model, position) {
            const filename = model.uri.path.replace(/^\//, '')
            const snippets = getCompletions(filename)
            const word = model.getWordAtPosition(position)
            if (!word) return null

            const match = snippets.find(s => s.label === word.word)
            if (!match?.hover) return null

            const h = match.hover
            const contents: monaco.IMarkdownString[] = [
                { value: `**${h.title}**` },
                { value: h.description },
            ]
            if (h.example) contents.push({ value: `\`\`\`cpp\n${h.example}\n\`\`\`` })
            if (h.note) contents.push({ value: h.note })
            return { contents }
        },
    })
}

/**
 * `<monaco-editor>` — Aurelia custom element wrapping Monaco editor.
 *
 * Bindables:
 *   value        — two-way string binding (current editor text)
 *   language     — Monaco language id  (default: 'cpp')
 *   readonly     — boolean             (default: false)
 *   filename     — hint for completions (optional)
 *
 * Emits `change` event with updated text each time content changes (debounced).
 */
export class MonacoEditorCustomElement implements ICustomElementViewModel {
    @bindable({ mode: BindingMode.twoWay }) value = ''
    @bindable language = 'cpp'
    @bindable readonly = false
    @bindable filename = ''

    private container!: HTMLElement
    private editor: monaco.editor.IStandaloneCodeEditor | null = null
    private model: monaco.editor.ITextModel | null = null
    private changeDisposable: monaco.IDisposable | null = null
    private isUpdatingFromBinding = false
    private debounceTimer: ReturnType<typeof setTimeout> | null = null

    attached(): void {
        registerProviders()

        // Use a URI based on filename so completion/hover providers can identify
        // which file is active and return the correct per-file suggestions.
        const uri = this.filename
            ? monaco.Uri.file(this.filename)
            : undefined

        // Reuse an existing model for this URI if one already exists (e.g. the
        // same file re-opened after navigation), otherwise create a fresh one.
        this.model = uri
            ? monaco.editor.getModel(uri) ?? monaco.editor.createModel(this.value ?? '', this.language, uri)
            : monaco.editor.createModel(this.value ?? '', this.language)

        // Sync value in case the model was reused with stale content
        if (this.model.getValue() !== (this.value ?? '')) {
            this.model.setValue(this.value ?? '')
        }

        this.editor = monaco.editor.create(this.container, {
            model: this.model,
            theme: 'vs-dark',
            language: this.language,
            readOnly: this.readonly,
            automaticLayout: true,
            fontSize: 13,
            lineHeight: 20,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            renderLineHighlight: 'all',
            bracketPairColorization: { enabled: true },
            scrollbar: {
                verticalScrollbarSize: 8,
                horizontalScrollbarSize: 8,
            }
        })

        // Force layout after the DOM has fully settled (fixes height:100% chains in flex)
        requestAnimationFrame(() => this.editor?.layout())
        setTimeout(() => this.editor?.layout(), 50)

        // Propagate editor changes → binding
        this.changeDisposable = this.model.onDidChangeContent(() => {
            if (this.isUpdatingFromBinding) return
            if (this.debounceTimer) clearTimeout(this.debounceTimer)
            this.debounceTimer = setTimeout(() => {
                const text = this.model!.getValue()
                this.value = text
                this.container.dispatchEvent(
                    new CustomEvent('change', { detail: text, bubbles: true }),
                )
            }, 300)
        })
    }

    /**
     * Immediately cancels the debounce and pushes the current editor text into
     * the two-way `value` binding. Call this before reading `value` from outside
     * (e.g. when switching from Raw to Visual) to guarantee up-to-date content.
     */
    flush(): void {
        if (!this.model) return
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer)
            this.debounceTimer = null
        }
        const text = this.model.getValue()
        if (this.value !== text) {
            this.value = text
            this.container?.dispatchEvent(
                new CustomEvent('change', { detail: text, bubbles: true }),
            )
        }
    }

    detaching(): void {
        if (this.debounceTimer) clearTimeout(this.debounceTimer)
        this.changeDisposable?.dispose()
        this.editor?.dispose()
        // Only dispose the text model if it has no URI — URI models are cached by
        // Monaco and reused on re-attach, so disposing them causes a re-create
        // on the next visit and accumulates stale state.
        if (!this.model?.uri.path || this.model.uri.path === '/') {
            this.model?.dispose()
        }
        this.editor = null
        this.model = null
    }

    // Binding changed externally → push into editor without triggering change event
    valueChanged(newValue: string): void {
        if (!this.model) return
        const current = this.model.getValue()
        if (current === newValue) return
        this.isUpdatingFromBinding = true
        this.model.setValue(newValue ?? '')
        this.isUpdatingFromBinding = false
    }

    readonlyChanged(val: boolean): void {
        this.editor?.updateOptions({ readOnly: val })
    }

    languageChanged(lang: string): void {
        if (this.model) {
            monaco.editor.setModelLanguage(this.model, lang)
        }
    }
}
