import type { CursorPosition, VimRegister } from './types';

export interface VimHandlerContext {
    // --- State (reads) ---
    getVimMode: () => string;
    getVimModeEnabled: () => boolean;
    getPendingOperator: () => string | null;
    getPendingSequence: () => string;
    getPendingCount: () => string;
    getCursorLine: () => number;
    getCursorChar: () => number;
    getTotalLines: () => number;
    getLine: (l: number) => string;
    getVisualAnchor: () => CursorPosition | null;
    getVimRegisters: () => Map<string, VimRegister>;
    getCommandLine: () => string;
    getLastSearchQuery: () => string;
    // --- State (writes) ---
    setVimMode: (m: string) => void;
    setPendingOperator: (op: string | null) => void;
    setPendingSequence: (s: string) => void;
    setPendingCount: (c: string) => void;
    setVisualAnchor: (a: CursorPosition | null) => void;
    setCommandLine: (s: string) => void;
    setLastSearchQuery: (s: string) => void;
    // --- Actions (callbacks) ---
    setCursor: (line: number, char: number) => void;
    setNormalCursor: (line: number, char: number) => void;
    enterNormalMode: (fromInsert?: boolean) => void;
    enterInsertMode: () => void;
    enterVisualMode: () => void;
    clearPendingState: () => void;
    syncVimStatus: () => void;
    mutateDocument: (fn: () => void) => Promise<void>;
    applyPendingOperator: (key: string) => Promise<void>;
    handleInsertEnter: () => Promise<void>;
    handleInsertBackspace: () => Promise<void>;
    handleInsertCharacter: (char: string) => Promise<void>;
    saveFile: () => Promise<boolean>;
    undo: () => void;
    redo: () => void;
    lineLength: (line: number) => number;
    clampLine: (l: number) => number;
    clampChar: (l: number, c: number) => number;
    findNextWordStart: (pos: CursorPosition, count?: number) => CursorPosition;
    findPreviousWordStart: (pos: CursorPosition, count?: number) => CursorPosition;
    findWordEnd: (pos: CursorPosition, count?: number) => CursorPosition;
    findCharForward: (ch: string, count: number, stop?: boolean) => number;
    findCharBackward: (ch: string, count: number, stop?: boolean) => number;
    findMatchingBracket: (line: number, char: number) => CursorPosition | null;
    getTextObjectRange: (type: 'i' | 'a', obj: string) => { start: CursorPosition; end: CursorPosition } | null;
    indentLines: (start: number, end: number, dir: 1 | -1) => Promise<void>;
    setLine: (l: number, text: string) => void;
    insertLine: (l: number, text: string) => void;
    deleteLine: (l: number) => void;
    queueRedraw: () => void;
    highlightViewportViaDocBridge: () => Promise<boolean>;
    vimRegisters: Map<string, VimRegister>;
    getLastFindChar: () => string;
    getLastFindDir: () => 1 | -1;
    getLastFindStop: () => boolean;
    setLastFindChar: (c: string) => void;
    setLastFindDir: (d: 1 | -1) => void;
    setLastFindStop: (s: boolean) => void;
    dialogState: { subscribe: (fn: (v: any) => void) => () => void };
    executeCommandLine: () => Promise<void>;
    deleteRange: (start: CursorPosition, end: CursorPosition) => Promise<void>;
    yankRange: (start: CursorPosition, end: CursorPosition) => void;
    pasteRegister: (after: boolean) => Promise<void>;
    insertNewLineBelow: () => Promise<void>;
    insertNewLineAbove: () => Promise<void>;
    deleteCharAtCursor: (count?: number) => Promise<void>;
    getScrollContainer: () => HTMLElement | null;
    getEditorLineHeight: () => number;
    normalizeNormalCursor: () => void;
    ensureCursorVisible: () => void;
}

function getCount(ctx: VimHandlerContext, defaultValue = 1): number {
    const pendingCount = ctx.getPendingCount();
    return pendingCount ? Math.max(Number.parseInt(pendingCount, 10), 1) : defaultValue;
}

