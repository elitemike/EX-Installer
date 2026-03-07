import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import aurelia from '@aurelia/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import monacoEditorPlugin from 'vite-plugin-monaco-editor'

export default defineConfig({
    // ── Main process ──────────────────────────────────────────────────────────
    main: {
        plugins: [externalizeDepsPlugin()],
        build: {
            sourcemap: true,
            lib: {
                entry: resolve(__dirname, 'src/main/index.ts'),
            },
        },
    },

    // ── Preload script ────────────────────────────────────────────────────────
    preload: {
        plugins: [externalizeDepsPlugin()],
        build: {
            sourcemap: true,
            lib: {
                entry: resolve(__dirname, 'src/preload/index.ts'),
            },
        },
    },

    // ── Renderer (Aurelia 2 + Vite) ───────────────────────────────────────────
    renderer: {
        root: resolve(__dirname, 'src/renderer'),
        plugins: [
            tailwindcss(),
            aurelia({
                // Match files under src/renderer/src so the plugin filter resolves
                // correctly relative to process.cwd() (which is repo root).
                include: resolve(__dirname, 'src/renderer/src/**/*.{ts,js,html}'),
                useDev: false,
            }),
            (monacoEditorPlugin as unknown as typeof monacoEditorPlugin.default).default({
                languageWorkers: ['editorWorkerService'],
            }),
        ],
        resolve: {
            alias: {
                '@renderer': resolve(__dirname, 'src/renderer/src'),
                '@services': resolve(__dirname, 'src/renderer/src/services'),
                '@components': resolve(__dirname, 'src/renderer/src/components'),
            },
        },
        build: {
            rollupOptions: {
                input: {
                    index: resolve(__dirname, 'src/renderer/index.html'),
                },
            },
        },
    },
})
