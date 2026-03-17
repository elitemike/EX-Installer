/**
 * Thin re-export of simple-git so tests can mock this source module reliably.
 * See electron-app.ts for the same pattern and rationale.
 */
export { default } from 'simple-git'
export type { SimpleGit } from 'simple-git'
