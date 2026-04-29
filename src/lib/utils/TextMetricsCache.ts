/**
 * Phase 5 — Text Metrics Cache
 *
 * Eliminates redundant ctx.measureText() calls which are expensive when
 * called thousands of times per frame.
 *
 * Optimisation for monospace editors:
 *   Every glyph has the same advance width → measure 'M' once per font,
 *   then multiply by character count instead of measuring whole strings.
 *
 * For non-monospace measurements (e.g. blame text, UI labels) a bounded
 * LRU cache stores (font + text) → width.
 */

const LRU_MAX = 1_024;

export class TextMetricsCache {
	/** monospace char width keyed by font string */
	private monoWidths = new Map<string, number>();

	/** generic LRU cache: "font\x00text" → measured width */
	private cache = new Map<string, number>();
	private lru: string[] = [];

	// ── Monospace fast-path ──────────────────────────────────────────────────────

	/**
	 * Returns the width of a single character in a monospace font.
	 * Result is memoised for the lifetime of the cache instance.
	 */
	getCharWidth(
		ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
		font: string
	): number {
		let w = this.monoWidths.get(font);
		if (w !== undefined) return w;
		const prev = ctx.font;
		ctx.font = font;
		w = ctx.measureText('M').width;
		ctx.font = prev;
		this.monoWidths.set(font, w);
		return w;
	}

	/**
	 * Width of `text` in a monospace font: charWidth × length.
	 * Only accurate when every glyph in the font shares the same advance width.
	 */
	monoWidth(
		ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
		text: string,
		font: string
	): number {
		return this.getCharWidth(ctx, font) * text.length;
	}

	// ── Generic LRU measurement ──────────────────────────────────────────────────

	/**
	 * Measures arbitrary text, caching the result with LRU eviction.
	 * Use this for proportional / UI text where char-width assumption fails.
	 */
	measure(
		ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
		text: string,
		font: string
	): number {
		if (!text) return 0;
		const key = `${font}\x00${text}`;
		const cached = this.cache.get(key);
		if (cached !== undefined) {
			this.touchLRU(key);
			return cached;
		}
		const prev = ctx.font;
		ctx.font = font;
		const w = ctx.measureText(text).width;
		ctx.font = prev;
		this.setLRU(key, w);
		return w;
	}

	/**
	 * Invalidate monospace measurements (call when font family / size changes).
	 */
	invalidateMono(): void {
		this.monoWidths.clear();
	}

	/**
	 * Full reset (font family / size change).
	 */
	invalidateAll(): void {
		this.monoWidths.clear();
		this.cache.clear();
		this.lru = [];
	}

	// ── LRU internals ────────────────────────────────────────────────────────────

	private setLRU(key: string, value: number): void {
		if (this.cache.size >= LRU_MAX) {
			const oldest = this.lru.shift()!;
			this.cache.delete(oldest);
		}
		this.cache.set(key, value);
		this.lru.push(key);
	}

	private touchLRU(key: string): void {
		const idx = this.lru.indexOf(key);
		if (idx > -1) {
			this.lru.splice(idx, 1);
			this.lru.push(key);
		}
	}
}
