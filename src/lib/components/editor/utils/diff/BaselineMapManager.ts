/**
 * diff/BaselineMapManager.ts
 *
 * Stores the "baseline" content of a file — the version we diff against.
 * By default this is the content at file-open time (i.e. what is on disk /
 * what git HEAD has).  The Rust `get_git_hunks` command can later push an
 * authoritative HEAD snapshot to replace the open-time baseline.
 *
 * Thread model: single-threaded (JS), all methods are synchronous.
 */

export class BaselineMapManager {
	/** Dense line array for the baseline content (0-indexed). */
	private lines: string[] = [];
	/** Total line count in the baseline. */
	private _totalLines = 0;
	/** File path this baseline belongs to (informational). */
	private _filePath = '';

	// ── Initialisation ────────────────────────────────────────────────────────

	/**
	 * Sets the baseline from the raw file text.
	 * Call this when a file is first opened or when its saved content is reloaded.
	 *
	 * @param content  Raw file content (may use LF or CRLF).
	 * @param filePath For logging / identity checks.
	 */
	setFromContent(content: string, filePath = ''): void {
		this._filePath = filePath;
		// Normalise line endings to LF and split
		this.lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
		this._totalLines = this.lines.length;
	}

	/**
	 * Sets the baseline from a pre-split line array.
	 * Used when the Rust backend returns the HEAD content as an array.
	 */
	setFromLines(lines: string[], filePath = ''): void {
		this._filePath = filePath;
		this.lines = lines.slice(); // defensive copy
		this._totalLines = this.lines.length;
	}

	/**
	 * Sets the baseline from the editor's own lineCache.
	 * Useful for "re-baseline on save": after a file is saved we treat the
	 * current content as the new clean state.
	 */
	setFromLineCache(lineCache: Map<number, string>, totalLines: number, filePath = ''): void {
		this._filePath = filePath;
		this.lines = new Array(totalLines);
		for (let i = 0; i < totalLines; i++) {
			this.lines[i] = lineCache.get(i) ?? '';
		}
		this._totalLines = totalLines;
	}

	// ── Accessors ─────────────────────────────────────────────────────────────

	/** Returns the full baseline as a dense string array (cheap — no copy). */
	getLines(): string[] {
		return this.lines;
	}

	/** Returns the line at index `i`, or '' if out of range. */
	getLine(i: number): string {
		return this.lines[i] ?? '';
	}

	get totalLines(): number {
		return this._totalLines;
	}

	get filePath(): string {
		return this._filePath;
	}

	/** True if the baseline has been initialised. */
	get isReady(): boolean {
		return this._totalLines > 0;
	}

	/** Clears the baseline (e.g. when the buffer is closed). */
	clear(): void {
		this.lines        = [];
		this._totalLines  = 0;
		this._filePath    = '';
	}
}
