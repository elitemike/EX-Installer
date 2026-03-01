import { route } from '@aurelia/router'

@route({
    routes: [
        { path: '', redirectTo: 'home' },
        { path: 'home', component: () => import('./views/home'), title: 'Home' },
        { path: 'workspace', component: () => import('./views/workspace'), title: 'Workspace' },
    ],
})
export class App {
}

