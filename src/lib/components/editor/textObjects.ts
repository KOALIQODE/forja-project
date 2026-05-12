/**
 * Pure text object detection utilities (Vim `i`/`a` text objects).
 * All functions are stateless — they take data as parameters.
 * Safe to test without a DOM or Svelte runtime.
 */

import type { CursorPosition } from './types';
import { isWordChar } from './positionUtils';

const BRACKET_PAIRS: Record<string, [string, string]> = {
    '(': ['(', ')'], ')': ['(', ')'],
    '[': ['[', ']'], ']': ['[', ']'],
    '{': ['{', '}'], '}': ['{', '}'],
    '<': ['<', '>'], '>': ['<', '>'],
    '"': ['"', '"'],
    "'": ["'", "'"],
    '`': ['`', '`'],
};

export interface TextObjectRange {
    start: CursorPosition;
    end: CursorPosition;
}

export function getTextObjectRange(
    type: 'i' | 'a',
    obj: string,
    cursorLine: number,
    cursorChar: number,
    getLine: (l: number) => string,
    totalLines: number,
): TextObjectRange | null {
    if (obj === 'w' || obj === 'W') {
        const line = getLine(cursorLine);
        const testFn: (c: string) => boolean =
            obj === 'W' ? (c) => !/\s/.test(c) : isWordChar;
        let start = cursorChar;
        while (start > 0 && testFn(line[start - 1])) start--;
        let end = cursorChar;
        while (end < line.length && testFn(line[end])) end++;
        if (type === 'a') {
            while (end < line.length && /\s/.test(line[end])) end++;
        }
        return {
            start: { line: cursorLine, char: start },
            end: { line: cursorLine, char: end },
        };
    }

    const pair = BRACKET_PAIRS[obj];
    if (!pair) return null;

    const [openCh, closeCh] = pair;
    const samePair = openCh === closeCh;

    let openLine = cursorLine, openChar = -1;
    let closeLinePos = cursorLine, closeChar = -1;

    if (samePair) {
        const line = getLine(cursorLine);
        for (let i = 0; i < line.length; i++) {
            if (line[i] === openCh && i < cursorChar) openChar = i;
        }
        for (let i = cursorChar; i < line.length; i++) {
            if (line[i] === openCh && i > openChar) {
                closeChar = i;
                break;
            }
        }
        if (openChar < 0 || closeChar < 0) return null;
        openLine = cursorLine;
        closeLinePos = cursorLine;
    } else {
        for (let l = cursorLine; l >= 0; l--) {
            const line = getLine(l);
            const startC = l === cursorLine ? cursorChar : line.length - 1;
            for (let c = startC; c >= 0; c--) {
                if (line[c] === openCh) {
                    openLine = l;
                    openChar = c;
                    break;
                }
            }
            if (openChar >= 0) break;
        }
        if (openChar < 0) return null;

        let depth = 0;
        for (let l = openLine; l < totalLines; l++) {
            const line = getLine(l);
            const startC = l === openLine ? openChar : 0;
            for (let c = startC; c < line.length; c++) {
                if (line[c] === openCh) depth++;
                else if (line[c] === closeCh) {
                    depth--;
                    if (depth === 0) {
                        closeLinePos = l;
                        closeChar = c;
                        break;
                    }
                }
            }
            if (closeChar >= 0) break;
        }
        if (closeChar < 0) return null;
    }

    if (type === 'i') {
        return {
            start: { line: openLine, char: openChar + 1 },
            end: { line: closeLinePos, char: closeChar },
        };
    }
    return {
        start: { line: openLine, char: openChar },
        end: { line: closeLinePos, char: closeChar + 1 },
    };
}
