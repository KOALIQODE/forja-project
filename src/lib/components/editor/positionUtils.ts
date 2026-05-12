/**
 * Pure cursor / position utility functions.
 * All functions are stateless — they take data as parameters and return values.
 * Safe to test without a DOM or Svelte runtime.
 */

import type { CursorPosition } from './types';

// ── Character classification ──────────────────────────────────────────────────

export function isWordChar(char: string): boolean {
    return /[A-Za-z0-9_]/.test(char);
}

export function isWhitespace(char: string): boolean {
    return /\s/.test(char);
}

// ── Position comparison ───────────────────────────────────────────────────────

export function comparePositions(a: CursorPosition, b: CursorPosition): number {
    if (a.line !== b.line) return a.line - b.line;
    return a.char - b.char;
}

export function sortPositions(
    a: CursorPosition,
    b: CursorPosition,
): [CursorPosition, CursorPosition] {
    return comparePositions(a, b) <= 0 ? [a, b] : [b, a];
}

export function clonePosition(position: CursorPosition): CursorPosition {
    return { line: position.line, char: position.char };
}

// ── Bounds clamping ───────────────────────────────────────────────────────────

export function clampLine(line: number, totalLines: number): number {
    return Math.max(0, Math.min(line, Math.max(totalLines - 1, 0)));
}

export function clampChar(line: number, char: number, getLine: (l: number) => string): number {
    return Math.max(0, Math.min(char, getLine(line).length));
}

export function lineLength(line: number, getLine: (l: number) => string): number {
    return getLine(line).length;
}

// ── Position traversal ────────────────────────────────────────────────────────

export function advancePosition(
    position: CursorPosition,
    getLine: (l: number) => string,
    totalLines: number,
): CursorPosition | null {
    const text = getLine(position.line);
    if (position.char < text.length) {
        return { line: position.line, char: position.char + 1 };
    }
    if (position.line < totalLines - 1) {
        return { line: position.line + 1, char: 0 };
    }
    return null;
}

export function retreatPosition(
    position: CursorPosition,
    getLine: (l: number) => string,
): CursorPosition | null {
    if (position.char > 0) {
        return { line: position.line, char: position.char - 1 };
    }
    if (position.line > 0) {
        return { line: position.line - 1, char: getLine(position.line - 1).length };
    }
    return null;
}

export function charAt(
    position: CursorPosition,
    getLine: (l: number) => string,
    totalLines: number,
): string {
    const text = getLine(position.line);
    if (position.char < text.length) return text[position.char];
    return position.line < totalLines - 1 ? '\n' : '';
}

// ── Range text extraction ─────────────────────────────────────────────────────

export function getRangeText(
    start: CursorPosition,
    end: CursorPosition,
    getLine: (l: number) => string,
): string {
    if (start.line === end.line) {
        return getLine(start.line).slice(start.char, end.char);
    }
    const parts = [getLine(start.line).slice(start.char)];
    for (let i = start.line + 1; i < end.line; i++) {
        parts.push(getLine(i));
    }
    parts.push(getLine(end.line).slice(0, end.char));
    return parts.join('\n');
}
