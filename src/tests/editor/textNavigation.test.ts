import { describe, it, expect } from 'vitest';
import {
    findNextWordStart,
    findPreviousWordStart,
    findWordEnd,
    findCharForward,
    findCharBackward,
    findMatchingBracket,
} from '$lib/components/editor/textNavigation';

// Simple 4-line document for navigation tests
const docLines = [
    'hello world',   // 0: two words
    '  foo  bar',    // 1: leading whitespace, two words
    'let x = 42;',   // 2: code line
    '',              // 3: empty line
];
const getLine = (l: number) => docLines[l] ?? '';
const totalLines = docLines.length;

describe('textNavigation', () => {
    describe('findNextWordStart', () => {
        it('moves to next word on same line', () => {
            const result = findNextWordStart({ line: 0, char: 0 }, getLine, totalLines);
            expect(result).toEqual({ line: 0, char: 6 }); // 'world'
        });
        it('moves to next line when at end of words on current line', () => {
            const result = findNextWordStart({ line: 0, char: 6 }, getLine, totalLines);
            // 'world' ends at 10, next line has leading spaces then 'foo'
            expect(result.line).toBe(1);
        });
        it('skips multiple words with count', () => {
            const result = findNextWordStart({ line: 0, char: 0 }, getLine, totalLines, 2);
            // Skip 'hello' → 'world', skip 'world' → line 1 'foo'
            expect(result.line).toBe(1);
        });
        it('returns last position when at document end', () => {
            const result = findNextWordStart(
                { line: totalLines - 1, char: 0 },
                getLine,
                totalLines,
            );
            // Already at last line empty, can't advance — returns same
            expect(result.line).toBe(totalLines - 1);
        });
    });

    describe('findPreviousWordStart', () => {
        it('moves to start of previous word', () => {
            const result = findPreviousWordStart({ line: 0, char: 6 }, getLine, totalLines);
            expect(result).toEqual({ line: 0, char: 0 }); // back to 'hello'
        });
        it('returns origin when at document start', () => {
            const result = findPreviousWordStart({ line: 0, char: 0 }, getLine, totalLines);
            expect(result).toEqual({ line: 0, char: 0 });
        });
        it('crosses line boundary', () => {
            const result = findPreviousWordStart({ line: 1, char: 2 }, getLine, totalLines);
            // from '  foo' at char 2 (leading space) go back to line 0 'world'
            expect(result.line).toBe(0);
        });
    });

    describe('findWordEnd', () => {
        it('finds end of current word', () => {
            const result = findWordEnd({ line: 0, char: 0 }, getLine, totalLines);
            expect(result).toEqual({ line: 0, char: 4 }); // end of 'hello' (inclusive)
        });
        it('skips whitespace to find end of next word', () => {
            const result = findWordEnd({ line: 0, char: 5 }, getLine, totalLines);
            // at space between words, finds end of 'world'
            expect(result).toEqual({ line: 0, char: 10 });
        });
        it('handles count > 1', () => {
            const result = findWordEnd({ line: 0, char: 0 }, getLine, totalLines, 2);
            // Skip to end of 'hello', then advance to end of 'world'
            expect(result.char).toBe(10);
        });
    });

    describe('findCharForward', () => {
        it('finds character forward on line', () => {
            const result = findCharForward('o', 0, 0, getLine, 1);
            expect(result).toBe(4); // first 'o' in 'hello'
        });
        it('finds nth occurrence with count', () => {
            const result = findCharForward('o', 0, 0, getLine, 2);
            // 'hello world': first 'o' at 4, second 'o' at 7
            expect(result).toBe(7);
        });
        it('returns cursorChar when char not found', () => {
            const result = findCharForward('z', 0, 0, getLine, 1);
            expect(result).toBe(0);
        });
        it('stop=true returns position before char (t motion)', () => {
            const result = findCharForward('o', 0, 0, getLine, 1, true);
            expect(result).toBe(3); // one before 'o' at index 4
        });
    });

    describe('findCharBackward', () => {
        it('finds character backward on line', () => {
            const result = findCharBackward('l', 10, 0, getLine, 1);
            expect(result).toBe(9); // last 'l' before pos 10 in 'hello world'
        });
        it('returns cursorChar when not found', () => {
            const result = findCharBackward('z', 5, 0, getLine, 1);
            expect(result).toBe(5);
        });
        it('stop=true returns position after char (T motion)', () => {
            const result = findCharBackward('l', 10, 0, getLine, 1, true);
            expect(result).toBe(10); // one after 'l' at 9
        });
    });

    describe('findMatchingBracket', () => {
        const bracketLines = ['fn foo(x: i32) {', '    let y = x + 1;', '}'];
        const bracketGet = (l: number) => bracketLines[l] ?? '';
        const bracketTotal = bracketLines.length;

        it('finds matching ) for (', () => {
            // line 0: 'fn foo(x: i32) {' — '(' at index 6, ')' at index 13
            const result = findMatchingBracket(0, 6, bracketGet, bracketTotal);
            expect(result).toEqual({ line: 0, char: 13 });
        });
        it('finds matching { across lines', () => {
            // '{' is at index 15 on line 0, '}' is at index 0 on line 2
            const result = findMatchingBracket(0, 15, bracketGet, bracketTotal);
            expect(result).toEqual({ line: 2, char: 0 });
        });
        it('finds matching } back to {', () => {
            const result = findMatchingBracket(2, 0, bracketGet, bracketTotal);
            expect(result).toEqual({ line: 0, char: 15 });
        });
        it('returns null when no match', () => {
            const noMatch = ['(no close'];
            const result = findMatchingBracket(0, 0, (l) => noMatch[l] ?? '', 1);
            expect(result).toBeNull();
        });
        it('returns null for non-bracket char', () => {
            const result = findMatchingBracket(0, 2, bracketGet, bracketTotal); // 'f' in 'fn'
            expect(result).toBeNull();
        });
    });
});
