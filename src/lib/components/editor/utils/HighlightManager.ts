import { invoke } from '@tauri-apps/api/core';

import { ChunkRenderer } from './ChunkRenderer';
import { EDITOR_CONFIG } from '$lib/utils/shared/constants';
import { DiffScheduler } from './diff';
import { DocumentBridge } from './documentBridge';
import type { Token, SyntaxHighlight } from '$lib/components/editor/types';

const { CHUNK_SIZE } = EDITOR_CONFIG;
const HIGHLIGHT_DEBOUNCE_MS = 180;

export interface HighlightManagerDeps {
    getLanguage: () => string;
    getFilePath: () => string;
    getLineCache: () => Map<number, string>;
    getTotalLines: () => number;
    getScrollContainer: () => HTMLElement | null;
    getCurrentScrollTop: () => number;
    getEditorLineHeight: () => number;
    chunkRenderer: ChunkRenderer;
    docBridge: DocumentBridge;
    diffScheduler: DiffScheduler;
    onQueueRedraw: () => void;
    onLineCacheChanged: () => void;
    onSetWrapLayoutDirty: (v: boolean) => void;
}

export class HighlightManager {
    public highlightEnabled = false;
    public tokenCache: Map<number, Token[]> = new Map();
    public loadedChunks: Set<number> = new Set();
    public pendingChunks: Set<number> = new Set();

    private highlightDebounceId: ReturnType<typeof setTimeout> | null = null;
    private highlightPendingChunk = -1;

    constructor(private readonly deps: HighlightManagerDeps) {}

    public cancelPendingDebounce(): void {
        if (this.highlightDebounceId !== null) {
            clearTimeout(this.highlightDebounceId);
            this.highlightDebounceId = null;
        }
        this.highlightPendingChunk = -1;
    }

    public reset(): void {
        this.cancelPendingDebounce();
        this.tokenCache.clear();
        this.loadedChunks.clear();
        this.pendingChunks.clear();
        this.highlightEnabled = false;
    }

