/**
 * Parser and serializer for DCC-EX automation files (myRoster.h, myTurnouts.h, myAutomation.h).
 * Ported from https://github.com/elitemike/dcc-ex_ui — pure TypeScript, no framework dependency.
 */

export interface RosterFunction {
    name: string;
    isMomentary: boolean;
    noFunction: boolean;
}

export interface Roster {
    dccAddress: number;
    name: string;
    functions: RosterFunction[];
    comment: string;
    functionMacro?: string;
}

export function getRealFunctions(roster: Roster): RosterFunction[] {
    return roster.functions.filter(f => !f.noFunction);
}

export type TurnoutProfile = 'Instant' | 'Fast' | 'Medium' | 'Slow' | 'Bounce';

export interface Turnout {
    id: number;
    pin: number;
    activeAngle: number;
    inactiveAngle: number;
    profile: TurnoutProfile;
    description: string;
    comment?: string;
}

export interface AutomationData {
    roster: Roster[];
    turnouts: Turnout[];
    preservedContent: string;
}

// ─── Roster parsing ─────────────────────────────────────────────────────────

function parseFunction(str: string): RosterFunction {
    if (str.startsWith('*')) {
        const name = str.slice(1);
        return { name, isMomentary: true, noFunction: name === '' };
    }
    return { name: str, isMomentary: false, noFunction: str === '' };
}

function serializeFunction(f: RosterFunction): string {
    if (f.noFunction) return f.isMomentary ? '*' : '';
    return f.isMomentary ? `*${f.name}` : f.name;
}

function sanitizeMacroName(name: string): string {
    return name.toUpperCase().replace(/[^A-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') + '_F';
}

export function parseRosterFromFile(fileContent: string): Roster[] {
    // Parse #define macros for function lists
    const defineRegex = /^\s*#define\s+(\w+)\s+"([^"]*)"/gm;
    const macroMap: Record<string, string> = {};
    let defMatch: RegExpExecArray | null;
    while ((defMatch = defineRegex.exec(fileContent)) !== null) {
        macroMap[defMatch[1]] = defMatch[2];
    }

    const rosterRegex = /ROSTER\s*\(\s*(\d+)\s*,\s*"([^"]*)"\s*,\s*([A-Za-z0-9_]+|"[^"]*")\s*\)(?:\s*\/\/\s*(.*))?/g;
    const entries: Roster[] = [];
    let match: RegExpExecArray | null;

    while ((match = rosterRegex.exec(fileContent)) !== null) {
        const dccAddress = parseInt(match[1], 10);
        const name = match[2];
        let functionsString = match[3];
        const comment = match[4] ? match[4].trim() : '';
        let functionMacro: string | undefined;

        if (!functionsString.startsWith('"')) {
            functionMacro = functionsString;
            functionsString = macroMap[functionMacro] || '';
        } else {
            functionsString = functionsString.slice(1, -1);
        }

        entries.push({
            dccAddress,
            name,
            functions: functionsString.split('/').map(parseFunction),
            comment,
            functionMacro,
        });
    }

    return entries;
}

export function serializeRosterToFile(roster: Roster[]): string {
    const lines: string[] = [];
    const funcListToNames: Record<string, string[]> = {};

    for (const entry of roster) {
        const funcString = entry.functions.map(serializeFunction).join('/');
        if (!funcListToNames[funcString]) {
            funcListToNames[funcString] = [];
        }
        funcListToNames[funcString].push(entry.name);
    }

    const funcListToMacro: Record<string, string> = {};
    const usedMacros = new Set<string>();

    for (const [funcString, names] of Object.entries(funcListToNames)) {
        if (names.length > 1) {
            let baseName = sanitizeMacroName(names[0]);
            let macroName = baseName;
            let counter = 1;
            while (usedMacros.has(macroName)) {
                macroName = `${baseName}_${counter++}`;
            }
            usedMacros.add(macroName);
            funcListToMacro[funcString] = macroName;
            lines.push(`#define ${macroName} "${funcString}"`);
        }
    }

    if (Object.keys(funcListToMacro).length > 0) {
        lines.push('');
    }

    for (const entry of roster) {
        const funcString = entry.functions.map(serializeFunction).join('/');
        let funcField: string;
        if (funcListToMacro[funcString]) {
            funcField = funcListToMacro[funcString];
        } else {
            funcField = `"${funcString}"`;
        }
        let line = `ROSTER(${entry.dccAddress}, "${entry.name}", ${funcField})`;
        if (entry.comment) {
            line += ` // ${entry.comment}`;
        }
        lines.push(line);
    }

    return lines.join('\n');
}

