/**
 * diff/DiffRenderInvalidationManager.ts — Phase 2
 *
 * Maps a fresh LineDiffResult onto the set of chunk IDs that need repainting,
 * then drives partial invalidation on ChunkRenderer.
 *
 * Performance: O(changed lines) — only touches chunks that contain at least
 * one added, modified, or deleted-marker line.
 */

import type { LineDiffResult } from './types';
import type { ChunkRenderer }  from '../ChunkRenderer';

export class DiffRenderInvalidationManager {
	private readonly chunkSize: number;
	/** Previously dirty chunk IDs (for diffing which chunks changed). */
	private prevDirtyChunks = new Set<number>();

	constructor(chunkSize: number) {
		this.chunkSize = chunkSize;
	}

	/**
	 * Applies a diff result to a ChunkRenderer, marking only the affected
	 * chunks as dirty.
	 *
	 * @returns The set of chunk IDs that were invalidated this cycle.
	 */
	applyDiff(
		result:   LineDiffResult,
		renderer: ChunkRenderer
	): Set<number> {
		const dirtyChunks = new Set<number>();

		// Lines changed in new file
		for (const line of result.diffMap.keys()) {
			dirtyChunks.add(Math.floor(line / this.chunkSize));
		}

		// Deleted-block markers anchor to the line *after* which they appear
		for (const block of result.deletedBlocks) {
			const anchorLine = Math.max(0, block.afterLine);
			dirtyChunks.add(Math.floor(anchorLine / this.chunkSize));
		}

		// Any chunk that was dirty last cycle but is now clean also needs a repaint
		// (to erase the old decoration)
		for (const id of this.prevDirtyChunks) {
			if (!dirtyChunks.has(id)) {
				dirtyChunks.add(id);
			}
		}

		// Mark dirty in the renderer
		for (const id of dirtyChunks) {
			renderer.markDirty(id);
		}

		this.prevDirtyChunks = new Set(dirtyChunks);
		return dirtyChunks;
	}

	/**
	 * Forces all chunks to repaint — call when the theme or baseline changes.
	 */
	invalidateAll(renderer: ChunkRenderer): void {
		renderer.invalidateAll();
		this.prevDirtyChunks.clear();
	}

	/**
	 * Returns the chunk ID for a given line number.
	 * Convenience method for callers that need to know which chunk a line is in.
	 */
	chunkOf(line: number): number {
		return Math.floor(line / this.chunkSize);
	}
}
