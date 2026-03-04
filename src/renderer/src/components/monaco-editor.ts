import {
    bindable,
    BindingMode,
    ICustomElementViewModel,
} from 'aurelia'
import * as monaco from 'monaco-editor'

// Register DCC-EX language completions once per app lifetime
let completionsRegistered = false

function registerDCCEXCompletions(): void {
    if (completionsRegistered) return
    completionsRegistered = true

    // Completion provider for ROSTER / SERVO_TURNOUT macros
    monaco.languages.registerCompletionItemProvider('cpp', {
        provideCompletionItems(model, position) {
            const word = model.getWordUntilPosition(position)
            const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn,
            }
            const suggestions: monaco.languages.CompletionItem[] = [
                {
                    label: 'ROSTER',
                    kind: monaco.languages.CompletionItemKind.Function,
                    documentation: 'Define a locomotive roster entry.',
                    detail: 'ROSTER(id, "Name", "Fn0/Fn1/...")',
                    insertText: 'ROSTER(${1:dccAddress}, "${2:Loco Name}", "${3:Fn0/Fn1/Fn2}")',
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    range,
                },
                {
                    label: 'SERVO_TURNOUT',
                    kind: monaco.languages.CompletionItemKind.Function,
                    documentation: 'Define a servo-controlled turnout.',
                    detail: 'SERVO_TURNOUT(id, pin, activeAngle, inactiveAngle, profile, "desc")',
                    insertText:
                        'SERVO_TURNOUT(${1:id}, ${2:pin}, ${3:400}, ${4:100}, ${5|Instant,Fast,Medium,Slow,Bounce|}, "${6:description}")',
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    range,
                },
            ]
            return { suggestions }
        },
    })

    // Hover provider
    monaco.languages.registerHoverProvider('cpp', {
        provideHover(model, position) {
            const word = model.getWordAtPosition(position)
            if (!word) return null

            if (word.word === 'ROSTER') {
                return {
                    contents: [
                        { value: '**ROSTER Macro**' },
                        { value: 'Define a locomotive roster entry.' },
                        {
                            value: '```cpp\nROSTER(RosterId, "Loco Name", "Fn0/Fn1/Fn2")\n```',
                        },
                        { value: 'Use `*` prefix for momentary functions: `"Lights/*Bell/*Whistle"`' },
                    ],
                }
            }

            if (word.word === 'SERVO_TURNOUT') {
                return {
                    contents: [
                        { value: '**SERVO_TURNOUT Macro**' },
                        { value: 'Define a servo-controlled turnout / point.' },
                        {
                            value: '```cpp\nSERVO_TURNOUT(id, pin, activeAngle, inactiveAngle, profile, "desc")\n```',
                        },
                        { value: 'Profiles: `Instant` `Fast` `Medium` `Slow` `Bounce`' },
                    ],
                }
            }

            return null
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
        registerDCCEXCompletions()

        this.model = monaco.editor.createModel(this.value ?? '', this.language)

        this.editor = monaco.editor.create(this.container, {
            model: this.model,
            theme: 'vs-dark',
            language: this.language,
            readOnly: this.readonly,
            automaticLayout: true,
            fontSize: 13,
            lineHeight: 20,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            renderLineHighlight: 'all',
            bracketPairColorization: { enabled: true },
            scrollbar: {
                verticalScrollbarSize: 8,
                horizontalScrollbarSize: 8,
            },
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

    detaching(): void {
        if (this.debounceTimer) clearTimeout(this.debounceTimer)
        this.changeDisposable?.dispose()
        this.editor?.dispose()
        this.model?.dispose()
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
