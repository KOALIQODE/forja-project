import type { Diagnostic } from "$lib/stores/diagnosticsStore";
import type { VimMode } from "$lib/stores/editorStore";
import { EDITOR_CONFIG, TOKEN_COLORS } from "$lib/utils/constants";
import type { ChunkRenderer } from "$lib/utils/ChunkRenderer";
import { DIFF_COLORS, type ViewportDiffCache } from "$lib/utils/diff";
import type { TextMetricsCache } from "$lib/utils/TextMetricsCache";
import type { WrapLayout } from "$lib/utils/WrapLayout";
import type { untrack } from "svelte";

import type { CursorPosition, Token } from "./types";

const { CHUNK_SIZE } = EDITOR_CONFIG;

interface BlameLine {
    author: string;
    date: string;
    commit_id: string;
    summary: string;
}

export interface DrawState {
    canvas: HTMLCanvasElement;
    scrollContainer: HTMLElement;
    needsRedraw: boolean;
    lastFrameDuration: number;
    currentScrollTop: number;
    softWrapEnabled: boolean;
    lineCache: Map<number, string>;
    totalLines: number;
    cursorLine: number;
    cursorChar: number;
    vimMode: VimMode;
    vimModeEnabled: boolean;
    mouseLine: number | null;
    highlightActiveLine: boolean;
    showLineNumbers: boolean;
    cursorVisible: boolean;
    highlightEnabled: boolean;
    lastWrapCharWidth: number;
    lastWrapContentWidth: number;
    wrapLayoutDirty: boolean;
    visualRowCount: number;
    metricsCache: TextMetricsCache;
    wrapLayout: WrapLayout;
    chunkRenderer: ChunkRenderer;
    viewportDiffCache: ViewportDiffCache;
    diagByLine: Map<number, Diagnostic>;
    editorFont: string;
    editorFontSize: number;
    editorFontFamily: string;
    editorLineHeight: number;
    gutterWidth: number;
    lineNumberX: number;
    contentStartX: number;
    currentTokenColors: typeof TOKEN_COLORS;
    editorBgColor: string;
    editorFgColor: string;
    editorCursorColor: string;
    editorActiveLineColor: string;
    editorSelectionColor: string;
    editorLineNumberColor: string;
    editorLineNumberActiveColor: string;
    getLine: (line: number) => string;
    getVisualRange: () => [CursorPosition, CursorPosition] | null;
    untrack: typeof untrack;
    tokenCache: Map<number, Token[]>;
    bracketColors: Array<{ start: number; finish: number; color: string }>;
    blameCache: BlameLine[];
    scheduleNextFrame: () => void;
}

export interface DrawMutations {
    setNeedsRedraw: (value: boolean) => void;
    setVisualRowCount: (value: number) => void;
    setLastWrapCharWidth: (value: number) => void;
    setLastWrapContentWidth: (value: number) => void;
    setWrapLayoutDirty: (value: boolean) => void;
    setLastFrameDuration: (value: number) => void;
}

