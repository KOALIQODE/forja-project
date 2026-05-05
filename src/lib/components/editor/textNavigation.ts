/**
 * Pure text navigation utilities.
 * All functions take getLine / totalLines as parameters — no Svelte state.
 * Safe to test without a DOM or Svelte runtime.
 */

import type { CursorPosition } from './types';
import {
    clonePosition,
    advancePosition,
    retreatPosition,
    charAt,
    isWordChar,
    isWhitespace,
} from './positionUtils';

// ── Word movement ─────────────────────────────────────────────────────────────

export function findNextWordStart(
    from: CursorPosition,
    getLine: (l: number) => string,
    totalLines: number,
    count = 1,
): CursorPosition {
    let current = clonePosition(from);

    for (let iteration = 0; iteration < count; iteration++) {
        let walker = clonePosition(current);
        const firstChar = charAt(walker, getLine, totalLines);
        const firstIsWord = isWordChar(firstChar);

        while (true) {
            const next = advancePosition(walker, getLine, totalLines);
            if (!next) return current;
            walker = next;
            const char = charAt(walker, getLine, totalLines);
            if (!char) return current;
            if (firstIsWord) {
                if (!isWordChar(char)) break;
            } else if (!isWhitespace(char)) {
                break;
            }
        }

        while (isWhitespace(charAt(walker, getLine, totalLines))) {
            const next = advancePosition(walker, getLine, totalLines);
            if (!next) break;
            walker = next;
        }

        current = walker;
    }

    return current;
}

export function findPreviousWordStart(
    from: CursorPosition,
    getLine: (l: number) => string,
    _totalLines: number,
    count = 1,
): CursorPosition {
    let current = clonePosition(from);

    for (let iteration = 0; iteration < count; iteration++) {
        let walker = retreatPosition(current, getLine);
        if (!walker) return { line: 0, char: 0 };

        while (walker && isWhitespace(charAt(walker, getLine, _totalLines))) {
            walker = retreatPosition(walker, getLine);
        }
        if (!walker) return { line: 0, char: 0 };

        const categoryIsWord = isWordChar(charAt(walker, getLine, _totalLines));

        while (true) {
            const previous = retreatPosition(walker, getLine);
            if (!previous) break;
            const char = charAt(previous, getLine, _totalLines);
            if (categoryIsWord ? !isWordChar(char) : isWhitespace(char) || isWordChar(char)) {
                break;
            }
            walker = previous;
        }

        if (categoryIsWord) {
            while (true) {
                const previous = retreatPosition(walker, getLine);
                if (!previous || !isWordChar(charAt(previous, getLine, _totalLines))) break;
                walker = previous;
            }
        }

        current = walker;
    }

    return current;
}

export function findWordEnd(
    from: CursorPosition,
    getLine: (l: number) => string,
    totalLines: number,
    count = 1,
): CursorPosition {
    let current = clonePosition(from);

    for (let iteration = 0; iteration < count; iteration++) {
        let walker = clonePosition(current);

        while (isWhitespace(charAt(walker, getLine, totalLines))) {
            const next = advancePosition(walker, getLine, totalLines);
            if (!next) return walker;
            walker = next;
        }

        const categoryIsWord = isWordChar(charAt(walker, getLine, totalLines));

        while (true) {
            const next = advancePosition(walker, getLine, totalLines);
            if (!next) break;
            const nextChar = charAt(next, getLine, totalLines);
            if (
                categoryIsWord
                    ? !isWordChar(nextChar)
                    : isWhitespace(nextChar) || isWordChar(nextChar)
            ) {
                break;
            }
            walker = next;
        }

        current = walker;

        if (iteration < count - 1) {
            const next = advancePosition(current, getLine, totalLines);
            if (!next) break;
            current = next;
        }
    }

    return current;
}

// ── Character find (f / F / t / T motions) ───────────────────────────────────

export function findCharForward(
    ch: string,
    cursorChar: number,
    cursorLine: number,
    getLine: (l: number) => string,
    count: number,
    stop = false,
): number {
    const line = getLine(cursorLine);
    let found = 0;
    for (let i = cursorChar + 1; i < line.length; i++) {
        if (line[i] === ch) {
            found++;
            if (found === count) return stop ? i - 1 : i;
        }
    }
    return cursorChar;
}

export function findCharBackward(
    ch: string,
    cursorChar: number,
    cursorLine: number,
    getLine: (l: number) => string,
    count: number,
    stop = false,
): number {
    const line = getLine(cursorLine);
    let found = 0;
    for (let i = cursorChar - 1; i >= 0; i--) {
        if (line[i] === ch) {
            found++;
            if (found === count) return stop ? i + 1 : i;
        }
    }
    return cursorChar;
}

// ── Bracket matching (% motion) ───────────────────────────────────────────────

export function findMatchingBracket(
    line: number,
    char: number,
    getLine: (l: number) => string,
    totalLines: number,
): CursorPosition | null {
    const open = '({[';
    const close = ')}]';
    const lineText = getLine(line);
    const startCh = lineText[char];
    if (!startCh) return null;

    const isOpen = open.includes(startCh);
    const matchCh = isOpen ? close[open.indexOf(startCh)] : open[close.indexOf(startCh)];
    let depth = 0;

    if (isOpen) {
        for (let l = line; l < totalLines; l++) {
            const text = getLine(l);
            const startC = l === line ? char : 0;
            for (let c = startC; c < text.length; c++) {
                if (text[c] === startCh) depth++;
                else if (text[c] === matchCh) {
                    depth--;
                    if (depth === 0) return { line: l, char: c };
                }
            }
        }
    } else {
        for (let l = line; l >= 0; l--) {
            const text = getLine(l);
            const startC = l === line ? char : text.length - 1;
            for (let c = startC; c >= 0; c--) {
                if (text[c] === startCh) depth++;
                else if (text[c] === matchCh) {
                    depth--;
                    if (depth === 0) return { line: l, char: c };
                }
            }
        }
    }
    return null;
}
