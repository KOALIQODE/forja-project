/**
 * Phase 6 — Stateful Document Bridge
 *
 * Wraps the four Tauri document commands exposed in Phase 1-3:
 *   open_document, apply_text_edit, get_document_tokens, close_document
 *
 * Responsibilities:
 *   1. Maintains docId returned by the backend.
 *   2. Converts TokenSpan[] (byte-range based) → Map<line, Token[]> for the renderer.
 *   3. Handles graceful degradation when the parser is not installed for a language
 *      (tokens will simply be absent and the editor falls back to plain text).
 *   4. Tracks a pending edit batch (Phase 7) — flushes to the backend on the next
 *      animation frame rather than on every keystroke.
 */

import { invoke } from '@tauri-apps/api/core';

// ── Types from the Rust backend ──────────────────────────────────────────────

/** Matches highlight::TokenSpan in src-tauri */
export interface TokenSpan {
	start_byte: number;
	end_byte: number;
	start_line: number;
	start_col: number;
	end_line: number;
	end_col: number;
	highlight_name: string;
}

/** Matches the Token format already used by the editor renderer */
export interface Token {
	text: string;
	token_type: string;
}

// ── Highlight name → TokenType mapping ───────────────────────────────────────

const HIGHLIGHT_TO_TOKEN: Record<string, string> = {
	// Base categories
	keyword:     'Keyword',
	function:    'Function',
	method:      'Function',
	constructor: 'Function',
	type:        'Type',
	class:       'Type',
	string:      'String',
	comment:     'Comment',
	number:      'Number',
	float:       'Number',
	integer:     'Number',
	punctuation: 'Punctuation',
	operator:    'Operator',
	variable:    'Variable',
	parameter:   'Variable',
	property:    'Property',
	field:       'Property',
	constant:    'Constant',
	attribute:   'Attribute',
	boolean:     'Boolean',
	// Subcategory bases (dot-notation — matched via split('.')[0] below)
	embedded:    'Unknown',
	tag:         'Type',
	namespace:   'Variable',
};

function highlightNameToTokenType(name: string): string {
	const base = name.split('.')[0];
	return HIGHLIGHT_TO_TOKEN[base] ?? 'Unknown';
}

// ── Byte offset helpers ───────────────────────────────────────────────────────

const encoder = new TextEncoder();

/** Compute byte offset of (line, col) in a Map<line, string> line cache. */
export function lineColToByteOffset(
	lineCache: Map<number, string>,
	line: number,
	col: number
): number {
	let offset = 0;
	for (let i = 0; i < line; i++) {
		const text = lineCache.get(i) ?? '';
		offset += encoder.encode(text).byteLength + 1; // +1 for '\n'
	}
	const lineText = lineCache.get(line) ?? '';
	offset += encoder.encode(lineText.substring(0, col)).byteLength;
	return offset;
}

// ── DocumentBridge ────────────────────────────────────────────────────────────

export class DocumentBridge {
	private docId: number | null = null;
	private language: string = '';

	/** Phase 7 edit batch — accumulated before flush */
	private pendingEdit: {
		startByte: number;
		oldEndByte: number;
		newEndByte: number;
		insertedText: string;
	} | null = null;
	private flushRafId: number | null = null;

	constructor() {}

	// ── Lifecycle ────────────────────────────────────────────────────────────────

	/** Call when the file is first loaded. */
	async open(path: string, content: string, language: string): Promise<void> {
		this.language = language;
		try {
			this.docId = await invoke<number>('open_document', {
				path,
				content,
				language: this.language,
			});
		} catch (e) {
			// Parser not installed — docId stays null, features degrade gracefully
			console.warn('[DocumentBridge] open_document failed (parser not installed?):', e);
			this.docId = null;
		}
	}

	/** Call in onDestroy to free backend state. */
	async close(): Promise<void> {
		if (this.docId === null) return;
		const id = this.docId;
		this.docId = null;
		try {
			await invoke('close_document', { docId: id });
		} catch (_) {
			// Ignore — best effort cleanup
		}
	}

	isOpen(): boolean {
		return this.docId !== null;
	}

	// ── Phase 2: incremental edit (with Phase 7 batching) ────────────────────────

	/**
	 * Schedules an edit to be sent on the next animation frame.
	 * Consecutive edits at the same position are coalesced.
	 */
	scheduleEdit(
		startByte: number,
		oldEndByte: number,
		newEndByte: number,
		insertedText: string
	): void {
		if (this.docId === null) return;

		// Simple coalescing: extend the pending edit if it's contiguous
		if (this.pendingEdit && this.pendingEdit.newEndByte === startByte) {
			this.pendingEdit.newEndByte = newEndByte;
			this.pendingEdit.insertedText += insertedText;
		} else {
			// Flush the previous edit synchronously before scheduling the new one
			if (this.pendingEdit) this.flushEditSync();
			this.pendingEdit = { startByte, oldEndByte, newEndByte, insertedText };
		}

		if (this.flushRafId === null) {
			this.flushRafId = requestAnimationFrame(() => {
				this.flushRafId = null;
				this.flushEditSync();
			});
		}
	}

