/**
 * Thin re-export of the Electron APIs used by main-process services.
 *
 * Keeping these in a separate source module means unit tests can mock this
 * file directly (vi.mock('../../src/main/electron-app', factory)) instead of
 * trying to mock the 'electron' npm package itself.  The electron npm package
 * exports a plain string (the path to the binary), not an object, which makes
 * its named exports unreliable to intercept in some Vitest + Node 24
 * environments.
 */
export { app, dialog, BrowserWindow } from 'electron'
