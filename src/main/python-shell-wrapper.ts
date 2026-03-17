/**
 * Thin re-export of python-shell so tests can mock this source module reliably.
 * See electron-app.ts for the same pattern and rationale.
 */
export { PythonShell } from 'python-shell'
export type { Options as PythonOptions } from 'python-shell'
