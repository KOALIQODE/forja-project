/**
 * WrapLayout — maps logical lines ↔ visual rows for soft word wrap.
 *
 * A "logical line" is one line in the document (terminated by \n).
 * A "visual row" is one rendered row on screen; long logical lines
 * produce multiple visual rows.
 */
export class WrapLayout {
	private starts: number[] = [];
	private counts: number[] = [];
	private _totalLines = 0;
	charsPerRow = 80;
	totalVisualRows = 0;

	/**
	 * Recompute the layout for the entire document.
	 *
	 * @param totalLines   Number of logical lines.
	 * @param getLine      Returns the text of logical line i (undefined if not loaded).
	 * @param charWidth    Pixel width of one monospace character.
	 * @param contentWidth Pixel width available for text (canvas width minus gutter).
	 */
	compute(
		totalLines: number,
		getLine: (i: number) => string | undefined,
		charWidth: number,
		contentWidth: number
	): void {
		this.charsPerRow = Math.max(1, Math.floor(contentWidth / charWidth));
		this._totalLines = totalLines;
		this.starts = new Array(totalLines);
		this.counts = new Array(totalLines);
		let vRow = 0;
		for (let i = 0; i < totalLines; i++) {
			this.starts[i] = vRow;
			const len = getLine(i)?.length ?? 0;
			// +1 so the cursor can sit past the last character
			const count = Math.max(1, Math.ceil((len + 1) / this.charsPerRow));
			this.counts[i] = count;
			vRow += count;
		}
		this.totalVisualRows = vRow;
	}

	/** First visual row of a given logical line. */
	logicalToVisualRow(logicalLine: number): number {
		return this.starts[logicalLine] ?? 0;
	}

	/** Number of visual rows occupied by a logical line. */
	visualRowCount(logicalLine: number): number {
		return this.counts[logicalLine] ?? 1;
	}

	/**
	 * Visual row → { line: logicalLine, subRow: index within that logical line }.
	 * Uses binary search over the starts[] array.
	 */
	visualToLogical(visualRow: number): { line: number; subRow: number } {
		if (this._totalLines === 0) return { line: 0, subRow: 0 };
		let lo = 0;
		let hi = this._totalLines - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (this.starts[mid] <= visualRow) lo = mid;
			else hi = mid - 1;
		}
		return { line: lo, subRow: visualRow - this.starts[lo] };
	}

	/**
	 * Visual row that contains a given (logicalLine, charInLine) position.
	 * Useful for computing where the cursor should appear on screen.
	 */
	visualRowOfChar(logicalLine: number, charInLine: number): number {
		if (this.charsPerRow <= 0) return this.starts[logicalLine] ?? 0;
		return (this.starts[logicalLine] ?? 0) + Math.floor(charInLine / this.charsPerRow);
	}

	/** X offset (in character units) of a char within its visual row. */
	charOffsetInRow(charInLine: number): number {
		return charInLine % this.charsPerRow;
	}
}
