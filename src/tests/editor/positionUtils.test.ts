import { describe, it, expect } from 'vitest';
import {
    comparePositions,
    sortPositions,
    clonePosition,
    clampLine,
    clampChar,
    lineLength,
    advancePosition,
    retreatPosition,
    charAt,
    getRangeText,
    isWordChar,
    isWhitespace,
} from '$lib/components/editor/positionUtils';

const lines = ['hello world', 'foo bar', '', 'last line'];
const getLine = (l: number) => lines[l] ?? '';
const totalLines = lines.length;

describe('positionUtils', () => {
    describe('isWordChar / isWhitespace', () => {
        it('classifies letters and digits as word chars', () => {
            expect(isWordChar('a')).toBe(true);
            expect(isWordChar('Z')).toBe(true);
            expect(isWordChar('9')).toBe(true);
            expect(isWordChar('_')).toBe(true);
        });
        it('classifies punctuation and space as non-word', () => {
            expect(isWordChar(' ')).toBe(false);
            expect(isWordChar('.')).toBe(false);
            expect(isWordChar('-')).toBe(false);
        });
        it('identifies whitespace', () => {
            expect(isWhitespace(' ')).toBe(true);
            expect(isWhitespace('\t')).toBe(true);
            expect(isWhitespace('\n')).toBe(true);
            expect(isWhitespace('a')).toBe(false);
        });
    });

    describe('comparePositions', () => {
        it('returns 0 for equal positions', () => {
            expect(comparePositions({ line: 1, char: 3 }, { line: 1, char: 3 })).toBe(0);
        });
        it('returns negative when a is before b (same line)', () => {
            expect(comparePositions({ line: 1, char: 2 }, { line: 1, char: 5 })).toBeLessThan(0);
        });
        it('returns positive when a is after b (different lines)', () => {
            expect(comparePositions({ line: 2, char: 0 }, { line: 1, char: 9 })).toBeGreaterThan(0);
        });
    });

    describe('sortPositions', () => {
        it('returns [a, b] when a <= b', () => {
            const a = { line: 0, char: 0 };
            const b = { line: 1, char: 0 };
            const [s, e] = sortPositions(a, b);
            expect(s).toEqual(a);
            expect(e).toEqual(b);
        });
        it('swaps when b < a', () => {
            const a = { line: 3, char: 0 };
            const b = { line: 0, char: 5 };
            const [s, e] = sortPositions(a, b);
            expect(s).toEqual(b);
            expect(e).toEqual(a);
        });
    });

    describe('clonePosition', () => {
        it('returns a new object with same values', () => {
            const pos = { line: 2, char: 7 };
            const clone = clonePosition(pos);
            expect(clone).toEqual(pos);
            expect(clone).not.toBe(pos);
        });
    });

    describe('clampLine', () => {
        it('clamps to 0 at minimum', () => {
            expect(clampLine(-5, 10)).toBe(0);
        });
        it('clamps to last line at maximum', () => {
            expect(clampLine(100, 10)).toBe(9);
        });
        it('passes through valid lines', () => {
            expect(clampLine(3, 10)).toBe(3);
        });
        it('handles single-line document', () => {
            expect(clampLine(0, 1)).toBe(0);
            expect(clampLine(5, 1)).toBe(0);
        });
    });

    describe('clampChar', () => {
        it('clamps to 0 at minimum', () => {
            expect(clampChar(0, -3, getLine)).toBe(0);
        });
        it('clamps to line length at maximum', () => {
            // 'hello world' has length 11
            expect(clampChar(0, 100, getLine)).toBe(11);
        });
        it('passes through valid char', () => {
            expect(clampChar(0, 5, getLine)).toBe(5);
        });
    });

    describe('lineLength', () => {
        it('returns correct length', () => {
            expect(lineLength(0, getLine)).toBe(11);
            expect(lineLength(2, getLine)).toBe(0);
        });
    });

    describe('advancePosition', () => {
        it('advances char within a line', () => {
            const result = advancePosition({ line: 0, char: 0 }, getLine, totalLines);
            expect(result).toEqual({ line: 0, char: 1 });
        });
        it('wraps to next line at end of line', () => {
            // 'hello world' = 11 chars, index 10 is last
            const result = advancePosition({ line: 0, char: 11 }, getLine, totalLines);
            expect(result).toEqual({ line: 1, char: 0 });
        });
        it('returns null at end of document', () => {
            const lastLine = totalLines - 1;
            const lastChar = getLine(lastLine).length;
            const result = advancePosition({ line: lastLine, char: lastChar }, getLine, totalLines);
            expect(result).toBeNull();
        });
    });

    describe('retreatPosition', () => {
        it('retreats char within a line', () => {
            const result = retreatPosition({ line: 0, char: 5 }, getLine);
            expect(result).toEqual({ line: 0, char: 4 });
        });
        it('wraps to end of previous line', () => {
            // line 1 = 'foo bar' (7 chars)
            const result = retreatPosition({ line: 1, char: 0 }, getLine);
            expect(result).toEqual({ line: 0, char: 11 });
        });
        it('returns null at document start', () => {
            const result = retreatPosition({ line: 0, char: 0 }, getLine);
            expect(result).toBeNull();
        });
    });

    describe('charAt', () => {
        it('returns the character at position', () => {
            expect(charAt({ line: 0, char: 0 }, getLine, totalLines)).toBe('h');
            expect(charAt({ line: 0, char: 6 }, getLine, totalLines)).toBe('w');
        });
        it('returns newline at end of non-last line', () => {
            expect(charAt({ line: 0, char: 11 }, getLine, totalLines)).toBe('\n');
        });
        it('returns empty string at end of last line', () => {
            const last = totalLines - 1;
            const len = getLine(last).length;
            expect(charAt({ line: last, char: len }, getLine, totalLines)).toBe('');
        });
    });

    describe('getRangeText', () => {
        it('extracts text within a single line', () => {
            const text = getRangeText({ line: 0, char: 0 }, { line: 0, char: 5 }, getLine);
            expect(text).toBe('hello');
        });
        it('extracts text across multiple lines', () => {
            const text = getRangeText({ line: 0, char: 6 }, { line: 1, char: 3 }, getLine);
            expect(text).toBe('world\nfoo');
        });
        it('handles empty range', () => {
            const text = getRangeText({ line: 0, char: 3 }, { line: 0, char: 3 }, getLine);
            expect(text).toBe('');
        });
    });
});
