import { resolve } from 'aurelia'
import { route } from '@aurelia/router'
import { ConfigEditorState } from './models/config-editor-state'

@route({
    routes: [
        { path: '', redirectTo: 'startup' },
        { path: 'startup', component: () => import('./views/startup'), title: 'Starting Up' },
        { path: 'home', component: () => import('./views/home'), title: 'Home' },
        { path: 'workspace', component: () => import('./views/workspace'), title: 'Workspace' },
    ],
})
export class App {
    private readonly configEditorState = resolve(ConfigEditorState)

    bound(): void {
        window.onbeforeunload = () => {
            if (this.configEditorState.hasChanges) {
                // Returning any string signals Electron to emit will-prevent-unload,
                // which the main process intercepts to show a native save dialog.
                return 'unsaved'
            }
        }
    }
}