// ─── Turnout parsing ─────────────────────────────────────────────────────────

const VALID_TURNOUT_PROFILES: readonly TurnoutProfile[] = ['Instant', 'Fast', 'Medium', 'Slow', 'Bounce'];

export function parseTurnoutFromFile(fileContent: string): Turnout[] {
    const regex = /SERVO_TURNOUT\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\w+)\s*(?:,\s*"([^"]*)")?\s*\)(?:\s*\/\/\s*(.*))?/g;
    const entries: Turnout[] = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(fileContent)) !== null) {
        const profile = match[5] as TurnoutProfile;
        if (!VALID_TURNOUT_PROFILES.includes(profile)) {
            console.warn(`Invalid turnout profile: ${profile}, defaulting to Slow`);
        }
        entries.push({
            id: parseInt(match[1], 10),
            pin: parseInt(match[2], 10),
            activeAngle: parseInt(match[3], 10),
            inactiveAngle: parseInt(match[4], 10),
            profile: VALID_TURNOUT_PROFILES.includes(profile) ? profile : 'Slow',
            description: match[6] || '',
            comment: match[7] ? match[7].trim() : '',
        });
    }

    return entries;
}

export function serializeTurnoutToFile(turnouts: Turnout[]): string {
    const lines: string[] = [];
    for (const t of turnouts) {
        let line = `SERVO_TURNOUT(${t.id}, ${t.pin}, ${t.activeAngle}, ${t.inactiveAngle}, ${t.profile}`;
        if (t.description) {
            line += `, "${t.description}"`;
        }
        line += ')';
        if (t.comment) {
            line += ` // ${t.comment}`;
        }
        lines.push(line);
    }
    return lines.join('\n');
}

// ─── Combined automation file ────────────────────────────────────────────────

export function parseAutomationFile(fileContent: string): AutomationData {
    const roster = parseRosterFromFile(fileContent);
    const turnouts = parseTurnoutFromFile(fileContent);

    const usedMacros = new Set<string>();
    for (const entry of roster) {
        if (entry.functionMacro) usedMacros.add(entry.functionMacro);
    }

    const lines = fileContent.split('\n');
    const preservedLines: string[] = [];
    const rosterPattern = /^\s*ROSTER\s*\(/;
    const turnoutPattern = /^\s*SERVO_TURNOUT\s*\(/;

    for (const line of lines) {
        if (rosterPattern.test(line) || turnoutPattern.test(line)) continue;
        const defineMatch = line.match(/^\s*#define\s+(\w+)\s+"[^"]*"/);
        if (defineMatch && usedMacros.has(defineMatch[1])) continue;
        preservedLines.push(line);
    }

    let preservedContent = preservedLines.join('\n');
    preservedContent = preservedContent.replace(/^\n+/, '').replace(/\n+$/, '');

    return { roster, turnouts, preservedContent };
}

export function serializeAutomationFile(data: AutomationData): string {
    const sections: string[] = [];

    if (data.roster.length > 0) {
        sections.push('// Roster entries');
        sections.push(serializeRosterToFile(data.roster));
    }

    if (data.turnouts.length > 0) {
        if (sections.length > 0) sections.push('');
        sections.push('// Servo turnout definitions');
        sections.push(serializeTurnoutToFile(data.turnouts));
    }

    if (data.preservedContent && data.preservedContent.trim()) {
        if (sections.length > 0) sections.push('');
        sections.push(data.preservedContent);
    }

    return sections.join('\n');
}

// ─── Demo data ───────────────────────────────────────────────────────────────

export function loadDemoRoster(): Roster[] {
    const content = `ROSTER(1,"Thomas","//Whistle/*Short Whistle/Blowdown////Mute")
ROSTER(6211, "CSX GP40 #6211", "Lights/Bell/Airhorn/Coupler/Dyn Brake/t1/t2/Squeal/Mute")
ROSTER(301, "Amtrak Charger #301", "Headlights/Bell/Horn/*Short Horn/Whoosh/Train Brake")`;
    return parseRosterFromFile(content);
}

export function loadDemoTurnouts(): Turnout[] {
    return [
        { id: 200, pin: 101, activeAngle: 450, inactiveAngle: 110, profile: 'Slow', description: 'Example slow turnout', comment: '' },
        { id: 201, pin: 102, activeAngle: 400, inactiveAngle: 100, profile: 'Medium', description: 'Yard ladder switch 1', comment: 'Main yard' },
        { id: 202, pin: 103, activeAngle: 410, inactiveAngle: 90, profile: 'Fast', description: 'Main line crossover', comment: '' },
    ];
}