	/** Force-flush any pending edit immediately (e.g. before requesting tokens). */
	flushEditSync(): void {
		if (!this.pendingEdit || this.docId === null) return;
		const edit = this.pendingEdit;
		this.pendingEdit = null;
		// Fire-and-forget: version mismatch is acceptable for highlighting
		invoke<number>('apply_text_edit', {
			docId: this.docId,
			startByte: edit.startByte,
			oldEndByte: edit.oldEndByte,
			newEndByte: edit.newEndByte,
			insertedText: edit.insertedText,
		}).catch((e) => console.warn('[DocumentBridge] apply_text_edit failed:', e));
	}

	// ── Phase 3: get tokens for visible range ─────────────────────────────────────

	/**
	 * Returns per-line token maps for lines [startLine, endLine] inclusive.
	 * Returns null if no docId (parser not available) — caller should fallback
	 * to highlight_syntax or plain text.
	 */
	async getTokensForRange(
		startLine: number,
		endLine: number,
		lineCache: Map<number, string>
	): Promise<Map<number, Token[]> | null> {
		if (this.docId === null) return null;

		// Flush pending edits before querying (so AST is up to date)
		this.flushEditSync();

		let spans: TokenSpan[];
		try {
			spans = await invoke<TokenSpan[]>('get_document_tokens', {
				docId: this.docId,
				startLine,
				endLine,
			});
		} catch (e) {
			console.warn('[DocumentBridge] get_document_tokens failed:', e);
			return null;
		}

		return spansToLineTokens(spans, lineCache, startLine, endLine);
	}
}

// ── Span → Token[] conversion ─────────────────────────────────────────────────

/**
 * Converts a flat array of TokenSpan (from tree-sitter QueryCursor) into a
 * Map<lineIndex, Token[]> suitable for the existing canvas renderer.
 *
 * Only handles single-line spans for simplicity — multi-line spans (e.g. block
 * comments) are split at line boundaries in the backend's QueryCursor output,
 * so each capture node should already be single-line in practice.
 */
export function spansToLineTokens(
	spans: TokenSpan[],
	lineCache: Map<number, string>,
	startLine: number,
	endLine: number
): Map<number, Token[]> {
	const result = new Map<number, Token[]>();

	// Group spans by line. Multi-line spans (e.g. block comments) are split
	// into per-line slices so every line gets its colour.
	const byLine = new Map<number, TokenSpan[]>();

	function addToLine(line: number, span: TokenSpan) {
		if (line < startLine || line > endLine) return;
		if (!byLine.has(line)) byLine.set(line, []);
		byLine.get(line)!.push(span);
	}

	for (const span of spans) {
		if (span.start_line === span.end_line) {
			addToLine(span.start_line, span);
		} else {
			// Split multi-line span into one synthetic span per covered line
			for (let li = span.start_line; li <= span.end_line; li++) {
				const lineText = lineCache.get(li) ?? '';
				const sc = li === span.start_line ? span.start_col : 0;
				const ec = li === span.end_line ? span.end_col : lineText.length;
				addToLine(li, {
					...span,
					start_line: li,
					end_line: li,
					start_col: sc,
					end_col: ec,
				});
			}
		}
	}

	for (let li = startLine; li <= endLine; li++) {
		const lineSpans = byLine.get(li);
		if (!lineSpans || lineSpans.length === 0) continue;

		const lineText = lineCache.get(li) ?? '';
		lineSpans.sort((a, b) => a.start_col - b.start_col);

		const tokens: Token[] = [];
		let pos = 0;

		for (const span of lineSpans) {
			const sc = Math.min(span.start_col, lineText.length);
			const ec = Math.min(span.end_col, lineText.length);
			if (ec <= pos) continue; // already covered by a prior span

			if (sc > pos) {
				tokens.push({ text: lineText.substring(pos, sc), token_type: 'Unknown' });
			}
			const text = lineText.substring(Math.max(sc, pos), ec);
			if (text) {
				tokens.push({ text, token_type: highlightNameToTokenType(span.highlight_name) });
			}
			pos = Math.max(pos, ec);
		}

		if (pos < lineText.length) {
			tokens.push({ text: lineText.substring(pos), token_type: 'Unknown' });
		}

		if (tokens.length > 0) result.set(li, tokens);
	}

	return result;
}
