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
export type TurnoutType = 'SERVO' | 'DCC' | 'PIN';

interface TurnoutBase { id: number; description: string; comment?: string; }

/** SERVO_TURNOUT(id, pin, activeAngle, inactiveAngle, profile[, "desc"]) */
export interface ServoTurnout extends TurnoutBase {
    type: 'SERVO';
    pin: number;
    activeAngle: number;
    inactiveAngle: number;
    profile: TurnoutProfile;
}

/** TURNOUT(id, addr, subAddr[, "desc"]) — DCC accessory decoder */
export interface DccTurnout extends TurnoutBase {
    type: 'DCC';
    addr: number;
    subAddr: number;
}

/** PIN_TURNOUT(id, pin[, "desc"]) — GPIO pin-driven */
export interface PinTurnout extends TurnoutBase {
    type: 'PIN';
    pin: number;
}

export type Turnout = ServoTurnout | DccTurnout | PinTurnout;

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

/**
 * Scans raw roster text and comments out any lines that look like ROSTER(...)
 * calls but fail to parse as valid entries. Returns the modified text and the
 * list of original invalid line strings so callers can surface a warning.
 */
export function commentInvalidRosterLines(text: string): { processedText: string; invalidLines: string[] } {
    // Full-match pattern for a valid ROSTER call (same as the parser uses).
    const validRegex = /^\s*ROSTER\s*\(\s*\d+\s*,\s*"[^"]*"\s*,\s*(?:[A-Za-z0-9_]+|"[^"]*")\s*\)(?:\s*\/\/.*)?$/;
    // Looser pattern: any line that contains a ROSTER( token (catches malformed calls).
    const rosterAttemptRegex = /\bROSTER\s*\(/;

    const invalidLines: string[] = [];
    const processedLines = text.split('\n').map(line => {
        const trimmed = line.trimStart();
        // Already a comment — leave it alone.
        if (trimmed.startsWith('//')) return line;
        if (rosterAttemptRegex.test(line) && !validRegex.test(line)) {
            invalidLines.push(line);
            return `// [INVALID] ${line}`;
        }
        return line;
    });

    return { processedText: processedLines.join('\n'), invalidLines };
}

