/**
 * Shared types for the EditorBuffer subsystem.
 * All types are pure data — no Svelte state or DOM dependencies.
 */

export interface CursorPosition {
    line: number;
    char: number;
}

export interface EditorSnapshot {
    lineCache: Map<number, string>;
    totalLines: number;
    cursorLine: number;
    cursorChar: number;
}

export interface VimRegister {
    text: string;
    linewise: boolean;
}

export interface Token {
    text: string;
    token_type: string;
}

export interface SyntaxHighlight {
    tokens: Token[];
    used_fallback: boolean;
}