export function renderEditorFrame(state: DrawState, mutations: DrawMutations): void {
    const {
        canvas,
        needsRedraw,
        lastFrameDuration,
        currentScrollTop,
        softWrapEnabled,
        lineCache,
        totalLines,
        cursorLine,
        cursorChar,
        vimMode,
        vimModeEnabled,
        mouseLine,
        highlightActiveLine,
        showLineNumbers,
        cursorVisible,
        highlightEnabled,
        lastWrapCharWidth,
        lastWrapContentWidth,
        wrapLayoutDirty,
        metricsCache,
        wrapLayout,
        chunkRenderer,
        viewportDiffCache,
        diagByLine,
        editorFont,
        editorFontSize,
        editorFontFamily,
        editorLineHeight,
        gutterWidth,
        lineNumberX,
        contentStartX,
        currentTokenColors,
        editorBgColor,
        editorFgColor,
        editorCursorColor,
        editorActiveLineColor,
        editorSelectionColor,
        editorLineNumberColor,
        editorLineNumberActiveColor,
        getLine,
        getVisualRange,
        untrack,
        tokenCache,
        bracketColors,
        blameCache,
        scheduleNextFrame,
    } = state;

        const frameStart = performance.now();
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();

        if (rect.width === 0 || rect.height === 0) {
            scheduleNextFrame();
            return;
        }

        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) return;

        // Resize only when dimensions actually changed
        const targetW = Math.floor(rect.width * dpr);
        const targetH = Math.floor(rect.height * dpr);
        if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
            // Phase 4: canvas resized → cached OffscreenCanvases are wrong size
            chunkRenderer.clear();
        }

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        if (!needsRedraw) {
            scheduleNextFrame();
            return;
        }

        mutations.setNeedsRedraw(false);

        // ── Phase 7: frame budget ────────────────────────────────────────────────
        // If the last frame took too long, skip expensive chunk re-renders
        // (overlays like cursor blink still draw at full speed).
        const overBudget = lastFrameDuration > 14; // > 14ms ≈ below 60fps

        const scrollPos = untrack(() => currentScrollTop);

        // ── Soft wrap: recompute layout when stale ───────────────────────────────
        if (softWrapEnabled) {
            const charWidth = metricsCache.getCharWidth(ctx, editorFont);
            const contentWidth = rect.width - contentStartX - 8;
            if (charWidth !== lastWrapCharWidth || contentWidth !== lastWrapContentWidth || wrapLayoutDirty) {
                wrapLayout.compute(totalLines, (i) => lineCache.get(i), charWidth, contentWidth);
                mutations.setLastWrapCharWidth(charWidth);
                mutations.setLastWrapContentWidth(contentWidth);
                mutations.setWrapLayoutDirty(false);
                mutations.setVisualRowCount(wrapLayout.totalVisualRows);
            }
        }

        let startLine: number;
        let endLine: number;
        let startVisualRow: number;
        if (softWrapEnabled && wrapLayout.totalVisualRows > 0) {
            startVisualRow = Math.floor(scrollPos / editorLineHeight);
            const endVisualRow = startVisualRow + Math.ceil(rect.height / editorLineHeight) + 1;
            const { line: swStartLogical } = wrapLayout.visualToLogical(startVisualRow);
            const { line: swEndLogical } = wrapLayout.visualToLogical(
                Math.min(endVisualRow, wrapLayout.totalVisualRows - 1)
            );
            startLine = swStartLogical;
            endLine = Math.min(swEndLogical + 1, totalLines);
        } else {
            startLine = Math.floor(scrollPos / editorLineHeight);
            endLine = Math.min(
                startLine + Math.ceil(rect.height / editorLineHeight) + 1,
                totalLines,
            );
            startVisualRow = startLine;
        }
        const yOffset = -(scrollPos % editorLineHeight);
        // Y pixel where startLine begins on the canvas
        const yStart = yOffset;

        // ── Background ──────────────────────────────────────────────────────────
        ctx.fillStyle = editorBgColor;
        ctx.fillRect(0, 0, rect.width, rect.height);

        // ── Pass 1: line backgrounds (active line, hover, selection) ────────────
        const visualBounds = vimMode === "visual" ? getVisualRange() : null;

        ctx.font = editorFont;
        ctx.textBaseline = "middle";

        for (let i = startLine; i < endLine; i++) {
            if (softWrapEnabled) {
                const firstVRow = wrapLayout.logicalToVisualRow(i);
                const vCount = wrapLayout.visualRowCount(i);
                for (let s = 0; s < vCount; s++) {
                    const vRow = firstVRow + s;
                    const y = (vRow - startVisualRow) * editorLineHeight + yOffset + editorLineHeight / 2;
                    if (y + editorLineHeight / 2 < 0 || y - editorLineHeight / 2 > rect.height) continue;

                    if (highlightActiveLine && i === cursorLine) {
                        ctx.fillStyle = editorActiveLineColor;
                        ctx.fillRect(0, y - editorLineHeight / 2, rect.width, editorLineHeight);
                    }

                    if (i === mouseLine) {
                        ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
                        ctx.fillRect(0, y - editorLineHeight / 2, rect.width, editorLineHeight);
                    }

                    if (visualBounds) {
                        const [selectionStart, selectionEnd] = visualBounds;
                        if (i >= selectionStart.line && i <= selectionEnd.line) {
                            ctx.fillStyle = editorSelectionColor;
                            ctx.fillRect(contentStartX, y - editorLineHeight / 2 + 2, rect.width - contentStartX, editorLineHeight - 4);
                        }
                    }

                    const _dBg = diagByLine.get(i);
                    if (_dBg) {
                        if (_dBg.severity === 'error') {
                            ctx.fillStyle = "rgba(239, 68, 68, 0.07)";
                        } else if (_dBg.severity === 'warning') {
                            ctx.fillStyle = "rgba(245, 158, 11, 0.05)";
                        } else {
                            ctx.fillStyle = "rgba(96, 165, 250, 0.05)";
                        }
                        ctx.fillRect(gutterWidth, y - editorLineHeight / 2, rect.width - gutterWidth, editorLineHeight);
                    }
                }
            } else {
                const y = (i - startLine) * editorLineHeight + yOffset + editorLineHeight / 2;

                if (highlightActiveLine && i === cursorLine) {
                    ctx.fillStyle = editorActiveLineColor;
                    ctx.fillRect(0, y - editorLineHeight / 2, rect.width, editorLineHeight);
                }

                if (i === mouseLine) {
                    ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
                    ctx.fillRect(0, y - editorLineHeight / 2, rect.width, editorLineHeight);
                }

                if (visualBounds) {
                    const [selectionStart, selectionEnd] = visualBounds;
                    if (i >= selectionStart.line && i <= selectionEnd.line) {
                        const line = getLine(i);
                        const sc = i === selectionStart.line ? selectionStart.char : 0;
                        const ec = i === selectionEnd.line ? selectionEnd.char : line.length;
                        // Phase 5: use metrics cache for selection bounds
                        const highlightStart = contentStartX + metricsCache.measure(ctx, line.slice(0, sc), editorFont);
                        const highlightEnd = contentStartX + metricsCache.measure(ctx, line.slice(0, Math.max(ec, sc)), editorFont);
                        ctx.fillStyle = editorSelectionColor;
                        ctx.fillRect(
                            highlightStart,
                            y - editorLineHeight / 2 + 2,
                            Math.max(highlightEnd - highlightStart, 4),
                            editorLineHeight - 4,
                        );
                    }
                }

                // Diff: 3px gutter bar on the left edge for added / modified lines
                // NOTE: drawn in Pass 1 as background; redrawn in Pass 3 to stay on top of blit

                // Error Lens: subtle full-line background tint
                const _dBg = diagByLine.get(i);
                if (_dBg) {
                    if (_dBg.severity === 'error') {
                        ctx.fillStyle = "rgba(239, 68, 68, 0.07)";
                    } else if (_dBg.severity === 'warning') {
                        ctx.fillStyle = "rgba(245, 158, 11, 0.05)";
                    } else {
                        ctx.fillStyle = "rgba(96, 165, 250, 0.05)";
                    }
                    ctx.fillRect(gutterWidth, y - editorLineHeight / 2, rect.width - gutterWidth, editorLineHeight);
                }
            }
        }

        // Diff: thin deleted-block markers between gutter rows
        for (const marker of viewportDiffCache.getDeletedMarkersInViewport()) {
            const markerRow = marker.afterLine + 1 - startLine;
            if (markerRow < 0 || markerRow > endLine - startLine + 1) continue;
            const markerY = markerRow * editorLineHeight + yOffset - 2;
            ctx.fillStyle = DIFF_COLORS.deleted;
            ctx.fillRect(0, markerY, 4, 3);
        }

        // ── Pass 2: blit OffscreenCanvas text chunks (Phase 4) ─────────────────
        // Skipped when soft wrap is active — text is drawn directly in Pass 3.
        if (!softWrapEnabled) {
            const chunkConfig = {
                lineHeight: editorLineHeight,
                fontSize: editorFontSize,
                fontFamily: editorFontFamily,
                contentStartX,
                canvasWidth: rect.width,
                tokenColors: currentTokenColors,
            };

            // Determine which chunks intersect the visible range
            const firstChunkId = Math.floor(startLine / CHUNK_SIZE);
            const lastChunkId = Math.floor(Math.max(endLine - 1, startLine) / CHUNK_SIZE);

            for (let chunkId = firstChunkId; chunkId <= lastChunkId; chunkId++) {
                if (chunkRenderer.isDirty(chunkId)) {
                    chunkRenderer.renderChunk(
                        chunkId,
                        chunkConfig,
                        (i) => lineCache.get(i),
                        (i) => (highlightEnabled ? tokenCache.get(i) : undefined),
                        totalLines
                    );
                }
                chunkRenderer.blit(ctx, chunkId, startLine, endLine, yStart, editorLineHeight);
            }
        }

        // ── Pass 3: overlays — diff bars, line numbers, cursor, blame ─────────
        for (let i = startLine; i < endLine; i++) {
            if (softWrapEnabled) {
                // ── Soft-wrap path: render text + overlays per visual sub-row ──
                const line = lineCache.get(i);
                const charsPerRow = wrapLayout.charsPerRow;
                const firstVRow = wrapLayout.logicalToVisualRow(i);
                const vCount = wrapLayout.visualRowCount(i);
                const charWidth = metricsCache.getCharWidth(ctx, editorFont);
                const tokens = highlightEnabled ? tokenCache.get(i) : undefined;

                // Pre-compute cumulative char start for each token
                const tokenStarts: number[] = [];
                if (tokens) {
                    let off = 0;
                    for (const t of tokens) { tokenStarts.push(off); off += t.text.length; }
                }

                for (let s = 0; s < vCount; s++) {
                    const vRow = firstVRow + s;
                    const rowY = (vRow - startVisualRow) * editorLineHeight + yOffset + editorLineHeight / 2;
                    if (rowY + editorLineHeight / 2 < 0 || rowY - editorLineHeight / 2 > rect.height) continue;

                    // Diff: 4px gutter bar (only on first sub-row)
                    if (s === 0) {
                        const diffDeco = viewportDiffCache.getDecoration(i);
                        if (diffDeco) {
                            ctx.fillStyle = diffDeco.color;
                            ctx.fillRect(0, (vRow - startVisualRow) * editorLineHeight + yOffset, 4, editorLineHeight);
                        }
                    }

                    // Line number (only on first sub-row)
                    if (showLineNumbers) {
                        ctx.textAlign = "right";
                        if (s === 0) {
                            const isRelative = vimModeEnabled && vimMode !== "insert";
                            if (isRelative) {
                                if (i === cursorLine) {
                                    ctx.fillStyle = editorLineNumberActiveColor;
                                    ctx.fillText((i + 1).toString(), lineNumberX, rowY);
                                } else {
                                    ctx.fillStyle = editorLineNumberColor;
                                    ctx.fillText(Math.abs(i - cursorLine).toString(), lineNumberX, rowY);
                                }
                            } else {
                                ctx.fillStyle = i === cursorLine ? editorLineNumberActiveColor : editorLineNumberColor;
                                ctx.fillText((i + 1).toString(), lineNumberX, rowY);
                            }
                        }
                    }
                    ctx.textAlign = "left";

                    if (line === undefined) {
                        if (s === 0) {
                            ctx.fillStyle = '#1a1a1a';
                            ctx.fillRect(contentStartX, rowY - 2, 80, 4);
                        }
                        continue;
                    }

                    const sliceStart = s * charsPerRow;
                    const sliceEnd = Math.min((s + 1) * charsPerRow, line.length);

                    // Text rendering
                    if (tokens && tokens.length > 0) {
                        for (let ti = 0; ti < tokens.length; ti++) {
                            const token = tokens[ti];
                            const tokenStart = tokenStarts[ti];
                            const tokenEnd = tokenStart + token.text.length;
                            if (tokenEnd <= sliceStart || tokenStart >= sliceEnd) continue;
                            const clipStart = Math.max(tokenStart, sliceStart);
                            const clipEnd = Math.min(tokenEnd, sliceEnd);
                            const tokenText = token.text.slice(clipStart - tokenStart, clipEnd - tokenStart);
                            if (!tokenText) continue;
                            ctx.fillStyle = currentTokenColors[token.token_type] ?? currentTokenColors['Unknown'] ?? '#d4d4d4';
                            ctx.fillText(tokenText, contentStartX + (clipStart - sliceStart) * charWidth, rowY);
                        }
                    } else {
                        ctx.fillStyle = '#cccccc';
                        ctx.fillText(line.slice(sliceStart, sliceEnd), contentStartX, rowY);
                    }

                    // Cursor
                    if (i === cursorLine && cursorVisible) {
                        const cursorSubRow = Math.floor(cursorChar / charsPerRow);
                        if (cursorSubRow === s) {
                            const cx = contentStartX + (cursorChar % charsPerRow) * charWidth;
                            if (vimModeEnabled && vimMode !== "insert") {
                                const ch = line[cursorChar] || " ";
                                ctx.globalAlpha = 0.6;
                                ctx.fillStyle = editorCursorColor;
                                ctx.fillRect(cx, rowY - editorLineHeight / 2 + 2, charWidth, editorLineHeight - 4);
                                ctx.globalAlpha = 1.0;
                                ctx.fillStyle = editorFgColor;
                                ctx.fillText(ch, cx, rowY);
                            } else {
                                ctx.fillStyle = editorCursorColor;
                                ctx.fillRect(cx, rowY - editorLineHeight / 2 + 2, 2, editorLineHeight - 4);
                            }
                        }
                    }

                    // Git blame ghost text (only on first sub-row, cursor line)
                    if (s === 0 && i === cursorLine && blameCache[i]) {
                        const blame = blameCache[i];
                        const blameTokens = highlightEnabled ? tokenCache.get(i) : null;
                        let lineWidth = 0;
                        if (blameTokens) {
                            for (const t of blameTokens) lineWidth += metricsCache.measure(ctx, t.text, editorFont);
                        } else {
                            lineWidth = metricsCache.measure(ctx, line, editorFont);
                        }
                        const blameFont = `italic ${editorFontSize - 1}px ${editorFontFamily}`;
                        ctx.fillStyle = "rgba(120, 120, 120, 0.45)";
                        ctx.font = blameFont;
                        const blameText = blame.author
                            ? `  • ${blame.author}, ${blame.date} • ${blame.summary}`
                            : `  • ${blame.summary}`;
                        ctx.fillText(blameText, contentStartX + lineWidth + 20, rowY);
                        ctx.font = editorFont;
                    }

                    // Error Lens (only on first sub-row)
                    if (s === 0) {
                        const _diag = diagByLine.get(i);
                        if (_diag) {
                            const _dotColor = _diag.severity === 'error'
                                ? 'rgba(239, 68, 68, 0.85)'
                                : _diag.severity === 'warning'
                                ? 'rgba(245, 158, 11, 0.80)'
                                : 'rgba(96, 165, 250, 0.70)';
                            ctx.fillStyle = _dotColor;
                            ctx.beginPath();
                            ctx.arc(8, rowY, 2.5, 0, Math.PI * 2);
                            ctx.fill();

                            const _hasBlame = i === cursorLine && blameCache[i];
                            if (!_hasBlame) {
                                const _lTokens = highlightEnabled ? tokenCache.get(i) : null;
                                let _lw = 0;
                                if (_lTokens) {
                                    for (const t of _lTokens) _lw += metricsCache.measure(ctx, t.text, editorFont);
                                } else {
                                    _lw = metricsCache.measure(ctx, line, editorFont);
                                }
                                const _msgX = contentStartX + _lw + 32;
                                if (_msgX < rect.width - 40) {
                                    const _diagFont = `italic ${editorFontSize - 1}px ${editorFontFamily}`;
                                    ctx.font = _diagFont;
                                    if (_diag.severity === 'error') {
                                        ctx.fillStyle = "rgba(239, 68, 68, 0.60)";
                                    } else if (_diag.severity === 'warning') {
                                        ctx.fillStyle = "rgba(245, 158, 11, 0.60)";
                                    } else {
                                        ctx.fillStyle = "rgba(96, 165, 250, 0.55)";
                                    }
                                    const _prefix = _diag.severity === 'error' ? '⛔ '
                                        : _diag.severity === 'warning' ? '⚠ ' : '› ';
                                    const _raw = _diag.message.length > 80
                                        ? _diag.message.slice(0, 80) + '…'
                                        : _diag.message;
                                    ctx.fillText(_prefix + _raw, _msgX, rowY);
                                    ctx.font = editorFont;
                                }
                            }
                        }
                    }
                }
            } else {
                // ── Hard-wrap / no-wrap path (original) ──────────────────────────
                const y = (i - startLine) * editorLineHeight + yOffset + editorLineHeight / 2;

                // Diff: 4px gutter bar at left edge (drawn on top of chunk blit)
                const diffDeco = viewportDiffCache.getDecoration(i);
                if (diffDeco) {
                    ctx.fillStyle = diffDeco.color;
                    ctx.fillRect(0, (i - startLine) * editorLineHeight + yOffset, 4, editorLineHeight);
                }

                if (showLineNumbers) {
                    ctx.fillStyle = editorLineNumberColor;
                    ctx.textAlign = "right";
                    const isRelative = vimModeEnabled && vimMode !== "insert";
                    if (isRelative) {
                        if (i === cursorLine) {
                            ctx.fillStyle = editorLineNumberActiveColor;
                            ctx.fillText((i + 1).toString(), lineNumberX, y);
                        } else {
                            ctx.fillStyle = editorLineNumberColor;
                            ctx.fillText(Math.abs(i - cursorLine).toString(), lineNumberX, y);
                        }
                    } else {
                        ctx.fillStyle = i === cursorLine ? editorLineNumberActiveColor : editorLineNumberColor;
                        ctx.fillText((i + 1).toString(), lineNumberX, y);
                    }
                }

                ctx.textAlign = "left";
                const line = lineCache.get(i);
                if (line === undefined) continue;

                if (i === cursorLine && cursorVisible) {
                    // Phase 5: use metrics cache for cursor position
                    const cursorX = contentStartX + metricsCache.measure(ctx, line.substring(0, cursorChar), editorFont);

                    if (vimModeEnabled && vimMode !== "insert") {
                        const char = line[cursorChar] || " ";
                        const charWidth = metricsCache.measure(ctx, char, editorFont);
                        ctx.globalAlpha = 0.6;
                        ctx.fillStyle = editorCursorColor;
                        ctx.fillRect(cursorX, y - editorLineHeight / 2 + 2, charWidth, editorLineHeight - 4);
                        ctx.globalAlpha = 1.0;
                        ctx.fillStyle = editorFgColor;
                        ctx.fillText(char, cursorX, y);
                    } else {
                        ctx.fillStyle = editorCursorColor;
                        ctx.fillRect(cursorX, y - editorLineHeight / 2 + 2, 2, editorLineHeight - 4);
                    }
                }

                // Git blame ghost text on active line
                if (i === cursorLine && blameCache[i]) {
                    const blame = blameCache[i];
                    // Phase 5: estimate line content width for blame placement
                    const tokens = highlightEnabled ? tokenCache.get(i) : null;
                    let lineWidth = 0;
                    if (tokens) {
                        for (const t of tokens) lineWidth += metricsCache.measure(ctx, t.text, editorFont);
                    } else {
                        lineWidth = metricsCache.measure(ctx, line, editorFont);
                    }
                    const blameFont = `italic ${editorFontSize - 1}px ${editorFontFamily}`;
                    ctx.fillStyle = "rgba(120, 120, 120, 0.45)";
                    ctx.font = blameFont;
                    const blameText = blame.author
                        ? `  • ${blame.author}, ${blame.date} • ${blame.summary}`
                        : `  • ${blame.summary}`;
                    ctx.fillText(blameText, contentStartX + lineWidth + 20, y);
                    ctx.font = editorFont;
                }

                // ── Error Lens: gutter indicator dot + inline message ─────────────────
                const _diag = diagByLine.get(i);
                if (_diag) {
                    // Gutter dot (right edge of gutter, above the line number)
                    const _dotColor = _diag.severity === 'error'
                        ? 'rgba(239, 68, 68, 0.85)'
                        : _diag.severity === 'warning'
                        ? 'rgba(245, 158, 11, 0.80)'
                        : 'rgba(96, 165, 250, 0.70)';
                    ctx.fillStyle = _dotColor;
                    ctx.beginPath();
                    ctx.arc(8, y, 2.5, 0, Math.PI * 2);
                    ctx.fill();

                    // Inline message (skip cursor line when blame is visible to avoid overlap)
                    const _hasBlame = i === cursorLine && blameCache[i];
                    if (!_hasBlame) {
                        const _lTokens = highlightEnabled ? tokenCache.get(i) : null;
                        let _lw = 0;
                        if (_lTokens) {
                            for (const t of _lTokens) _lw += metricsCache.measure(ctx, t.text, editorFont);
                        } else {
                            _lw = metricsCache.measure(ctx, line, editorFont);
                        }
                        const _msgX = contentStartX + _lw + 32;
                        if (_msgX < rect.width - 40) {
                            const _diagFont = `italic ${editorFontSize - 1}px ${editorFontFamily}`;
                            ctx.font = _diagFont;
                            if (_diag.severity === 'error') {
                                ctx.fillStyle = "rgba(239, 68, 68, 0.60)";
                            } else if (_diag.severity === 'warning') {
                                ctx.fillStyle = "rgba(245, 158, 11, 0.60)";
                            } else {
                                ctx.fillStyle = "rgba(96, 165, 250, 0.55)";
                            }
                            const _prefix = _diag.severity === 'error' ? '⛔ '
                                : _diag.severity === 'warning' ? '⚠ ' : '› ';
                            const _raw = _diag.message.length > 80
                                ? _diag.message.slice(0, 80) + '…'
                                : _diag.message;
                            ctx.fillText(_prefix + _raw, _msgX, y);
                            ctx.font = editorFont;
                        }
                    }
                }
            }
        }

        // Phase 7: track frame duration for next budget check
        mutations.setLastFrameDuration(performance.now() - frameStart);

        // ── Pass 4: bracket pair colored characters ──────────────────────────────
        if (bracketColors.length > 0) {
            // Pre-compute cumulative char offsets for all lines (needed for offset→line lookup)
            const lineOffsets: number[] = [];
            let offset = 0;
            for (let l = 0; l < totalLines; l++) {
                lineOffsets.push(offset);
                offset += (lineCache.get(l) ?? "").length + 1; // +1 for \n
            }

            ctx.save();
            ctx.font = editorFont;
            ctx.textBaseline = "middle";

            const paintBracketChar = (charOffset: number, color: string) => {
                // Binary-search: find which line this offset belongs to
                let lo = 0, hi = lineOffsets.length - 1;
                while (lo < hi) {
                    const mid = (lo + hi + 1) >> 1;
                    if (lineOffsets[mid] <= charOffset) lo = mid; else hi = mid - 1;
                }
                const line = lo;
                if (line < startLine || line >= endLine) return; // outside viewport
                const col = charOffset - lineOffsets[line];
                const lineText = lineCache.get(line) ?? "";
                const ch = lineText[col];
                if (!ch) return;
                const x = contentStartX + metricsCache.measure(ctx, lineText.slice(0, col), editorFont);
                const charWidth = metricsCache.measure(ctx, ch, editorFont);
                const y = softWrapEnabled
                    ? (wrapLayout.visualRowOfChar(line, col) - startVisualRow) * editorLineHeight + yOffset + editorLineHeight / 2
                    : (line - startLine) * editorLineHeight + yOffset + editorLineHeight / 2;
                // Erase background for this character, then redraw in bracket color
                ctx.fillStyle = editorBgColor;
                ctx.fillRect(x, y - editorLineHeight / 2, charWidth, editorLineHeight);
                ctx.fillStyle = color;
                ctx.fillText(ch, x, y);
            };

            for (const { start, finish, color } of bracketColors) {
                paintBracketChar(start - 1, color);  // Lua is 1-based
                paintBracketChar(finish - 1, color);
            }

            ctx.restore();
        }

        // ── Pass 5: bracket match highlight (works with or without plugin) ──────
        {
            const OPEN  = new Set(['{', '(', '[']);
            const CLOSE = new Set(['}', ')', ']']);
            const PAIRS: Record<string, string> = {
                '{': '}', '(': ')', '[': ']',
                '}': '{', ')': '(', ']': '[',
            };

            const curLineText = lineCache.get(cursorLine) ?? "";
            const ch = curLineText[cursorChar];

            let matchLine = -1;
            let matchCol  = -1;

            if (ch && (OPEN.has(ch) || CLOSE.has(ch))) {
                const isOpen = OPEN.has(ch);
                let depth = 0;

                if (isOpen) {
                    scan_fwd:
                    for (let l = cursorLine; l < totalLines; l++) {
                        const text = lineCache.get(l) ?? "";
                        const c0 = l === cursorLine ? cursorChar : 0;
                        for (let c = c0; c < text.length; c++) {
                            const t = text[c];
                            if (t === ch)         depth++;
                            else if (t === PAIRS[ch]) { depth--; if (depth === 0) { matchLine = l; matchCol = c; break scan_fwd; } }
                        }
                    }
                } else {
                    scan_bwd:
                    for (let l = cursorLine; l >= 0; l--) {
                        const text = lineCache.get(l) ?? "";
                        const c0 = l === cursorLine ? cursorChar : text.length - 1;
                        for (let c = c0; c >= 0; c--) {
                            const t = text[c];
                            if (t === ch)         depth++;
                            else if (t === PAIRS[ch]) { depth--; if (depth === 0) { matchLine = l; matchCol = c; break scan_bwd; } }
                        }
                    }
                }
            }

            if (matchLine !== -1) {
                // Use the bracket-colorizer color for this pair when available
                let pairColor = editorCursorColor;
                if (bracketColors.length > 0) {
                    const lineOffsets2: number[] = [];
                    let off = 0;
                    for (let l = 0; l < totalLines; l++) {
                        lineOffsets2.push(off);
                        off += (lineCache.get(l) ?? "").length + 1;
                    }
                    const curOff = (lineOffsets2[cursorLine] ?? 0) + cursorChar + 1;
                    const matOff = (lineOffsets2[matchLine]  ?? 0) + matchCol  + 1;
                    const found  = bracketColors.find(
                        (b) => (b.start === curOff || b.finish === curOff) &&
                               (b.start === matOff  || b.finish === matOff)
                    );
                    if (found) pairColor = found.color;
                }

                ctx.save();
                ctx.font = editorFont;
                ctx.textBaseline = "middle";

                const drawBox = (bLine: number, bCol: number, isActive: boolean) => {
                    if (bLine < startLine || bLine >= endLine) return;
                    const text = lineCache.get(bLine) ?? "";
                    const bch  = text[bCol];
                    if (!bch) return;
                    const x  = contentStartX + metricsCache.measure(ctx, text.slice(0, bCol), editorFont);
                    const cw = metricsCache.measure(ctx, bch, editorFont);
                    const y  = softWrapEnabled
                        ? (wrapLayout.visualRowOfChar(bLine, bCol) - startVisualRow) * editorLineHeight + yOffset + editorLineHeight / 2
                        : (bLine - startLine) * editorLineHeight + yOffset + editorLineHeight / 2;
                    if (isActive) {
                        ctx.fillStyle = pairColor + "44";
                        ctx.fillRect(x, y - editorLineHeight / 2 + 2, cw, editorLineHeight - 4);
                        ctx.fillStyle = "#ffffff";
                        ctx.fillText(bch, x, y);
                    }
                    ctx.strokeStyle = pairColor;
                    ctx.lineWidth = 1.5;
                    ctx.strokeRect(x + 0.5, y - editorLineHeight / 2 + 2.5, cw - 1, editorLineHeight - 5);
                };

                drawBox(cursorLine, cursorChar, true);
                drawBox(matchLine,  matchCol,  false);

                ctx.restore();
            }
        }

        scheduleNextFrame();
}