export function parseRosterFromFile(fileContent: string): Roster[] {
    // Strip comment lines so that // [INVALID] ROSTER(...) entries are ignored.
    const uncommentedContent = fileContent
        .split('\n')
        .map(line => (line.trimStart().startsWith('//') ? '' : line))
        .join('\n');

    // Parse #define macros for function lists
    const defineRegex = /^\s*#define\s+(\w+)\s+"([^"]*)"/gm;
    const macroMap: Record<string, string> = {};
    let defMatch: RegExpExecArray | null;
    while ((defMatch = defineRegex.exec(uncommentedContent)) !== null) {
        macroMap[defMatch[1]] = defMatch[2];
    }

    const rosterRegex = /ROSTER\s*\(\s*(\d+)\s*,\s*"([^"]*)"\s*,\s*([A-Za-z0-9_]+|"[^"]*")\s*\)(?:\s*\/\/\s*(.*))?/g;
    const entries: Roster[] = [];
    let match: RegExpExecArray | null;

    while ((match = rosterRegex.exec(uncommentedContent)) !== null) {
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

/**
 * Scans raw turnout text and comments out any lines that look like
 * SERVO_TURNOUT(...) calls but fail to parse as valid entries. Returns the
 * modified text and the list of original invalid line strings.
 */
export function commentInvalidTurnoutLines(text: string): { processedText: string; invalidLines: string[] } {
    // Valid-pattern regexes — a structurally correct line is left alone;
    // the Monaco validator handles individual argument errors via squiggles.
    const validServo = /^\s*SERVO_TURNOUT\s*\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*\w+\s*(?:,\s*"[^"]*")?\s*\)(?:\s*\/\/.*)?$/;
    const validDcc = /^\s*TURNOUT\s*\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*"[^"]*")?\s*\)(?:\s*\/\/.*)?$/;
    const validPin = /^\s*PIN_TURNOUT\s*\(\s*\d+\s*,\s*\d+\s*(?:,\s*"[^"]*")?\s*\)(?:\s*\/\/.*)?$/;

    const invalidLines: string[] = [];
    const processedLines = text.split('\n').map(line => {
        const trimmed = line.trimStart();
        if (trimmed.startsWith('//')) return line;

        if (/\bSERVO_TURNOUT\s*\(/.test(line)) {
            if (!validServo.test(line)) { invalidLines.push(line); return `// [INVALID] ${line}`; }
            return line;
        }
        if (/\bPIN_TURNOUT\s*\(/.test(line)) {
            if (!validPin.test(line)) { invalidLines.push(line); return `// [INVALID] ${line}`; }
            return line;
        }
        // Plain TURNOUT — guard against matching the suffix of SERVO_/PIN_ (handled above)
        if (/(?<![A-Za-z_])TURNOUT\s*\(/.test(line)) {
            if (!validDcc.test(line)) { invalidLines.push(line); return `// [INVALID] ${line}`; }
            return line;
        }
        return line;
    });

    return { processedText: processedLines.join('\n'), invalidLines };
}

export function parseTurnoutFromFile(fileContent: string): Turnout[] {
    // Strip // [INVALID] comment lines so they are not re-parsed.
    const uncommentedContent = fileContent
        .split('\n')
        .map(line => (line.trimStart().startsWith('//') ? '' : line))
        .join('\n');

    const entries: Turnout[] = [];
    let m: RegExpExecArray | null;

    // ── SERVO_TURNOUT(id, pin, activeAngle, inactiveAngle, profile[, "desc"]) ─
    const servoRe = /SERVO_TURNOUT\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\w+)\s*(?:,\s*"([^"]*)")?\s*\)(?:\s*\/\/\s*(.*))?/g;
    while ((m = servoRe.exec(uncommentedContent)) !== null) {
        const profile = m[5] as TurnoutProfile;
        if (!VALID_TURNOUT_PROFILES.includes(profile)) {
            console.warn(`Invalid turnout profile: ${profile}, defaulting to Slow`);
        }
        entries.push({
            type: 'SERVO',
            id: parseInt(m[1], 10),
            pin: parseInt(m[2], 10),
            activeAngle: parseInt(m[3], 10),
            inactiveAngle: parseInt(m[4], 10),
            profile: VALID_TURNOUT_PROFILES.includes(profile) ? profile : 'Slow',
            description: m[6] || '',
            comment: m[7] ? m[7].trim() : '',
        });
    }

    // ── TURNOUT(id, addr, subAddr[, "desc"]) — DCC accessory ─────────────────
    const dccRe = /(?<![A-Za-z_])TURNOUT\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*"([^"]*)")?\s*\)(?:\s*\/\/\s*(.*))?/g;
    while ((m = dccRe.exec(uncommentedContent)) !== null) {
        entries.push({
            type: 'DCC',
            id: parseInt(m[1], 10),
            addr: parseInt(m[2], 10),
            subAddr: parseInt(m[3], 10),
            description: m[4] || '',
            comment: m[5] ? m[5].trim() : '',
        });
    }

    // ── PIN_TURNOUT(id, pin[, "desc"]) — GPIO ─────────────────────────────────
    const pinRe = /PIN_TURNOUT\s*\(\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*"([^"]*)")?\s*\)(?:\s*\/\/\s*(.*))?/g;
    while ((m = pinRe.exec(uncommentedContent)) !== null) {
        entries.push({
            type: 'PIN',
            id: parseInt(m[1], 10),
            pin: parseInt(m[2], 10),
            description: m[3] || '',
            comment: m[4] ? m[4].trim() : '',
        });
    }

    return entries;
}

export function serializeTurnoutToFile(turnouts: Turnout[]): string {
    const lines: string[] = [];
    for (const t of turnouts) {
        let line: string;
        if (t.type === 'DCC') {
            line = `TURNOUT(${t.id}, ${t.addr}, ${t.subAddr}`;
            if (t.description) line += `, "${t.description}"`;
            line += ')';
        } else if (t.type === 'PIN') {
            line = `PIN_TURNOUT(${t.id}, ${t.pin}`;
            if (t.description) line += `, "${t.description}"`;
            line += ')';
        } else {
            // SERVO (default)
            line = `SERVO_TURNOUT(${t.id}, ${t.pin}, ${t.activeAngle}, ${t.inactiveAngle}, ${t.profile}`;
            if (t.description) line += `, "${t.description}"`;
            line += ')';
        }
        if (t.comment) line += ` // ${t.comment}`;
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
    const turnoutPattern = /^\s*(?:SERVO_TURNOUT|PIN_TURNOUT|TURNOUT)\s*\(/;

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
        sections.push('// Turnout definitions');
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
        { type: 'SERVO', id: 200, pin: 101, activeAngle: 450, inactiveAngle: 110, profile: 'Slow', description: 'Example slow turnout', comment: '' },
        { type: 'SERVO', id: 201, pin: 102, activeAngle: 400, inactiveAngle: 100, profile: 'Medium', description: 'Yard ladder switch 1', comment: 'Main yard' },
        { type: 'SERVO', id: 202, pin: 103, activeAngle: 410, inactiveAngle: 90, profile: 'Fast', description: 'Main line crossover', comment: '' },
    ];
}
