/**
 * Phase 4 — Chunk Rendering
 *
 * Maintains a pool of OffscreenCanvas objects, one per chunk (500 lines).
 * Only text content is cached here — cursor, selection and active-line
 * overlays are drawn on the main canvas after blitting.
 *
 * Lifecycle:
 *   1. `markDirty(chunkId)` when lines / tokens change for that chunk.
 *   2. `renderChunk(…)` re-draws the dirty OffscreenCanvas from lineCache + tokenCache.
 *   3. `blit(mainCtx, …)` copies the visible slice of the chunk onto the main canvas.
 */

export interface ChunkRenderConfig {
	lineHeight: number;
	fontSize: number;
	fontFamily: string;
	contentStartX: number;
	canvasWidth: number;
	tokenColors: Record<string, string>;
}

export interface Token {
	text: string;
	token_type: string;
}

interface CachedChunk {
	canvas: OffscreenCanvas;
	dirty: boolean;
}

export class ChunkRenderer {
	private chunks = new Map<number, CachedChunk>();
	private readonly chunkSize: number;

	constructor(chunkSize: number) {
		this.chunkSize = chunkSize;
	}

	// ── Public API ──────────────────────────────────────────────────────────────

	isDirty(chunkId: number): boolean {
		return this.chunks.get(chunkId)?.dirty ?? true;
	}

	markDirty(chunkId: number): void {
		const c = this.chunks.get(chunkId);
		if (c) c.dirty = true;
	}

	invalidateAll(): void {
		for (const c of this.chunks.values()) c.dirty = true;
	}

	clear(): void {
		this.chunks.clear();
	}

	/**
	 * Re-renders a chunk's OffscreenCanvas when dirty.
	 * Must be called before `blit` if `isDirty` returns true.
	 */
	renderChunk(
		chunkId: number,
		config: ChunkRenderConfig,
		getLine: (i: number) => string | undefined,
		getTokens: (i: number) => Token[] | undefined,
		totalLines: number
	): void {
		const chunk = this.getOrCreate(chunkId, config);
		const ctx = chunk.canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;

		const startLine = chunkId * this.chunkSize;
		const endLine = Math.min(startLine + this.chunkSize, totalLines);
		const { lineHeight, fontSize, fontFamily, contentStartX, tokenColors } = config;

		// Clear chunk canvas
		ctx.clearRect(0, 0, chunk.canvas.width, chunk.canvas.height);

		ctx.font = `${fontSize}px ${fontFamily}`;
		ctx.textBaseline = 'middle';

		for (let i = startLine; i < endLine; i++) {
			const localY = (i - startLine) * lineHeight + lineHeight / 2;
			const line = getLine(i);

			if (line === undefined) {
				// Loading placeholder
				ctx.fillStyle = '#1a1a1a';
				ctx.fillRect(contentStartX, localY - 2, 80, 4);
				continue;
			}

			const tokens = getTokens(i);
			if (tokens && tokens.length > 0) {
				let x = contentStartX;
				for (const token of tokens) {
					if (!token.text) continue;
					ctx.fillStyle = tokenColors[token.token_type] ?? tokenColors['Unknown'] ?? '#d4d4d4';
					ctx.fillText(token.text, x, localY);
					x += ctx.measureText(token.text).width;
				}
			} else {
				ctx.fillStyle = '#cccccc';
				ctx.fillText(line, contentStartX, localY);
			}
		}

		chunk.dirty = false;
	}

	/**
	 * Copies the visible portion of a chunk onto the main canvas.
	 *
	 * @param mainCtx    The main canvas 2D context.
	 * @param chunkId    Which chunk to blit.
	 * @param startLine  First line visible on screen (global line index).
	 * @param endLine    Last line visible on screen (exclusive, global).
	 * @param yStart     Y pixel on the main canvas where the visible area begins.
	 * @param lineHeight Pixel height of one line.
	 */
	blit(
		mainCtx: CanvasRenderingContext2D,
		chunkId: number,
		startLine: number,
		endLine: number,
		yStart: number,
		lineHeight: number
	): void {
		const chunk = this.chunks.get(chunkId);
		if (!chunk) return;

		const chunkFirstLine = chunkId * this.chunkSize;

		// Clamp to this chunk's actual line range
		const srcFirstLine = Math.max(startLine, chunkFirstLine);
		const srcLastLine = Math.min(endLine, chunkFirstLine + this.chunkSize);
		if (srcFirstLine >= srcLastLine) return;

		const srcY = (srcFirstLine - chunkFirstLine) * lineHeight;
		const srcH = (srcLastLine - srcFirstLine) * lineHeight;
		const dstY = yStart + (srcFirstLine - startLine) * lineHeight;

		mainCtx.drawImage(
			chunk.canvas,
			0, srcY, chunk.canvas.width, srcH,
			0, dstY, chunk.canvas.width, srcH
		);
	}

	// ── Private helpers ──────────────────────────────────────────────────────────

	private getOrCreate(chunkId: number, config: ChunkRenderConfig): CachedChunk {
		if (!this.chunks.has(chunkId)) {
			const canvas = new OffscreenCanvas(
				config.canvasWidth,
				this.chunkSize * config.lineHeight
			);
			this.chunks.set(chunkId, { canvas, dirty: true });
		}
		return this.chunks.get(chunkId)!;
	}
}