function currentPosition(ctx: VimHandlerContext): CursorPosition {
    return { line: ctx.getCursorLine(), char: ctx.getCursorChar() };
}

function comparePositions(a: CursorPosition, b: CursorPosition): number {
    if (a.line !== b.line) return a.line - b.line;
    return a.char - b.char;
}

function sortPositions(a: CursorPosition, b: CursorPosition): [CursorPosition, CursorPosition] {
    return comparePositions(a, b) <= 0 ? [a, b] : [b, a];
}

function getExclusivePosition(ctx: VimHandlerContext, position: CursorPosition): CursorPosition {
    const length = ctx.lineLength(position.line);
    if (position.char < length) {
        return { line: position.line, char: position.char + 1 };
    }
    if (position.line < ctx.getTotalLines() - 1) {
        return { line: position.line + 1, char: 0 };
    }
    return { line: position.line, char: length };
}

function getVisualBounds(ctx: VimHandlerContext): [CursorPosition, CursorPosition] | null {
    const visualAnchor = ctx.getVisualAnchor();
    if (!visualAnchor) return null;
    return sortPositions(visualAnchor, currentPosition(ctx));
}

function getVisualRange(ctx: VimHandlerContext): [CursorPosition, CursorPosition] | null {
    const bounds = getVisualBounds(ctx);
    if (!bounds) return null;
    return [bounds[0], getExclusivePosition(ctx, bounds[1])];
}

function moveCursorToLineStart(ctx: VimHandlerContext): void {
    ctx.setCursor(ctx.getCursorLine(), 0);
}

function moveCursorToFirstNonWhitespace(ctx: VimHandlerContext): void {
    const cursorLine = ctx.getCursorLine();
    const match = ctx.getLine(cursorLine).match(/\S/);
    ctx.setCursor(cursorLine, match ? (match.index ?? 0) : 0);
}

function moveCursorToLineEnd(ctx: VimHandlerContext): void {
    const cursorLine = ctx.getCursorLine();
    const length = ctx.lineLength(cursorLine);
    ctx.setCursor(cursorLine, length > 0 ? length - 1 : 0);
}

function moveHorizontalWrap(ctx: VimHandlerContext, delta: number): void {
    let line = ctx.getCursorLine();
    let char = ctx.getCursorChar();
    let remaining = Math.abs(delta);
    const dir = delta > 0 ? 1 : -1;

    while (remaining > 0) {
        const len = ctx.lineLength(line);
        if (dir > 0) {
            if (char < len - 1) {
                char = Math.min(char + remaining, len - 1);
                remaining = 0;
            } else if (line < ctx.getTotalLines() - 1) {
                line += 1;
                char = 0;
                remaining -= 1;
            } else {
                break;
            }
        } else if (char > 0) {
            char = Math.max(char - remaining, 0);
            remaining = 0;
        } else if (line > 0) {
            line -= 1;
            char = Math.max(ctx.lineLength(line) - 1, 0);
            remaining -= 1;
        } else {
            break;
        }
    }

    ctx.setNormalCursor(line, char);
}

function moveVertical(ctx: VimHandlerContext, delta: number): void {
    ctx.setNormalCursor(ctx.clampLine(ctx.getCursorLine() + delta), ctx.getCursorChar());
}

function moveToFirstLine(ctx: VimHandlerContext): void {
    ctx.setNormalCursor(0, 0);
}

function moveToLastLine(ctx: VimHandlerContext): void {
    ctx.setNormalCursor(ctx.getTotalLines() - 1, 0);
}

function getCurrentRegister(ctx: VimHandlerContext): VimRegister {
    return ctx.vimRegisters.get('"') ?? { text: '', linewise: false };
}

function setCurrentRegister(ctx: VimHandlerContext, value: VimRegister): void {
    ctx.vimRegisters.set('"', value);
}