    public getChunkBounds(chunkId: number): { start: number; end: number } {
        const start = chunkId * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE - 1, this.deps.getTotalLines() - 1);
        return { start, end };
    }

    public getCachedLinesForChunk(chunkId: number): string[] | null {
        const { start, end } = this.getChunkBounds(chunkId);
        const lineCache = this.deps.getLineCache();
        const lines: string[] = [];
        for (let i = start; i <= end; i++) {
            const line = lineCache.get(i);
            if (line === undefined) return null;
            lines.push(line);
        }
        return lines;
    }

    public scheduleHighlightRefresh(chunkId: number): void {
        this.highlightPendingChunk = chunkId;
        if (this.highlightDebounceId !== null) clearTimeout(this.highlightDebounceId);
        this.highlightDebounceId = setTimeout(() => {
            this.highlightDebounceId = null;
            void this.refreshHighlightsAfterEdit(this.highlightPendingChunk);
            this.highlightPendingChunk = -1;
        }, HIGHLIGHT_DEBOUNCE_MS);
    }

    public async refreshHighlightsAfterEdit(chunkId: number): Promise<void> {
        this.deps.chunkRenderer.markDirty(chunkId);
        if (this.deps.docBridge.isOpen()) {
            const bridgeProducedTokens = await this.highlightViewportViaDocBridge();
            if (!bridgeProducedTokens && this.highlightEnabled) {
                const lines = this.getCachedLinesForChunk(chunkId);
                if (lines) await this.highlightChunk(lines, chunkId * CHUNK_SIZE);
            }
        } else if (this.highlightEnabled) {
            const lines = this.getCachedLinesForChunk(chunkId);
            if (lines) await this.highlightChunk(lines, chunkId * CHUNK_SIZE);
        }
        this.deps.onQueueRedraw();
    }

    public async fetchChunk(lineIdx: number): Promise<void> {
        const chunkId = Math.floor(lineIdx / CHUNK_SIZE);
        if (this.loadedChunks.has(chunkId) || this.pendingChunks.has(chunkId)) return;

        this.pendingChunks.add(chunkId);
        const { start, end } = this.getChunkBounds(chunkId);
        const filePath = this.deps.getFilePath();
        const lineCache = this.deps.getLineCache();

        try {
            const fetched = await invoke<string[]>('read_file_lines', {
                path: filePath,
                startLine: start,
                endLine: end,
            });
            let changedLineCache = false;
            fetched.forEach((line, idx) => {
                const lineNum = start + idx;
                if (!lineCache.has(lineNum)) {
                    lineCache.set(lineNum, line);
                    changedLineCache = true;
                }
            });
            if (changedLineCache) this.deps.onLineCacheChanged();
            if (this.highlightEnabled) {
                const ok = await this.highlightChunk(fetched, start);
                if (!ok) {
                    this.highlightEnabled = false;
                    this.tokenCache.clear();
                }
            }
            this.loadedChunks.add(chunkId);
            this.deps.onSetWrapLayoutDirty(true);
            this.deps.chunkRenderer.markDirty(chunkId);
            this.deps.diffScheduler.updateCurrentContent(lineCache, this.deps.getTotalLines());
            this.deps.onQueueRedraw();
        } catch (e) {
            console.error('Chunk Fetch Error:', e);
        } finally {
            this.pendingChunks.delete(chunkId);
        }
    }

    public async highlightChunk(lines: string[], start: number): Promise<boolean> {
        try {
            const result = await invoke<SyntaxHighlight>('highlight_syntax', {
                content: lines.join('\n'),
                language: this.deps.getLanguage(),
            });
            if (!result || !Array.isArray(result.tokens) || result.used_fallback) {
                console.warn('Invalid syntax highlight response');
                return false;
            }
            let lineIdx = start;
            let currentTokens: Token[] = [];
            for (const token of result.tokens) {
                if (!token || typeof token.text !== 'string') continue;
                const parts = token.text.split('\n');
                for (let i = 0; i < parts.length; i++) {
                    currentTokens.push({ text: parts[i], token_type: token.token_type || 'Unknown' });
                    if (i < parts.length - 1) {
                        this.tokenCache.set(lineIdx, currentTokens);
                        currentTokens = [];
                        lineIdx++;
                    }
                }
            }
            if (currentTokens.length > 0) this.tokenCache.set(lineIdx, currentTokens);
            return true;
        } catch (e) {
            console.warn('Highlight failed, fallback to plain text:', e);
            return false;
        }
    }

    public async highlightViewportViaDocBridge(): Promise<boolean> {
        const scrollContainer = this.deps.getScrollContainer();
        if (!this.deps.docBridge.isOpen() || !scrollContainer) return false;

        const editorLineHeight = this.deps.getEditorLineHeight();
        const totalLines = this.deps.getTotalLines();
        const startLine = Math.floor(this.deps.getCurrentScrollTop() / editorLineHeight);
        const endLine = Math.min(
            startLine + Math.ceil(scrollContainer.clientHeight / editorLineHeight) + 2,
            totalLines - 1,
        );
        const lineTokens = await this.deps.docBridge.getTokensForRange(
            startLine,
            endLine,
            this.deps.getLineCache(),
        );
        if (!lineTokens) return false;

        for (let i = startLine; i <= endLine; i++) {
            const tokens = lineTokens.get(i);
            if (tokens !== undefined) {
                this.tokenCache.set(i, tokens);
                this.deps.chunkRenderer.markDirty(Math.floor(i / CHUNK_SIZE));
            } else {
                this.tokenCache.delete(i);
            }
        }
        return lineTokens.size > 0;
    }

    public async rehighlightLoadedChunks(): Promise<boolean> {
        this.tokenCache.clear();
        for (const chunkId of [...this.loadedChunks].sort((a, b) => a - b)) {
            const lines = this.getCachedLinesForChunk(chunkId);
            if (!lines) continue;
            const ok = await this.highlightChunk(lines, chunkId * CHUNK_SIZE);
            if (!ok) {
                this.highlightEnabled = false;
                this.tokenCache.clear();
                this.deps.onQueueRedraw();
                return false;
            }
        }
        this.deps.onQueueRedraw();
        return true;
    }

    public async refreshHighlightAvailability(): Promise<boolean> {
        const language = this.deps.getLanguage();
        if (!language || language === 'unknown') {
            this.highlightEnabled = false;
            this.tokenCache.clear();
            this.deps.onQueueRedraw();
            return false;
        }

        try {
            const isNative = await invoke<boolean>('is_native_language', { language });
            if (isNative) {
                this.highlightEnabled = true;
                return this.rehighlightLoadedChunks();
            }
            const probe = await invoke<SyntaxHighlight>('highlight_syntax', {
                content: 'x',
                language,
            });
            if (!probe || !Array.isArray(probe.tokens) || probe.used_fallback) {
                this.highlightEnabled = false;
                this.tokenCache.clear();
                this.deps.onQueueRedraw();
                return false;
            }
            this.highlightEnabled = true;
            return this.rehighlightLoadedChunks();
        } catch (e) {
            console.warn('Highlight probe failed:', e);
            this.highlightEnabled = false;
            this.tokenCache.clear();
            this.deps.onQueueRedraw();
            return false;
        }
    }
}
