const FRIENDLY_NAMES: Record<string, string> = {
    'config.h': 'Device Settings',
    'myRoster.h': 'Roster',
    'myTurnouts.h': 'Turnouts',
    'myAutomation.h': 'Automation',
}

/**
 * Returns a human-friendly display name for a config file.
 * Falls back to the raw filename if no mapping exists.
 */
export function friendlyName(filename: string): string {
    return FRIENDLY_NAMES[filename] ?? filename
}