function repeatLastFind(ctx: VimHandlerContext, count: number, reverse = false): void {
    if (!ctx.getLastFindChar()) return;

    const dir = reverse ? (ctx.getLastFindDir() === 1 ? -1 : 1) : ctx.getLastFindDir();
    const target = dir === 1
        ? ctx.findCharForward(ctx.getLastFindChar(), count, ctx.getLastFindStop())
        : ctx.findCharBackward(ctx.getLastFindChar(), count, ctx.getLastFindStop());

    ctx.setNormalCursor(ctx.getCursorLine(), target);
    ctx.queueRedraw();
}

export async function handleInsertModeKeyDown(
    e: KeyboardEvent,
    ctx: VimHandlerContext,
    useVimEscape = true,
): Promise<void> {
    if (e.key === 'Escape') {
        e.preventDefault();
        if (useVimEscape) {
            ctx.enterNormalMode(true);
        } else {
            (e.currentTarget as HTMLElement).blur();
        }
        return;
    }

    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Enter', 'Tab'].includes(e.key)) {
        e.preventDefault();
    }

    if (e.key === 'Enter') {
        await ctx.handleInsertEnter();
        return;
    }

    if (e.key === 'Backspace') {
        await ctx.handleInsertBackspace();
        return;
    }

    if (e.key === 'Tab') {
        await ctx.handleInsertCharacter('  ');
        return;
    }

    if (e.key === 'ArrowLeft') {
        const cursorLine = ctx.getCursorLine();
        const cursorChar = ctx.getCursorChar();
        if (cursorChar > 0) {
            ctx.setCursor(cursorLine, cursorChar - 1);
        } else if (cursorLine > 0) {
            ctx.setCursor(cursorLine - 1, ctx.lineLength(cursorLine - 1));
        }
        return;
    }

    if (e.key === 'ArrowRight') {
        const cursorLine = ctx.getCursorLine();
        const cursorChar = ctx.getCursorChar();
        if (cursorChar < ctx.lineLength(cursorLine)) {
            ctx.setCursor(cursorLine, cursorChar + 1);
        } else if (cursorLine < ctx.getTotalLines() - 1) {
            ctx.setCursor(cursorLine + 1, 0);
        }
        return;
    }

    if (e.key === 'ArrowUp') {
        ctx.setCursor(ctx.getCursorLine() - 1, ctx.getCursorChar());
        return;
    }

    if (e.key === 'ArrowDown') {
        ctx.setCursor(ctx.getCursorLine() + 1, ctx.getCursorChar());
        return;
    }

    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        await ctx.handleInsertCharacter(e.key);
    }
}

export async function handleCommandModeKeyDown(
    e: KeyboardEvent,
    ctx: VimHandlerContext,
): Promise<void> {
    e.preventDefault();

    if (e.key === 'Escape') {
        ctx.setCommandLine('');
        ctx.enterNormalMode();
        return;
    }

    if (e.key === 'Enter') {
        await ctx.executeCommandLine();
        return;
    }

    if (e.key === 'Backspace') {
        ctx.setCommandLine(ctx.getCommandLine().slice(0, -1));
        ctx.syncVimStatus();
        ctx.queueRedraw();
        return;
    }

    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        ctx.setCommandLine(ctx.getCommandLine() + e.key);
        ctx.syncVimStatus();
        ctx.queueRedraw();
    }
}

export async function handleVisualModeKeyDown(
    e: KeyboardEvent,
    ctx: VimHandlerContext,
): Promise<void> {
    if (e.key === 'Escape') {
        e.preventDefault();
        ctx.enterNormalMode();
        return;
    }

    if (e.key === 'y' || e.key === 'd' || e.key === 'c') {
        e.preventDefault();
        const range = getVisualRange(ctx);
        if (!range) {
            ctx.enterNormalMode();
            return;
        }

        if (e.key === 'y') {
            ctx.yankRange(range[0], range[1]);
            ctx.enterNormalMode();
            return;
        }

        await ctx.deleteRange(range[0], range[1]);
        if (e.key === 'c') {
            ctx.enterInsertMode();
        } else {
            ctx.enterNormalMode();
        }
        return;
    }

    if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        const range = getVisualRange(ctx);
        if (range) {
            await ctx.deleteRange(range[0], range[1]);
        }
        await ctx.pasteRegister(e.key === 'p');
        ctx.enterNormalMode();
        return;
    }

    if (e.key === 'o') {
        e.preventDefault();
        const visualAnchor = ctx.getVisualAnchor();
        if (visualAnchor) {
            const oldAnchor = { line: visualAnchor.line, char: visualAnchor.char };
            ctx.setVisualAnchor(currentPosition(ctx));
            ctx.setCursor(oldAnchor.line, oldAnchor.char);
        }
        return;
    }

    if (e.key === '>' || e.key === '<') {
        e.preventDefault();
        const visualRange = getVisualBounds(ctx);
        if (visualRange) {
            const [vStart, vEnd] = visualRange;
            await ctx.indentLines(vStart.line, vEnd.line, e.key === '>' ? 1 : -1);
        }
        ctx.enterNormalMode();
        return;
    }

    if (e.key === '~') {
        e.preventDefault();
        const visualRange = getVisualBounds(ctx);
        if (visualRange) {
            const [vStart, vEnd] = visualRange;
            await ctx.mutateDocument(() => {
                for (let l = vStart.line; l <= vEnd.line; l++) {
                    const line = ctx.getLine(l);
                    const from = l === vStart.line ? vStart.char : 0;
                    const to = l === vEnd.line ? vEnd.char + 1 : line.length;
                    const toggled =
                        line.slice(0, from) +
                        line
                            .slice(from, to)
                            .split('')
                            .map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()))
                            .join('') +
                        line.slice(to);
                    ctx.setLine(l, toggled);
                }
            });
        }
        ctx.enterNormalMode();
        return;
    }

    await handleNormalModeKeyDown(e, ctx);
}

export async function handleNormalModeKeyDown(
    e: KeyboardEvent,
    ctx: VimHandlerContext,
): Promise<void> {
    const key = e.key;

    if (key === 'Escape') {
        e.preventDefault();
        ctx.enterNormalMode();
        return;
    }

    if (ctx.getPendingOperator()) {
        e.preventDefault();
        await ctx.applyPendingOperator(key);
        return;
    }

    if (ctx.getPendingSequence() === 'r') {
        e.preventDefault();
        if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            await ctx.mutateDocument(() => {
                const cursorLine = ctx.getCursorLine();
                const cursorChar = ctx.getCursorChar();
                const line = ctx.getLine(cursorLine);
                if (cursorChar < line.length) {
                    ctx.setLine(cursorLine, line.slice(0, cursorChar) + key + line.slice(cursorChar + 1));
                }
            });
        }
        ctx.clearPendingState();
        return;
    }

    if (ctx.getPendingSequence() === 'z') {
        e.preventDefault();
        const scrollContainer = ctx.getScrollContainer();
        if (scrollContainer) {
            const cursorLine = ctx.getCursorLine();
            const editorLineHeight = ctx.getEditorLineHeight();
            if (key === 'z') {
                scrollContainer.scrollTop = Math.max(0, cursorLine * editorLineHeight - scrollContainer.clientHeight / 2);
            } else if (key === 't') {
                scrollContainer.scrollTop = cursorLine * editorLineHeight;
            } else if (key === 'b') {
                scrollContainer.scrollTop = Math.max(0, (cursorLine + 1) * editorLineHeight - scrollContainer.clientHeight);
            }
            ctx.queueRedraw();
        }
        ctx.clearPendingState();
        return;
    }

    if (['f', 'F', 't', 'T'].includes(ctx.getPendingSequence())) {
        e.preventDefault();
        if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const cnt = getCount(ctx);
            const motion = ctx.getPendingSequence();
            const dir: 1 | -1 = motion === 'f' || motion === 't' ? 1 : -1;
            const stop = motion === 't' || motion === 'T';
            ctx.setLastFindChar(key);
            ctx.setLastFindDir(dir);
            ctx.setLastFindStop(stop);
            if (dir === 1) {
                ctx.setNormalCursor(ctx.getCursorLine(), ctx.findCharForward(key, cnt, stop));
            } else {
                ctx.setNormalCursor(ctx.getCursorLine(), ctx.findCharBackward(key, cnt, stop));
            }
        }
        ctx.clearPendingState();
        return;
    }

    if (ctx.getPendingSequence() === '>') {
        e.preventDefault();
        if (key === '>') {
            const cnt = getCount(ctx);
            await ctx.indentLines(ctx.getCursorLine(), Math.min(ctx.getCursorLine() + cnt - 1, ctx.getTotalLines() - 1), 1);
        }
        ctx.clearPendingState();
        return;
    }

    if (ctx.getPendingSequence() === '<') {
        e.preventDefault();
        if (key === '<') {
            const cnt = getCount(ctx);
            await ctx.indentLines(ctx.getCursorLine(), Math.min(ctx.getCursorLine() + cnt - 1, ctx.getTotalLines() - 1), -1);
        }
        ctx.clearPendingState();
        return;
    }

    if (ctx.getPendingSequence() === 'g') {
        e.preventDefault();
        if (key === 'g') {
            moveToFirstLine(ctx);
        }
        ctx.clearPendingState();
        return;
    }

    if (key >= '1' && key <= '9') {
        e.preventDefault();
        ctx.setPendingCount(ctx.getPendingCount() + key);
        ctx.syncVimStatus();
        return;
    }

    if (key === '0' && ctx.getPendingCount()) {
        e.preventDefault();
        ctx.setPendingCount(ctx.getPendingCount() + key);
        ctx.syncVimStatus();
        return;
    }

    const countPrefix = ctx.getPendingCount();
    const hadCount = countPrefix !== '';
    const count = getCount(ctx);
    ctx.clearPendingState();

    if (e.ctrlKey && key === 'r') {
        e.preventDefault();
        for (let i = 0; i < count; i++) ctx.redo();
        ctx.clearPendingState();
        return;
    }

    if (e.ctrlKey && (key === 'd' || key === 'u')) {
        e.preventDefault();
        const scrollContainer = ctx.getScrollContainer();
        if (scrollContainer) {
            const halfPage = Math.floor(scrollContainer.clientHeight / ctx.getEditorLineHeight() / 2);
            const delta = key === 'd' ? halfPage : -halfPage;
            const newLine = Math.max(0, Math.min(ctx.getTotalLines() - 1, ctx.getCursorLine() + delta));
            ctx.setCursor(newLine, ctx.getCursorChar());
            ctx.normalizeNormalCursor();
            ctx.ensureCursorVisible();
        }
        ctx.clearPendingState();
        return;
    }

    if (e.ctrlKey && (key === 'f' || key === 'b')) {
        e.preventDefault();
        const scrollContainer = ctx.getScrollContainer();
        if (scrollContainer) {
            const fullPage = Math.floor(scrollContainer.clientHeight / ctx.getEditorLineHeight()) - 1;
            const delta = key === 'f' ? fullPage : -fullPage;
            const newLine = Math.max(0, Math.min(ctx.getTotalLines() - 1, ctx.getCursorLine() + delta));
            ctx.setCursor(newLine, ctx.getCursorChar());
            ctx.normalizeNormalCursor();
            ctx.ensureCursorVisible();
        }
        ctx.clearPendingState();
        return;
    }

    switch (key) {
        case '0':
            e.preventDefault();
            moveCursorToLineStart(ctx);
            ctx.normalizeNormalCursor();
            break;
        case '^':
            e.preventDefault();
            moveCursorToFirstNonWhitespace(ctx);
            ctx.normalizeNormalCursor();
            break;
        case '$':
            e.preventDefault();
            moveCursorToLineEnd(ctx);
            break;
        case 'h':
        case 'ArrowLeft':
            e.preventDefault();
            moveHorizontalWrap(ctx, -count);
            break;
        case 'l':
        case 'ArrowRight':
            e.preventDefault();
            moveHorizontalWrap(ctx, count);
            break;
        case 'j':
        case 'ArrowDown':
            e.preventDefault();
            moveVertical(ctx, count);
            break;
        case 'k':
        case 'ArrowUp':
            e.preventDefault();
            moveVertical(ctx, -count);
            break;
        case 'w': {
            e.preventDefault();
            const target = ctx.findNextWordStart(currentPosition(ctx), count);
            ctx.setNormalCursor(target.line, target.char);
            break;
        }
        case 'b': {
            e.preventDefault();
            const target = ctx.findPreviousWordStart(currentPosition(ctx), count);
            ctx.setNormalCursor(target.line, target.char);
            break;
        }
        case 'e': {
            e.preventDefault();
            const target = ctx.findWordEnd(currentPosition(ctx), count);
            ctx.setNormalCursor(target.line, target.char);
            break;
        }
        case 'g':
            e.preventDefault();
            ctx.setPendingSequence('g');
            ctx.syncVimStatus();
            break;
        case 'G':
            e.preventDefault();
            if (hadCount) {
                ctx.setNormalCursor(ctx.clampLine(count - 1), 0);
            } else {
                moveToLastLine(ctx);
            }
            break;
        case 'i':
            e.preventDefault();
            ctx.enterInsertMode();
            break;
        case 'I':
            e.preventDefault();
            moveCursorToFirstNonWhitespace(ctx);
            ctx.enterInsertMode();
            break;
        case 'a':
            e.preventDefault();
            ctx.setCursor(ctx.getCursorLine(), Math.min(ctx.getCursorChar() + 1, ctx.lineLength(ctx.getCursorLine())));
            ctx.enterInsertMode();
            break;
        case 'A':
            e.preventDefault();
            ctx.setCursor(ctx.getCursorLine(), ctx.lineLength(ctx.getCursorLine()));
            ctx.enterInsertMode();
            break;
        case 'o':
            e.preventDefault();
            await ctx.insertNewLineBelow();
            break;
        case 'O':
            e.preventDefault();
            await ctx.insertNewLineAbove();
            break;
        case 'x':
            e.preventDefault();
            await ctx.deleteCharAtCursor(count);
            break;
        case 'p':
            e.preventDefault();
            await ctx.pasteRegister(true);
            break;
        case 'P':
            e.preventDefault();
            await ctx.pasteRegister(false);
            break;
        case 'u':
            e.preventDefault();
            for (let i = 0; i < count; i++) ctx.undo();
            break;
        case 'v':
            e.preventDefault();
            ctx.enterVisualMode();
            break;
        case ':':
            e.preventDefault();
            ctx.setVimMode('command');
            ctx.setCommandLine('');
            ctx.clearPendingState();
            ctx.syncVimStatus();
            ctx.queueRedraw();
            break;
        case 'd':
            e.preventDefault();
            ctx.setPendingCount(countPrefix);
            ctx.setPendingOperator('delete');
            ctx.setPendingSequence('d');
            ctx.syncVimStatus();
            break;
        case 'c':
            e.preventDefault();
            ctx.setPendingCount(countPrefix);
            ctx.setPendingOperator('change');
            ctx.setPendingSequence('c');
            ctx.syncVimStatus();
            break;
        case 'y':
            e.preventDefault();
            ctx.setPendingCount(countPrefix);
            ctx.setPendingOperator('yank');
            ctx.setPendingSequence('y');
            ctx.syncVimStatus();
            break;
        case 'D':
            e.preventDefault();
            await ctx.deleteRange(currentPosition(ctx), {
                line: ctx.getCursorLine(),
                char: ctx.lineLength(ctx.getCursorLine()),
            });
            break;
        case 'C':
            e.preventDefault();
            await ctx.deleteRange(currentPosition(ctx), {
                line: ctx.getCursorLine(),
                char: ctx.lineLength(ctx.getCursorLine()),
            });
            ctx.enterInsertMode();
            break;
        case 's':
            e.preventDefault();
            await ctx.deleteCharAtCursor(count);
            ctx.enterInsertMode();
            break;
        case 'S':
            e.preventDefault();
            await ctx.mutateDocument(() => {
                setCurrentRegister(ctx, { text: ctx.getLine(ctx.getCursorLine()), linewise: false });
                ctx.setLine(ctx.getCursorLine(), '');
                ctx.setCursor(ctx.getCursorLine(), 0);
            });
            ctx.enterInsertMode();
            break;
        case 'J': {
            e.preventDefault();
            const joinCount = Math.max(count, 1);
            await ctx.mutateDocument(() => {
                let cursorLine = ctx.getCursorLine();
                for (let n = 0; n < joinCount && cursorLine < ctx.getTotalLines() - 1; n++) {
                    const cur = ctx.getLine(cursorLine);
                    const next = ctx.getLine(cursorLine + 1);
                    const joined = cur + (next.trimStart() ? ` ${next.trimStart()}` : '');
                    ctx.setLine(cursorLine, joined);
                    ctx.deleteLine(cursorLine + 1);
                    ctx.setCursor(cursorLine, cur.length);
                    cursorLine = ctx.getCursorLine();
                }
            });
            break;
        }
        case '~': {
            e.preventDefault();
            await ctx.mutateDocument(() => {
                const cursorLine = ctx.getCursorLine();
                const cursorChar = ctx.getCursorChar();
                const line = ctx.getLine(cursorLine);
                let newLine = line;
                for (let i = 0; i < count && cursorChar + i < line.length; i++) {
                    const ch = line[cursorChar + i];
                    const toggled = ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase();
                    newLine = newLine.slice(0, cursorChar + i) + toggled + newLine.slice(cursorChar + i + 1);
                }
                ctx.setLine(cursorLine, newLine);
                ctx.setCursor(cursorLine, Math.min(cursorChar + count, Math.max(ctx.lineLength(cursorLine) - 1, 0)));
            });
            break;
        }
        case '%': {
            e.preventDefault();
            const cursorLine = ctx.getCursorLine();
            const cursorChar = ctx.getCursorChar();
            const lineText = ctx.getLine(cursorLine);
            const openBrackets = '({[';
            const closeBrackets = ')}]';
            const ch = lineText[cursorChar];
            if (ch && (openBrackets.includes(ch) || closeBrackets.includes(ch))) {
                const matchResult = ctx.findMatchingBracket(cursorLine, cursorChar);
                if (matchResult) ctx.setNormalCursor(matchResult.line, matchResult.char);
            }
            break;
        }
        case 'r':
            e.preventDefault();
            ctx.setPendingSequence('r');
            ctx.syncVimStatus();
            break;
        case 'z':
            e.preventDefault();
            ctx.setPendingSequence('z');
            ctx.syncVimStatus();
            break;
        case 'f':
        case 'F':
        case 't':
        case 'T':
            e.preventDefault();
            ctx.setPendingSequence(key);
            ctx.setPendingCount(countPrefix);
            ctx.syncVimStatus();
            break;
        case ';':
            e.preventDefault();
            repeatLastFind(ctx, count);
            break;
        case ',':
            e.preventDefault();
            repeatLastFind(ctx, count, true);
            break;
        case '>':
            e.preventDefault();
            ctx.setPendingSequence('>');
            ctx.setPendingCount(countPrefix);
            ctx.syncVimStatus();
            break;
        case '<':
            e.preventDefault();
            ctx.setPendingSequence('<');
            ctx.setPendingCount(countPrefix);
            ctx.syncVimStatus();
            break;
    }
}
