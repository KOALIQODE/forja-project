<script lang="ts">
    import { invoke } from "@tauri-apps/api/core";
    import { untrack, onMount } from "svelte";
    import { get } from "svelte/store";
    import { listen } from "@tauri-apps/api/event"; 

    import { EDITOR_CONFIG, TOKEN_COLORS } from "$lib/utils/constants";
    import { ChunkRenderer } from "$lib/utils/ChunkRenderer";
    import { TextMetricsCache } from "$lib/utils/TextMetricsCache";
    import { WrapLayout } from "$lib/utils/WrapLayout";
    import { renderEditorFrame, type DrawMutations, type DrawState } from "./EditorRenderer";
    import { DocumentBridge } from "$lib/utils/documentBridge";
    import {
        DiffScheduler,
        DiffRenderInvalidationManager,
        ViewportDiffCache,
        GitHunkManager,
        HunkPreviewEngine,
        DIFF_COLORS,
        type LineDiffResult,
        type Hunk,
    } from "$lib/utils/diff";
    import {
        cursorPosition,
        currentBreadcrumb,
        vimStatus,
        type VimMode,
    } from "$lib/stores/editorStore";
    import { closeBuffer } from "$lib/stores/bufferStore";
    import { bufferPreferences } from "$lib/stores/preferencesStore";
    import { dialogState } from "../../stores/dialogStore";
    import { diagnosticsByFile, type Diagnostic } from "$lib/stores/diagnosticsStore";
    import { lspOpenDocument, lspChangeDocument, lspCloseDocument } from "$lib/utils/lspClient";
    import { pluginRunBracketProviders, pluginEmitEvent, type BracketRange } from "$lib/utils/pluginClient";
    import { activeTheme, bracketRanges, loadedPlugins, pluginsReady, pluginActivityVersion } from "$lib/stores/pluginStore";
    import { activeUITheme } from "$lib/stores/uiThemeStore";
    import { bracketRangesToColors, resolveTokenColors } from "$lib/utils/themeEngine";
    import { buildDiagByLine } from "$lib/utils/diagnosticsUtils";
    import { BracketColorizer } from "$lib/utils/BracketColorizer";
    import {
        handleCommandModeKeyDown,
        handleInsertModeKeyDown,
        handleNormalModeKeyDown,
        handleVisualModeKeyDown,
        type VimHandlerContext,
    } from "./VimHandlers";
    import EditorFileInfo from "./EditorFileInfo.svelte";
    import type { CursorPosition, EditorSnapshot, VimRegister, Token, SyntaxHighlight } from './types';
    import {
        isWordChar, isWhitespace,
        comparePositions, sortPositions, clonePosition,
        advancePosition as _advancePosition,
        retreatPosition as _retreatPosition,
        charAt as _charAt,
        getRangeText as _getRangeText,
        lineLength as _lineLength,
        clampLine as _clampLine,
        clampChar as _clampChar,
    } from './positionUtils';
    import {
        findNextWordStart as _findNextWordStart,
        findPreviousWordStart as _findPreviousWordStart,
        findWordEnd as _findWordEnd,
        findCharForward as _findCharForward,
        findCharBackward as _findCharBackward,
        findMatchingBracket as _findMatchingBracket,
    } from './textNavigation';
    import { getTextObjectRange as _getTextObjectRange } from './textObjects';
    import { HighlightManager } from '$lib/utils/HighlightManager';

    interface Props {
        filePath: string;
        bufferId: string; // Assuming bufferId is same as filePath for simplicity
        language: string;
    }

    let { filePath, bufferId, language }: Props = $props();

    const { CHUNK_SIZE } = EDITOR_CONFIG;

    let canvas = $state<HTMLCanvasElement | null>(null);
    let scrollContainer = $state<HTMLElement | null>(null);
    let totalLines = $state(0);
    let currentScrollTop = $state(0);
    let needsRedraw = $state(true);
    let isLoading = $state(false); // Declare isLoading state
    let mouseLine = $state<number | null>(null);
    let cursorVisible = $state(true);
    let vimMode = $state<VimMode>(get(bufferPreferences).vimModeEnabled ? "normal" : "insert");
    let pendingCount = $state("");
    let pendingOperator = $state<"delete" | "change" | "yank" | null>(null);
    let pendingSequence = $state("");
    let commandLine = $state("");
    let visualAnchor = $state<CursorPosition | null>(null);
    let lastFindChar = $state("");
    let lastFindDir = $state<1 | -1>(1);
    let lastFindStop = $state(false);
    let lastSearchQuery = $state("");

    // ── Bracket pair colorizer ────────────────────────────────────────────────────
    type BracketColor = { start: number; finish: number; color: string };
    let bracketColors = $state<BracketColor[]>([]);
    const bracketColorizer = new BracketColorizer();

    // ── Reactive theme colors — read from UITheme vars (same pattern as TitleBar/StatusBar)
    // This ensures instant reactivity when the user picks a theme in ThemePicker.
    let editorBgColor               = $derived($activeUITheme.vars['--forja-editor-bg']           ?? '#0d0d0d');
    let editorFgColor               = $derived($activeUITheme.vars['--forja-editor-fg']           ?? '#d4d4d4');
    let editorCursorColor           = $derived($activeUITheme.vars['--forja-editor-cursor']       ?? '#34d399');
    let editorActiveLineColor       = $derived($activeUITheme.vars['--forja-editor-active-line']  ?? 'rgba(52,211,153,0.07)');
    let editorSelectionColor        = $derived($activeUITheme.vars['--forja-editor-selection']    ?? 'rgba(52,211,153,0.18)');
    let editorLineNumberColor       = $derived($activeUITheme.vars['--forja-editor-line-number']  ?? '#3a3a3a');
    let editorLineNumberActiveColor = $derived($activeUITheme.vars['--forja-editor-fg']           ?? '#c0c0c0');
    let editorCursorBlinkMs         = $derived(Number($activeUITheme.vars['--forja-editor-cursor-blink'] ?? '500'));
    let editorScrollbarThumb        = $derived($activeUITheme.vars['--forja-editor-line-number']  ?? '#1a1a1a');
    let currentTokenColors          = $derived(resolveTokenColors($activeTheme?.syntax, TOKEN_COLORS));

    // Redraw canvas when theme changes — also invalidate chunk cache so syntax colors update
    $effect(() => {
        const _ = currentTokenColors;
        const __ = editorBgColor;
        const _fg = editorFgColor;
        const _cur = editorCursorColor;
        const _al = editorActiveLineColor;
        const _sel = editorSelectionColor;
        const _ln = editorLineNumberColor;
        const _lna = editorLineNumberActiveColor;
        chunkRenderer?.invalidateAll();
        queueRedraw();
        // Re-apply bracket colors with new theme palette (or fallback)
        if (bracketRanges) {
            const current = get(bracketRanges);
            if (current.length > 0) {
                const palette = $activeTheme?.brackets?.length
                    ? $activeTheme.brackets
                    : ["#f7768e", "#e0af68", "#9ece6a", "#7aa2f7", "#bb9af7", "#2ac3de"];
                bracketColors = bracketRangesToColors(current, palette);
            }
        }
    });

    // Trigger bracket colorizer: fires when BOTH plugins are ready AND file has content.
    // Both deps must be read unconditionally so Svelte 5 tracks them regardless of the condition.
    $effect(() => {
        const ready = $pluginsReady;
        const lines = totalLines; // read unconditionally so it's always a tracked dep
        if (ready && lines > 0) {
            scheduleBracketUpdate();
        }
    });

    // Re-run bracket analysis when a plugin is enabled/disabled at runtime.
    $effect(() => {
        const _v = $pluginActivityVersion;
        if (_v > 0 && totalLines > 0) {
            scheduleBracketUpdate();
        }
    });

    // Clear bracket colors immediately when the store is emptied (e.g. plugin disabled).
    $effect(() => {
        if ($bracketRanges.length === 0) {
            bracketColors = [];
            queueRedraw();
        }
    });

    // ── Cursor blink: recreated whenever the theme changes the interval ──────────
    $effect(() => {
        const ms = editorCursorBlinkMs;
        if (ms <= 0) {
            // No blink — keep cursor always visible
            cursorVisible = true;
            queueRedraw();
            return;
        }
        const id = setInterval(() => {
            cursorVisible = !cursorVisible;
            queueRedraw();
        }, ms);
        return () => clearInterval(id);
    });

    function scheduleBracketUpdate() {
        bracketColorizer.schedule({
            getLineCache: () => lineCache,
            getTotalLines: () => totalLines,
            getIsDirty: () => isDirty,
            filePath,
            language,
            onColors: (colors) => { bracketColors = colors; },
            onQueueRedraw: queueRedraw,
        });
    }

    let lineCache = new Map<number, string>();

    // ── Diff gutter state ────────────────────────────────────────────────────────
    let mouseX             = $state(0);
    let hunkPreviewHTML    = $state('');
    let hunkPreviewVisible = $state(false);
    let hunkPreviewScreenX = $state(0);
    let hunkPreviewScreenY = $state(0);
    // Reactive snapshot of hunks for the scrollbar mini-diff overlay.
    let scrollbarHunks     = $state<readonly Hunk[]>([]);

    // State to track the currently loaded file path, to avoid redundant checks
    let currentFilePath = $state<string | null>(null);

    // ── Phase 4: OffscreenCanvas chunk renderer ─────────────────────────────────
    const chunkRenderer = new ChunkRenderer(CHUNK_SIZE);

    // ── Phase 5: Text metrics cache ──────────────────────────────────────────────
    const metricsCache = new TextMetricsCache();

    // ── Phase 3→frontend / Phase 6: Stateful document bridge ────────────────────
    const docBridge = new DocumentBridge();

    // ── Diff system (gutter annotations — Phases diff-1 to diff-4) ──────────────
    const diffScheduler    = new DiffScheduler();
    const diffInvalidator  = new DiffRenderInvalidationManager(CHUNK_SIZE);
    const viewportDiffCache = new ViewportDiffCache();
    const hunkManager      = new GitHunkManager();
    const previewEngine    = new HunkPreviewEngine();
    const highlightManager = new HighlightManager({
        getLanguage: () => language,
        getFilePath: () => filePath,
        getLineCache: () => lineCache,
        getTotalLines: () => totalLines,
        getScrollContainer: () => scrollContainer,
        getCurrentScrollTop: () => currentScrollTop,
        getEditorLineHeight: () => editorLineHeight,
        chunkRenderer,
        docBridge,
        diffScheduler,
        onQueueRedraw: () => queueRedraw(),
        onSetWrapLayoutDirty: (v) => { wrapLayoutDirty = v; },
    });

    // ── Phase 7: Frame budget ────────────────────────────────────────────────────
    let lastFrameDuration = 0;

    // ── Error Lens: diagnostics ──────────────────────────────────────────────────
    /** line → first (most-severe) diagnostic; rebuilt on store change */
    let diagByLine = new Map<number, Diagnostic>();
    let fileDiagnostics = $derived($diagnosticsByFile.get(filePath) ?? []);

    let editorFontFamily = $derived($bufferPreferences.fontFamily);
    let editorFontSize = $derived($bufferPreferences.fontSize);
    let editorLineHeight = $derived($bufferPreferences.lineHeight);
    let vimModeEnabled = $derived($bufferPreferences.vimModeEnabled);
    let showLineNumbers = $derived($bufferPreferences.showLineNumbers);
    let highlightActiveLine = $derived($bufferPreferences.highlightActiveLine);
    let editorFont = $derived(`${editorFontSize}px ${editorFontFamily}`);
    let lineNumberDigits = $derived(String(Math.max(totalLines, 1)).length);
    let gutterWidth = $derived(showLineNumbers ? Math.max(56, lineNumberDigits * 10 + 24) : 16);
    let lineNumberX = $derived(gutterWidth - 12);
    let contentStartX = $derived(gutterWidth + 8);

    // ── Soft word wrap ───────────────────────────────────────────────────────────
    let softWrapEnabled = $derived($bufferPreferences.softWrapEnabled);
    const wrapLayout = new WrapLayout();
    let wrapLayoutDirty = $state(true);
    let lastWrapCharWidth = 0;
    let lastWrapContentWidth = 0;
    let visualRowCount = $state(0);

    let undoStack: EditorSnapshot[] = [];
    let redoStack: EditorSnapshot[] = [];

    const DEFAULT_VIM_REGISTER: VimRegister = { text: "", linewise: false };
    const vimRegisters = new Map<string, VimRegister>([['"', { ...DEFAULT_VIM_REGISTER }]]);

    function getCurrentRegister(): VimRegister {
        return vimRegisters.get('"') ?? DEFAULT_VIM_REGISTER;
    }

    function setCurrentRegister(value: VimRegister) {
        vimRegisters.set('"', value);
    }

    function queueRedraw() {
        needsRedraw = true;
    }

    function syncVimStatus() {
        vimStatus.set({
            mode: vimModeEnabled ? vimMode : "off",
            command: vimModeEnabled ? commandLine : "",
            pending: vimModeEnabled ? pendingSequence || (pendingOperator ? pendingOperator[0] : "") : "",
            count: vimModeEnabled ? pendingCount : "",
        });
    }

    let lastVimModeEnabled = $state<boolean | null>(null);

    $effect(() => {
        editorFontFamily;
        editorFontSize;
        editorLineHeight;
        showLineNumbers;
        highlightActiveLine;
        // Phase 5: font changed → all cached measurements are stale
        metricsCache.invalidateAll();
        // Phase 4: font changed → all cached chunk canvases are stale
        chunkRenderer.invalidateAll();
        queueRedraw();
    });

    $effect(() => {
        const enabled = vimModeEnabled;

        if (enabled === lastVimModeEnabled) {
            return;
        }

        lastVimModeEnabled = enabled;

        if (enabled) {
            vimMode = "normal";
            commandLine = "";
            visualAnchor = null;
            clearPendingState();
            normalizeNormalCursor();
        } else {
            vimMode = "insert";
            commandLine = "";
            visualAnchor = null;
            clearPendingState();
            normalizeCursor();
        }

        syncVimStatus();
        queueRedraw();
    });

    // ── Error Lens: rebuild line→diagnostic map when store updates ───────────────
    $effect(() => {
        diagByLine = buildDiagByLine(fileDiagnostics);
        queueRedraw();
    });

    function getLine(line: number): string {
        return lineCache.get(line) ?? "";
    }

    function setLine(line: number, text: string) {
        lineCache.set(line, text);
    }

    function insertLine(line: number, text: string) {
        const target = Math.max(0, Math.min(line, totalLines));
        shiftLinesDown(target, 1);
        setLine(target, text);
        totalLines++;
    }

    function deleteLine(line: number) {
        if (totalLines <= 1) {
            totalLines = 1;
            setLine(0, "");
            cursorLine = 0;
            cursorChar = 0;
            return;
        }

        const target = clampLine(line);
        shiftLinesUp(target, 1);
        totalLines = Math.max(totalLines - 1, 1);
        cursorLine = Math.min(cursorLine, totalLines - 1);
        cursorChar = clampChar(cursorLine, cursorChar);
    }

    function cloneSnapshot(): EditorSnapshot {
        return {
            lineCache: new Map(lineCache),
            totalLines,
            cursorLine,
            cursorChar,
        };
    }

    function pushUndoSnapshot() {
        undoStack.push(cloneSnapshot());
        if (undoStack.length > 200) {
            undoStack.shift();
        }
        redoStack = [];
    }

    function restoreSnapshot(snapshot: EditorSnapshot) {
        lineCache = new Map(snapshot.lineCache);
        totalLines = snapshot.totalLines;
        cursorLine = snapshot.cursorLine;
        cursorChar = snapshot.cursorChar;
        normalizeCursor();
        chunkRenderer.invalidateAll();
        highlightManager.tokenCache.clear();
        highlightManager.pendingChunks.clear();

        // Rebuild loadedChunks from the restored lineCache instead of clearing it
        // entirely. The snapshot contains the full in-memory content, so any chunk
        // whose lines are already present can be marked as loaded — this avoids a
        // re-fetch from disk that would produce stale content for highlighting.
        highlightManager.loadedChunks.clear();
        const totalChunks = Math.ceil(totalLines / CHUNK_SIZE);
        for (let chunkId = 0; chunkId < totalChunks; chunkId++) {
            if (highlightManager.getCachedLinesForChunk(chunkId) !== null) highlightManager.loadedChunks.add(chunkId);
        }

        // Trigger a full diff recompute so mini.diff (and the gutter) immediately
        // reflect the restored state. updateCurrentContent() intentionally skips
        // scheduling, so we use notifyEdit() with the whole file range instead.
        diffScheduler.notifyEdit(lineCache, totalLines, 0, Math.max(0, totalLines - 1));

        queueRedraw();

        // Reopen the backend AST document with the restored content so tree-sitter
        // tokens are fresh and don't reflect pre-undo incremental edits.
        void (async () => {
            if (docBridge.isOpen()) {
                await docBridge.close();
                const restoredLines: string[] = [];
                for (let i = 0; i < Math.min(CHUNK_SIZE, totalLines); i++) {
                    restoredLines.push(lineCache.get(i) ?? '');
                }
                await docBridge.open(currentFilePath ?? '', restoredLines.join('\n'), language);
            }
            // Prefer viewport-only highlighting (fast, uses the fresh AST).
            const bridgeProduced = await highlightManager.highlightViewportViaDocBridge();
            if (!bridgeProduced && highlightManager.highlightEnabled) {
                void highlightManager.rehighlightLoadedChunks();
            }
        })();
    }

    /** Returns the current editor content as a single string (for dirty-state checks). */
    function getCurrentContent(): string {
        const lines: string[] = [];
        for (let i = 0; i < totalLines; i++) lines.push(lineCache.get(i) ?? '');
        return lines.join('\n');
    }

    function undo() {
        const snapshot = undoStack.pop();
        if (!snapshot) return;

        redoStack.push(cloneSnapshot());
        restoreSnapshot(snapshot);
        // Only mark dirty if the restored content differs from what was last saved.
        isDirty = savedContent !== '' && getCurrentContent() !== savedContent;
    }

    function redo() {
        const snapshot = redoStack.pop();
        if (!snapshot) return;
        undoStack.push(cloneSnapshot());
        restoreSnapshot(snapshot);
        isDirty = savedContent !== '' && getCurrentContent() !== savedContent;
    }

    function currentPosition(): CursorPosition {
        return { line: cursorLine, char: cursorChar };
    }

    function lineLength(line: number) { return _lineLength(line, getLine); }

    function clampLine(line: number) { return _clampLine(line, totalLines); }

    function clampChar(line: number, char: number) { return _clampChar(line, char, getLine); }

    function normalizeCursor() {
        cursorLine = clampLine(cursorLine);
        cursorChar = clampChar(cursorLine, cursorChar);
        ensureCursorVisible();
    }

    function normalizeNormalCursor() {
        const length = lineLength(cursorLine);
        cursorChar = length > 0 ? Math.min(cursorChar, length - 1) : 0;
        ensureCursorVisible();
    }

    function setCursor(line: number, char: number) {
        cursorLine = clampLine(line);
        cursorChar = clampChar(cursorLine, char);
        ensureCursorVisible();
        queueRedraw();
    }

    function setNormalCursor(line: number, char: number) {
        cursorLine = clampLine(line);
        const length = lineLength(cursorLine);
        cursorChar = length > 0 ? Math.max(0, Math.min(char, length - 1)) : 0;
        ensureCursorVisible();
        queueRedraw();
    }

    function ensureCursorVisible() {
        if (!scrollContainer) return;

        const visualRow = softWrapEnabled && wrapLayout.totalVisualRows > 0
            ? wrapLayout.visualRowOfChar(cursorLine, cursorChar)
            : cursorLine;
        const top = visualRow * editorLineHeight;
        const bottom = top + editorLineHeight;
        const viewportTop = scrollContainer.scrollTop;
        const viewportBottom = viewportTop + scrollContainer.clientHeight;

        if (top < viewportTop) {
            scrollContainer.scrollTop = top;
        } else if (bottom > viewportBottom) {
            scrollContainer.scrollTop = bottom - scrollContainer.clientHeight;
        }
    }

    function clearPendingState() {
        pendingCount = "";
        pendingOperator = null;
        pendingSequence = "";
        syncVimStatus();
    }

    function enterNormalMode(fromInsert = false) {
        vimMode = "normal";
        commandLine = "";
        visualAnchor = null;
        clearPendingState();

        if (fromInsert && cursorChar > 0) {
            cursorChar--;
        }

        normalizeCursor();
        normalizeNormalCursor();
        syncVimStatus();
    }

    function enterInsertMode() {
        vimMode = "insert";
        commandLine = "";
        clearPendingState();
        syncVimStatus();
    }

    function enterVisualMode() {
        vimMode = "visual";
        visualAnchor = currentPosition();
        clearPendingState();
        syncVimStatus();
        queueRedraw();
    }

    function enterCommandMode(initial = "") {
        vimMode = "command";
        commandLine = initial;
        clearPendingState();
        syncVimStatus();
        queueRedraw();
    }

    function getCount(defaultValue = 1) {
        return pendingCount ? Math.max(parseInt(pendingCount, 10), 1) : defaultValue;
    }

    function advancePosition(pos: CursorPosition) { return _advancePosition(pos, getLine, totalLines); }

    function retreatPosition(pos: CursorPosition) { return _retreatPosition(pos, getLine); }

    function charAt(pos: CursorPosition) { return _charAt(pos, getLine, totalLines); }

    function findNextWordStart(from: CursorPosition, count = 1) { return _findNextWordStart(from, getLine, totalLines, count); }

    function findPreviousWordStart(from: CursorPosition, count = 1) { return _findPreviousWordStart(from, getLine, totalLines, count); }

    function findWordEnd(from: CursorPosition, count = 1) { return _findWordEnd(from, getLine, totalLines, count); }

    function moveCursorToLineStart() {
        setCursor(cursorLine, 0);
    }

    function moveCursorToFirstNonWhitespace() {
        const match = getLine(cursorLine).match(/\S/);
        setCursor(cursorLine, match ? match.index ?? 0 : 0);
    }

    function moveCursorToLineEnd() {
        const length = lineLength(cursorLine);
        setCursor(cursorLine, length > 0 ? length - 1 : 0);
    }

    function getVisualBounds(): [CursorPosition, CursorPosition] | null {
        if (!visualAnchor) return null;
        const [start, end] = sortPositions(visualAnchor, currentPosition());
        return [start, end];
    }

    function findCharForward(ch: string, count: number, stop = false) { return _findCharForward(ch, cursorChar, cursorLine, getLine, count, stop); }

    function findCharBackward(ch: string, count: number, stop = false) { return _findCharBackward(ch, cursorChar, cursorLine, getLine, count, stop); }

    function findMatchingBracket(line: number, char: number) { return _findMatchingBracket(line, char, getLine, totalLines); }

    function getTextObjectRange(type: 'i' | 'a', obj: string) { return _getTextObjectRange(type, obj, cursorLine, cursorChar, getLine, totalLines); }

    const INDENT_STR = "    "; // 4 spaces

    async function indentLines(startLine: number, endLine: number, direction: 1 | -1) {
        await mutateDocument(() => {
            for (let i = startLine; i <= endLine; i++) {
                const line = getLine(i);
                if (direction === 1) {
                    setLine(i, INDENT_STR + line);
                } else {
                    if (line.startsWith(INDENT_STR)) setLine(i, line.slice(INDENT_STR.length));
                    else if (line.startsWith("\t")) setLine(i, line.slice(1));
                    else setLine(i, line.replace(/^ {1,4}/, ""));
                }
            }
        });
    }

    async function mutateDocument(mutation: () => void) {
        pushUndoSnapshot();
        const preMutationLines = totalLines;
        mutation();
        normalizeCursor();
        if (vimModeEnabled && vimMode !== "insert") {
            normalizeNormalCursor();
        }
        isDirty = true;
        // Mark all chunks from the edit point onwards dirty when line count changes
        // (line insertions/deletions shift content across chunk boundaries).
        const editChunk = Math.floor(cursorLine / CHUNK_SIZE);
        if (totalLines !== preMutationLines) {
            chunkRenderer.invalidateAll();
        } else {
            chunkRenderer.markDirty(editChunk);
        }
        // Trigger an immediate redraw so the edit appears in the next frame
        // (text is visible right away; highlighting follows after the debounce).
        wrapLayoutDirty = true;
        queueRedraw();
        scheduleBracketUpdate();
        // Debounced: coalesces rapid keystrokes into a single highlight IPC call.
        highlightManager.scheduleHighlightRefresh(editChunk);
        // Diff: notify incremental edit (±5 lines window around cursor)
        diffScheduler.notifyEdit(
            lineCache,
            totalLines,
            Math.max(0, cursorLine - 5),
            Math.min(totalLines - 1, cursorLine + 5),
        );
    }

    function shiftLinesUp(startLine: number, amount: number) {
        for (let i = startLine; i < totalLines - amount; i++) {
            setLine(i, getLine(i + amount));
        }
        for (let i = totalLines - amount; i < totalLines; i++) {
            lineCache.delete(i);
        }
    }

    function shiftLinesDown(startLine: number, amount: number) {
        for (let i = totalLines - 1; i >= startLine; i--) {
            setLine(i + amount, getLine(i));
        }
    }

    function getRangeText(start: CursorPosition, end: CursorPosition) { return _getRangeText(start, end, getLine); }

    async function deleteRange(start: CursorPosition, end: CursorPosition) {
        await mutateDocument(() => {
            const [from, to] = sortPositions(start, end);
            setCurrentRegister({ text: getRangeText(from, to), linewise: false });

            if (from.line === to.line) {
                const line = getLine(from.line);
                setLine(from.line, line.slice(0, from.char) + line.slice(to.char));
            } else {
                const merged =
                    getLine(from.line).slice(0, from.char) + getLine(to.line).slice(to.char);
                setLine(from.line, merged);
                const removedLines = to.line - from.line;
                shiftLinesUp(from.line + 1, removedLines);
                totalLines -= removedLines;
            }

            cursorLine = from.line;
            cursorChar = from.char;
        });
    }

    async function deleteCurrentLine(count = 1) {
        await mutateDocument(() => {
            const start = clampLine(cursorLine);
            const end = Math.min(totalLines - 1, start + count - 1);
            const removed: string[] = [];

            for (let i = start; i <= end; i++) {
                removed.push(getLine(i));
            }

            setCurrentRegister({ text: removed.join("\n"), linewise: true });
            shiftLinesUp(start, end - start + 1);
            totalLines = Math.max(totalLines - (end - start + 1), 1);

            if (totalLines === 0) {
                totalLines = 1;
                setLine(0, "");
            }

            cursorLine = Math.min(start, totalLines - 1);
            cursorChar = 0;
        });
    }

    function yankRange(start: CursorPosition, end: CursorPosition) {
        const [from, to] = sortPositions(start, end);
        setCurrentRegister({ text: getRangeText(from, to), linewise: false });
    }

    function yankCurrentLine(count = 1) {
        const start = clampLine(cursorLine);
        const end = Math.min(totalLines - 1, start + count - 1);
        const lines: string[] = [];
        for (let i = start; i <= end; i++) {
            lines.push(getLine(i));
        }
        setCurrentRegister({ text: lines.join("\n"), linewise: true });
    }

    async function insertTextAtCursor(text: string) {
        await mutateDocument(() => {
            const line = getLine(cursorLine);
            setLine(
                cursorLine,
                line.slice(0, cursorChar) + text + line.slice(cursorChar),
            );
            cursorChar += text.length;
        });
    }

    async function insertNewLineBelow() {
        await mutateDocument(() => {
            shiftLinesDown(cursorLine + 1, 1);
            setLine(cursorLine + 1, "");
            totalLines++;
            cursorLine += 1;
            cursorChar = 0;
        });
        enterInsertMode();
    }

    async function insertNewLineAbove() {
        await mutateDocument(() => {
            shiftLinesDown(cursorLine, 1);
            setLine(cursorLine, "");
            totalLines++;
            cursorChar = 0;
        });
        enterInsertMode();
    }

    async function pasteRegister(after: boolean) {
        const register = getCurrentRegister();
        if (!register.text) return;

        await mutateDocument(() => {
            if (register.linewise) {
                const targetLine = after ? cursorLine + 1 : cursorLine;
                const lines = register.text.split("\n");
                shiftLinesDown(targetLine, lines.length);
                lines.forEach((line, index) => setLine(targetLine + index, line));
                totalLines += lines.length;
                cursorLine = targetLine;
                cursorChar = 0;
                return;
            }

            const insertionPoint = after
                ? Math.min(cursorChar + 1, lineLength(cursorLine))
                : cursorChar;
            const line = getLine(cursorLine);

            if (!register.text.includes("\n")) {
                setLine(
                    cursorLine,
                    line.slice(0, insertionPoint) + register.text + line.slice(insertionPoint),
                );
                cursorChar = insertionPoint + Math.max(register.text.length - 1, 0);
                return;
            }

            const parts = register.text.split("\n");
            const left = line.slice(0, insertionPoint);
            const right = line.slice(insertionPoint);
            const targetLine = cursorLine;

            shiftLinesDown(targetLine + 1, parts.length - 1);
            setLine(targetLine, left + parts[0]);

            for (let i = 1; i < parts.length - 1; i++) {
                setLine(targetLine + i, parts[i]);
            }

            setLine(targetLine + parts.length - 1, parts[parts.length - 1] + right);
            totalLines += parts.length - 1;
            cursorLine = targetLine + parts.length - 1;
            cursorChar = parts[parts.length - 1].length;
        });
    }

    // Helper functions to interact with backend
    async function fetchTotalLines(): Promise<number> {
        isLoading = true;
        try {
            const count = await invoke<number>("get_total_lines", {
                path: filePath,
            });
            console.log(`fetchTotalLines: ${count} lines for ${filePath}`);
            totalLines = count;
            scheduleBracketUpdate();
            return count;
        } catch (e) {
            console.error("Failed to get total lines:", e);
            totalLines = 0;
            return 0;
        } finally {
            isLoading = false;
            // ← queueRedraw() eliminado
        }
    }

    interface BlameLine {
        author: string;
        date: string;
        commit_id: string;
        summary: string;
    }

    let blameCache = $state<BlameLine[]>([]);

    async function fetchBlame() {
        if (!filePath) return;
        try {
            const results = await invoke<BlameLine[]>("git_blame", { path: filePath });
            blameCache = results;
            queueRedraw();
        } catch (e) {
            // console.error("Failed to fetch blame:", e);
            blameCache = [];
        }
    }

    function draw() {
        if (!canvas || !scrollContainer) {
            requestAnimationFrame(draw);
            return;
        }

        const state: DrawState = {
            canvas,
            scrollContainer,
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
            highlightEnabled: highlightManager.highlightEnabled,
            lastWrapCharWidth,
            lastWrapContentWidth,
            wrapLayoutDirty,
            visualRowCount,
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
            tokenCache: highlightManager.tokenCache,
            bracketColors,
            blameCache,
            scheduleNextFrame: () => requestAnimationFrame(draw),
        };

        const mutations: DrawMutations = {
            setNeedsRedraw: (value) => {
                needsRedraw = value;
            },
            setVisualRowCount: (value) => {
                visualRowCount = value;
            },
            setLastWrapCharWidth: (value) => {
                lastWrapCharWidth = value;
            },
            setLastWrapContentWidth: (value) => {
                lastWrapContentWidth = value;
            },
            setWrapLayoutDirty: (value) => {
                wrapLayoutDirty = value;
            },
            setLastFrameDuration: (value) => {
                lastFrameDuration = value;
            },
        };

        renderEditorFrame(state, mutations);
    }

    // --- Basic Editing Support ---
    let cursorLine = $state(0);
    let cursorChar = $state(0);

    let breadcrumbTimer: ReturnType<typeof setTimeout> | null = null;

    // Update global cursor position store
    $effect(() => {
        cursorPosition.set({ line: cursorLine + 1, column: cursorChar + 1 });
        if (breadcrumbTimer !== null) clearTimeout(breadcrumbTimer);
        breadcrumbTimer = setTimeout(() => updateBreadcrumb(), 300);
    });

    $effect(() => {
        vimMode;
        commandLine;
        pendingSequence;
        pendingOperator;
        pendingCount;
        syncVimStatus();
    });

    async function updateBreadcrumb() {
        if (!filePath) return;
        try {
            const content = await invoke<string>("read_file", { path: filePath });
            const breadcrumb = await invoke<any>("get_code_breadcrumb", {
                content,
                language,
                line: cursorLine,
                column: cursorChar,
            });
            currentBreadcrumb.set(breadcrumb);
        } catch (err) {
            // breadcrumb is best-effort, silently ignore errors
        }
    }

    let editorContainer = $state<HTMLElement | null>(null);

    function handleClick(e: MouseEvent) {
        if (!canvas || !scrollContainer) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const scrollPos = currentScrollTop;

        let clickedLine: number;
        let charOffset = 0;

        if (softWrapEnabled && wrapLayout.totalVisualRows > 0) {
            const clickedVisualRow = Math.floor((y + scrollPos) / editorLineHeight);
            const clamped = Math.max(0, Math.min(clickedVisualRow, wrapLayout.totalVisualRows - 1));
            const { line, subRow } = wrapLayout.visualToLogical(clamped);
            clickedLine = line;
            charOffset = subRow * wrapLayout.charsPerRow;
        } else {
            clickedLine = Math.floor((y + scrollPos) / editorLineHeight);
        }

        if (clickedLine >= 0 && clickedLine < totalLines) {
            cursorVisible = true;
            const lineText = getLine(clickedLine);
            const rowText = softWrapEnabled
                ? lineText.slice(charOffset, charOffset + wrapLayout.charsPerRow)
                : lineText;

            const ctx = canvas.getContext("2d");
            if (ctx) {
                ctx.font = editorFont;
                let bestChar = 0;
                let minDiff = Infinity;

                for (let i = 0; i <= rowText.length; i++) {
                    const width = ctx.measureText(rowText.substring(0, i)).width;
                    const diff = Math.abs(x - (contentStartX + width));
                    if (diff < minDiff) {
                        minDiff = diff;
                        bestChar = i;
                    }
                }

                const finalChar = charOffset + bestChar;

                if (vimMode === "insert") {
                    setCursor(clickedLine, finalChar);
                } else {
                    enterNormalMode();
                    setNormalCursor(clickedLine, finalChar);
                }
            }
        }

        if (editorContainer) {
            editorContainer.focus();
        }
    }

    async function handleInsertEnter() {
        await mutateDocument(() => {
            const currentLineText = getLine(cursorLine);
            const left = currentLineText.substring(0, cursorChar);
            const right = currentLineText.substring(cursorChar);

            shiftLinesDown(cursorLine + 1, 1);
            setLine(cursorLine, left);
            setLine(cursorLine + 1, right);
            totalLines++;
            cursorLine++;
            cursorChar = 0;
        });
    }

    async function handleInsertBackspace() {
        if (cursorChar > 0) {
            await mutateDocument(() => {
                const currentLineText = getLine(cursorLine);
                setLine(
                    cursorLine,
                    currentLineText.substring(0, cursorChar - 1) +
                        currentLineText.substring(cursorChar),
                );
                cursorChar--;
            });
            return;
        }

        if (cursorLine === 0) return;

        await mutateDocument(() => {
            const currentLineText = getLine(cursorLine);
            const previousLineText = getLine(cursorLine - 1);
            const newCursorChar = previousLineText.length;

            setLine(cursorLine - 1, previousLineText + currentLineText);
            shiftLinesUp(cursorLine, 1);
            totalLines--;
            cursorLine--;
            cursorChar = newCursorChar;
        });
    }

    async function handleInsertCharacter(char: string) {
        await insertTextAtCursor(char);
    }

    async function deleteCharAtCursor(count = 1) {
        const line = getLine(cursorLine);
        if (!line.length || cursorChar >= line.length) return;

        await deleteRange(
            { line: cursorLine, char: cursorChar },
            { line: cursorLine, char: Math.min(cursorChar + count, line.length) },
        );
    }

    function moveVertical(delta: number) {
        setNormalCursor(clampLine(cursorLine + delta), cursorChar);
    }

    function moveHorizontal(delta: number) {
        const length = lineLength(cursorLine);
        const target = length > 0 ? Math.max(0, Math.min(cursorChar + delta, length - 1)) : 0;
        setNormalCursor(cursorLine, target);
    }

    function moveHorizontalWrap(delta: number) {
        let line = cursorLine;
        let char = cursorChar;
        let remaining = Math.abs(delta);
        const dir = delta > 0 ? 1 : -1;

        while (remaining > 0) {
            const len = lineLength(line);
            if (dir > 0) {
                if (char < len - 1) {
                    char = Math.min(char + remaining, len - 1);
                    remaining = 0;
                } else if (line < totalLines - 1) {
                    line++;
                    char = 0;
                    remaining--;
                } else {
                    break;
                }
            } else {
                if (char > 0) {
                    char = Math.max(char - remaining, 0);
                    remaining = 0;
                } else if (line > 0) {
                    line--;
                    char = Math.max(lineLength(line) - 1, 0);
                    remaining--;
                } else {
                    break;
                }
            }
        }
        setNormalCursor(line, char);
    }

    function moveToFirstLine() {
        setNormalCursor(0, 0);
    }

    function moveToLastLine() {
        setNormalCursor(totalLines - 1, 0);
    }

    function getExclusivePosition(position: CursorPosition): CursorPosition {
        const length = lineLength(position.line);
        if (position.char < length) {
            return { line: position.line, char: position.char + 1 };
        }
        if (position.line < totalLines - 1) {
            return { line: position.line + 1, char: 0 };
        }
        return { line: position.line, char: length };
    }

    function getVisualRange(): [CursorPosition, CursorPosition] | null {
        const bounds = getVisualBounds();
        if (!bounds) return null;
        return [bounds[0], getExclusivePosition(bounds[1])];
    }

    function getOperatorRange(
        motion: string,
        count: number,
    ): { start: CursorPosition; end: CursorPosition } | null {
        const start = currentPosition();

        switch (motion) {
            case "w":
                return { start, end: findNextWordStart(start, count) };
            case "b":
                return { start: findPreviousWordStart(start, count), end: start };
            case "e":
                return { start, end: getExclusivePosition(findWordEnd(start, count)) };
            case "0":
                return { start: { line: cursorLine, char: 0 }, end: start };
            case "^": {
                const match = getLine(cursorLine).match(/\S/);
                return {
                    start: { line: cursorLine, char: match ? match.index ?? 0 : 0 },
                    end: start,
                };
            }
            case "$":
                return { start, end: { line: cursorLine, char: lineLength(cursorLine) } };
            case "h":
                return {
                    start: { line: cursorLine, char: Math.max(cursorChar - count, 0) },
                    end: start,
                };
            case "l":
                return {
                    start,
                    end: { line: cursorLine, char: Math.min(cursorChar + count + 1, lineLength(cursorLine)) },
                };
            case "j":
                return {
                    start: { line: cursorLine, char: 0 },
                    end: { line: Math.min(cursorLine + count, totalLines - 1), char: lineLength(Math.min(cursorLine + count, totalLines - 1)) },
                };
            case "k":
                return {
                    start: { line: Math.max(cursorLine - count, 0), char: 0 },
                    end: { line: cursorLine, char: lineLength(cursorLine) },
                };
            case "G":
                return {
                    start: { line: cursorLine, char: 0 },
                    end: { line: totalLines - 1, char: lineLength(totalLines - 1) },
                };
            default:
                return null;
        }
    }

    async function applyPendingOperator(motion: string) {
        if (!pendingOperator) return;

        // Text object: accumulate "i"/"a" modifier, then handle on the object char
        if ((motion === "i" || motion === "a") && !pendingSequence.includes(motion)) {
            pendingSequence += motion;
            syncVimStatus();
            return;
        }
        if (pendingSequence.endsWith("i") || pendingSequence.endsWith("a")) {
            const insideOrAround = pendingSequence.slice(-1) as "i" | "a";
            const objChar = motion;
            const textObjRange = getTextObjectRange(insideOrAround, objChar);
            if (textObjRange) {
                if (pendingOperator === "yank") {
                    yankRange(textObjRange.start, textObjRange.end);
                } else {
                    const shouldInsert = pendingOperator === "change";
                    await deleteRange(textObjRange.start, textObjRange.end);
                    if (shouldInsert) enterInsertMode();
                    else normalizeNormalCursor();
                }
            }
            clearPendingState();
            return;
        }

        const count = getCount();

        if (motion === pendingOperator[0]) {
            if (pendingOperator === "delete") {
                await deleteCurrentLine(count);
            } else if (pendingOperator === "yank") {
                yankCurrentLine(count);
            } else if (pendingOperator === "change") {
                await deleteCurrentLine(count);
                enterInsertMode();
            }

            clearPendingState();
            queueRedraw();
            return;
        }

        const range = getOperatorRange(motion, count);
        if (!range) {
            clearPendingState();
            queueRedraw();
            return;
        }

        if (pendingOperator === "yank") {
            yankRange(range.start, range.end);
            clearPendingState();
            queueRedraw();
            return;
        }

        const shouldInsert = pendingOperator === "change";
        await deleteRange(range.start, range.end);
        clearPendingState();

        if (shouldInsert) {
            enterInsertMode();
        } else {
            normalizeNormalCursor();
            queueRedraw();
        }
    }

    async function executeCommandLine() {
        const normalized = commandLine.trim().toLowerCase();

        if (normalized === "w") {
            await saveFile();
        } else if (normalized === "q") {
            if (!isDirty) {
                closeBuffer(bufferId);
            }
        } else if (normalized === "q!") {
            closeBuffer(bufferId);
        } else if (normalized === "wq" || normalized === "x") {
            const saved = await saveFile();
            if (saved) {
                closeBuffer(bufferId);
            }
        }

        commandLine = "";
        enterNormalMode();
    }

    const vimCtx: VimHandlerContext = {
        getVimMode: () => vimMode,
        getVimModeEnabled: () => vimModeEnabled,
        getPendingOperator: () => pendingOperator,
        getPendingSequence: () => pendingSequence,
        getPendingCount: () => pendingCount,
        getCursorLine: () => cursorLine,
        getCursorChar: () => cursorChar,
        getTotalLines: () => totalLines,
        getLine,
        getVisualAnchor: () => visualAnchor,
        getVimRegisters: () => vimRegisters,
        getCommandLine: () => commandLine,
        getLastSearchQuery: () => lastSearchQuery,
        setVimMode: (mode) => {
            vimMode = mode as VimMode;
        },
        setPendingOperator: (operator) => {
            pendingOperator = operator as typeof pendingOperator;
        },
        setPendingSequence: (sequence) => {
            pendingSequence = sequence;
        },
        setPendingCount: (count) => {
            pendingCount = count;
        },
        setVisualAnchor: (anchor) => {
            visualAnchor = anchor;
        },
        setCommandLine: (value) => {
            commandLine = value;
        },
        setLastSearchQuery: (value) => {
            lastSearchQuery = value;
        },
        setCursor,
        setNormalCursor,
        enterNormalMode,
        enterInsertMode,
        enterVisualMode,
        clearPendingState,
        syncVimStatus,
        mutateDocument,
        applyPendingOperator,
        handleInsertEnter,
        handleInsertBackspace,
        handleInsertCharacter,
        saveFile,
        undo,
        redo,
        lineLength,
        clampLine,
        clampChar,
        findNextWordStart,
        findPreviousWordStart,
        findWordEnd,
        findCharForward,
        findCharBackward,
        findMatchingBracket,
        getTextObjectRange,
        indentLines,
        setLine,
        insertLine,
        deleteLine,
        queueRedraw,
        highlightViewportViaDocBridge: () => highlightManager.highlightViewportViaDocBridge(),
        vimRegisters,
        getLastFindChar: () => lastFindChar,
        getLastFindDir: () => lastFindDir,
        getLastFindStop: () => lastFindStop,
        setLastFindChar: (value) => {
            lastFindChar = value;
        },
        setLastFindDir: (value) => {
            lastFindDir = value;
        },
        setLastFindStop: (value) => {
            lastFindStop = value;
        },
        dialogState,
        executeCommandLine,
        deleteRange,
        yankRange,
        pasteRegister,
        insertNewLineBelow,
        insertNewLineAbove,
        deleteCharAtCursor,
        getScrollContainer: () => scrollContainer,
        getEditorLineHeight: () => editorLineHeight,
        normalizeNormalCursor,
        ensureCursorVisible,
    };

    async function handleEditorKeyDown(e: KeyboardEvent) {
        let activeDlg = false;
        dialogState.subscribe((s) => (activeDlg = !!s.activeDialog))();
        if (activeDlg) return;

        cursorVisible = true;

        if (!vimModeEnabled) {
            await handleInsertModeKeyDown(e, vimCtx, false);
            return;
        }

        if (vimMode === "insert") {
            await handleInsertModeKeyDown(e, vimCtx);
        } else if (vimMode === "command") {
            await handleCommandModeKeyDown(e, vimCtx);
        } else if (vimMode === "visual") {
            await handleVisualModeKeyDown(e, vimCtx);
        } else {
            await handleNormalModeKeyDown(e, vimCtx);
        }
    }

    function handleScroll() {
        if (scrollContainer) {
            const newScroll = scrollContainer.scrollTop;
            if (newScroll !== currentScrollTop) {
                currentScrollTop = newScroll;
                queueRedraw();
                // Diff: keep viewport decoration cache current on scroll
                const diffStart = Math.floor(newScroll / editorLineHeight);
                const diffEnd   = diffStart + Math.ceil(scrollContainer.clientHeight / editorLineHeight) + 2;
                viewportDiffCache.scroll(diffStart, diffEnd);
                
                console.log(`[scroll] scrollTop=${newScroll} startLine=${Math.floor(newScroll / editorLineHeight)}`);
                prefetchNearbyChunks(); // ← agregar esto
            }
        }
    }
    
    let fetchLoopId: number;
    
    function startFetchLoop() {
        const tick = () => {
            if (canvas && scrollContainer && totalLines > 0) {
                const currentStart = Math.floor(currentScrollTop / editorLineHeight);
                const visibleLines = Math.ceil(scrollContainer.clientHeight / editorLineHeight);
    
                const end = Math.min(
                    currentStart + visibleLines + EDITOR_CONFIG.VISIBLE_LINES_OFFSET,
                    totalLines
                );
    
                for (let i = currentStart; i < end; i++) {
                    if (!lineCache.has(i)) {
                        highlightManager.fetchChunk(i);
                        // break; // Original line. Commented out to ensure all visible lines are fetched as user scrolls.
                               // This prevents content from disappearing due to insufficient chunk loading.
                    }
                }
            }
    
            fetchLoopId = requestAnimationFrame(tick);
        };
    
        fetchLoopId = requestAnimationFrame(tick);
    }
    
    function prefetchNearbyChunks() {
        const currentLine = Math.floor(currentScrollTop / editorLineHeight);
        const visibleLines = Math.ceil(window.innerHeight / editorLineHeight);
        
        // Prefetch 2 chunks adelante y 1 atrás
        const chunksToFetch = [
            Math.floor(currentLine / CHUNK_SIZE),
            Math.floor((currentLine + visibleLines) / CHUNK_SIZE),
            Math.floor((currentLine + visibleLines * 2) / CHUNK_SIZE), // 2 pantallas adelante
            Math.floor((currentLine - CHUNK_SIZE) / CHUNK_SIZE),       // 1 chunk atrás
        ];
    
        for (const chunkId of new Set(chunksToFetch)) {
            if (chunkId < 0) continue;
            const startLine = chunkId * CHUNK_SIZE;
            if (startLine >= totalLines) continue;
            if (!lineCache.has(startLine)) {
                highlightManager.fetchChunk(startLine);
            }
        }
    }
    
    let isSaving = $state(false);
    let isDirty = $state(false);
    // Fingerprint of the last-saved (or initially-loaded) content.
    // Used to determine whether an undo/redo operation restores a clean state.
    let savedContent = '';
    let lspVersion = 1;

    // Suppress file-changed watcher events triggered by our own save.
    // A boolean flag is set for SAVE_DEBOUNCE_MS after every successful write,
    // handling filesystems that emit 3+ change events per write operation.
    const SAVE_DEBOUNCE_MS = 3000;
    let suppressExternalReload = false;
    let saveDebounceHandle: ReturnType<typeof setTimeout> | null = null;

    async function saveFile() {
        if (!isDirty || isSaving) return true;
        isSaving = true;

        // Arm the suppression window before the write so any watcher event
        // fired during or immediately after the write is ignored.
        suppressExternalReload = true;
        if (saveDebounceHandle !== null) clearTimeout(saveDebounceHandle);
        saveDebounceHandle = setTimeout(() => {
            suppressExternalReload = false;
            saveDebounceHandle = null;
        }, SAVE_DEBOUNCE_MS);
        
        try {
            let lines: string[] = [];
            for (let i = 0; i < totalLines; i++) {
                lines.push(lineCache.get(i) ?? "");
            }
            const content = lines.join("\n");
            await invoke("write_file", { path: filePath, content });
            isDirty = false;
            savedContent = content;
            void fetchBlame();
            void lspChangeDocument(language, filePath, ++lspVersion, content);
            // Notify Lua plugins about the save event
            void pluginEmitEvent("on_save", content, language, filePath);
            scheduleBracketUpdate();
            return true;
        } catch (e) {
            console.error("Save failed:", e);
            // Release the suppression immediately on error so external changes
            // are not accidentally blocked.
            if (saveDebounceHandle !== null) clearTimeout(saveDebounceHandle);
            saveDebounceHandle = null;
            suppressExternalReload = false;
            return false;
        } finally {
            isSaving = false;
            queueRedraw();
        }
    }

    // ── Event listener setup (Tauri + DOM) ──────────────────────────────────────
    function handleGoToLine(e: Event) {
        const { filePath: targetPath, line } = (e as CustomEvent).detail;
        if (targetPath === filePath) {
            setCursor(line - 1, 0);
            if (vimModeEnabled) enterNormalMode();
        }
    }

    async function setupEventListeners(): Promise<() => void> {
        const unlistenParserReady = await listen<string>("parser-ready", async (event) => {
            if (event.payload !== language) return;
            await highlightManager.refreshHighlightAvailability();
        });

        const unlistenFileChanged = await listen("file-changed", async (event: any) => {
            const changedPath = event.payload;
            if (changedPath !== filePath || suppressExternalReload) return;
            resetAndLoad(filePath);
        });

        const unlistenFileSaved = await listen("file-saved", (event: any) => {
            window.dispatchEvent(new CustomEvent('explorer-refresh', {
                detail: { path: event.payload },
            }));
        });

        window.addEventListener('go-to-line', handleGoToLine);

        const unlistenFocus = await listen("tauri://focus", () => {
            queueRedraw();
        });

        return () => {
            unlistenParserReady();
            unlistenFileChanged();
            unlistenFileSaved();
            unlistenFocus();
            window.removeEventListener('go-to-line', handleGoToLine);
        };
    }

    $effect(() => {
        if (filePath && filePath !== currentFilePath) {
            resetAndLoad(filePath);
        }
    });
    
    function resetAndLoad(path: string) {
        console.trace("[EditorBuffer] resetAndLoad called for:", path);
        lineCache.clear();
        highlightManager.reset();
        undoStack = [];
        redoStack = [];
    
        totalLines = 0;
        currentScrollTop = 0;
        vimMode = vimModeEnabled ? "normal" : "insert";
        commandLine = "";
        visualAnchor = null;
        pendingCount = "";
        pendingOperator = null;
        pendingSequence = "";
        syncVimStatus();

        // Phase 4: discard stale OffscreenCanvas pool
        chunkRenderer.clear();
        // Phase 5: discard stale metrics (font may change between files)
        metricsCache.invalidateAll();
        // Soft wrap: recompute for new file
        wrapLayoutDirty = true;
        // Phase 3 bridge: close previous document (no-op if not open)
        void docBridge.close();
        // Cancel any pending debounced highlight from the previous file.
        highlightManager.cancelPendingDebounce();
        // Diff: reset all diff state for the new file (keeps onDiffReady callbacks)
        diffScheduler.reset();
        viewportDiffCache.clear();
        hunkManager.clear();
        scrollbarHunks = [];
        previewEngine.clearCache();
        hunkPreviewVisible = false;
    
        if (scrollContainer) scrollContainer.scrollTop = 0;

        // Restore keyboard focus so the user can type immediately after
        // the buffer is (re-)loaded.
        if (editorContainer) editorContainer.focus();
    
        currentFilePath = path;
    
        fetchTotalLines().then(async () => {
            await highlightManager.refreshHighlightAvailability();
            void fetchBlame();

            // Fetch git HEAD and full file content in parallel so that when
            // initBaseline schedules its forced diff, lineCache is already
            // populated with the real file content → accurate overview ruler
            // markers from the very first diff instead of an empty/partial result.
            const repoPath = path.substring(0, path.lastIndexOf('/'));
            const [headResult, contentResult] = await Promise.allSettled([
                invoke<string>('get_file_head_content', { repoPath, filePath: path }),
                invoke<string>('read_file', { path }),
            ]);

            // Pre-populate lineCache so the first diff sees the full file.
            if (contentResult.status === 'fulfilled') {
                const normalised = contentResult.value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                savedContent = normalised;
                isDirty = false;
                lspVersion = 1;
                void lspOpenDocument(language, path, contentResult.value);
                const allLines = normalised.split('\n');
                allLines.forEach((line, i) => {
                    if (!lineCache.has(i)) lineCache.set(i, line);
                });
            } else {
                console.warn('[LSP] Could not open document:', contentResult.reason);
            }

            // Diff: update scheduler snapshot and init baseline.
            // Because lineCache is fully populated above, the forced diff that
            // initBaseline schedules will produce accurate hunk data for the
            // entire file — no more "markers change while scrolling" artefact.
            diffScheduler.updateCurrentContent(lineCache, totalLines);
            const headContent = headResult.status === 'fulfilled' ? headResult.value : '';
            diffScheduler.initBaseline(headContent, path);

            // Phase 3 bridge: open backend document for AST-based highlighting
            const firstChunkLines: string[] = [];
            for (let i = 0; i < Math.min(CHUNK_SIZE, totalLines); i++) {
                firstChunkLines.push(lineCache.get(i) ?? '');
            }
            void docBridge.open(path, firstChunkLines.join('\n'), language);

            const visibleLines = Math.ceil(scrollContainer?.clientHeight ?? 600 / editorLineHeight);
            const chunksNeeded = Math.ceil((visibleLines * 3) / CHUNK_SIZE);
    
            for (let i = 0; i < chunksNeeded; i++) {
                const lineIdx = i * CHUNK_SIZE;
                if (lineIdx < totalLines) highlightManager.fetchChunk(lineIdx);
            }
        });
    }
    
    function handleMouseMove(e: MouseEvent) {
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const scrollPos = currentScrollTop;
        const line = Math.floor((y + scrollPos) / editorLineHeight);

        mouseX = x;
        if (line !== mouseLine) {
            mouseLine = line >= 0 && line < totalLines ? line : null;
            queueRedraw();
        }

        // Diff: show hunk preview popup when hovering the gutter decoration bar
        if (x <= gutterWidth + 4 && mouseLine !== null && viewportDiffCache.hasDecorations) {
            const hunk = hunkManager.getHunkAtLine(mouseLine);
            if (hunk) {
                const baselineLines = diffScheduler.baselineManager.getLines();
                const currentLines  = Array.from(
                    { length: totalLines },
                    (_, i) => lineCache.get(i) ?? (baselineLines[i] ?? '')
                );
                const preview = previewEngine.getPreview(hunk, baselineLines, currentLines);
                hunkPreviewHTML    = HunkPreviewEngine.toHTML(preview);
                hunkPreviewScreenX = e.clientX + 16;
                hunkPreviewScreenY = Math.min(e.clientY, window.innerHeight - 220);
                hunkPreviewVisible = true;
            } else {
                hunkPreviewVisible = false;
            }
        } else {
            hunkPreviewVisible = false;
        }
    }

    function handleMouseLeave() {
        mouseLine = null;
        hunkPreviewVisible = false;
        queueRedraw();
    }

    onMount(() => {
        requestAnimationFrame(draw);
        startFetchLoop();
        // Only load here if the $effect below hasn't already loaded (order of
        // $effect vs onMount in Svelte 5 is not guaranteed on first render).
        if (!currentFilePath) {
            resetAndLoad(filePath);
        }

        editorContainer?.focus();

        // Diff: subscribe to incremental diff results
        const unsubDiff = diffScheduler.onDiffReady((result: LineDiffResult) => {
            diffInvalidator.applyDiff(result, chunkRenderer);
            if (scrollContainer) {
                const startLine = Math.floor(currentScrollTop / editorLineHeight);
                const endLine   = startLine + Math.ceil(scrollContainer.clientHeight / editorLineHeight) + 2;
                viewportDiffCache.update(result, startLine, endLine);
            }
            hunkManager.update(result, diffScheduler.baselineManager.getLines());
            scrollbarHunks = hunkManager.getHunks();
            queueRedraw();
        });

        const resizeObserver = new ResizeObserver(() => {
            wrapLayoutDirty = true;
            queueRedraw();
        });
        if (canvas) resizeObserver.observe(canvas);

        invoke("watch_directory", {
            path: filePath.substring(0, filePath.lastIndexOf("/")),
        }).catch((e) => console.error("Failed to start directory watcher:", e));

        let cleanupListeners: (() => void) | null = null;
        void setupEventListeners().then((cleanup) => { cleanupListeners = cleanup; });

        return () => {
            cancelAnimationFrame(fetchLoopId);
            resizeObserver.disconnect();
            unsubDiff();
            diffScheduler.dispose();
            cleanupListeners?.();
            void docBridge.close();
            void lspCloseDocument(language, filePath);
            if (saveDebounceHandle !== null) clearTimeout(saveDebounceHandle);
        };
    });
</script>

<div
    bind:this={editorContainer}
    class="relative h-full w-full flex flex-col font-mono text-sm overflow-hidden"
    data-buffer-ui
    data-vim-mode={vimMode}
    role="textbox"
    aria-label="Code editor"
    aria-multiline="true"
    style="
        background: {editorBgColor};
        font-family: {editorFontFamily};
        --eb-bg: {editorBgColor};
        --eb-scrollbar-thumb: {editorScrollbarThumb};
        --eb-scrollbar-hover: {editorFgColor};
    "
    onkeydown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "s") {
            e.preventDefault();
            void saveFile();
        } else {
            void handleEditorKeyDown(e);
        }
    }}
    tabindex="0"
>
    <!-- File Info (top-right) -->
    <EditorFileInfo {filePath} {isDirty} {totalLines} />

    <!-- Main Editor Area -->
    <div class="flex-1 min-h-0 relative overflow-hidden">
        <canvas
            bind:this={canvas}
            class="absolute inset-0 w-full h-full pointer-events-none"
        ></canvas>
    
        <div
            class="absolute inset-0 min-h-0 overflow-auto custom-scrollbar z-10 outline-none bg-transparent cursor-text"
            bind:this={scrollContainer}
            role="presentation"
            onscroll={handleScroll}
            onmousedown={handleClick}
            onmousemove={handleMouseMove}
            onmouseleave={handleMouseLeave}
        >
            <div
                class="pointer-events-none w-full"
                style="height: {(softWrapEnabled ? visualRowCount : totalLines) * editorLineHeight}px"
            ></div>
        </div>

        <!-- Diff markers overlay on vertical scrollbar track -->
        <div class="scrollbar-diff-overlay" aria-hidden="true">
            <!--
                Render non-deleted hunks first, deleted last.
                Deleted hunks (red) share the same topPct as their paired
                added/modified hunk → deleted must be on top so it is visible.
            -->
            {#each [false, true] as renderDeleted}
                {#each scrollbarHunks as hunk, i (renderDeleted ? 'd' + i : 'a' + i)}
                    {#if (hunk.status === 'deleted') === renderDeleted}
                        {@const anchorLine = hunk.status === 'deleted' ? hunk.afterLine + 1 : hunk.newStart}
                        {@const spanLines  = hunk.status === 'deleted' ? 1 : (hunk.newEnd - hunk.newStart)}
                        {@const topPct     = (anchorLine / totalLines) * 100}
                        {@const heightPct  = Math.max(spanLines / totalLines * 100, 0.4)}
                        {@const color      = DIFF_COLORS[hunk.status]}
                        <div
                            class="scrollbar-diff-mark"
                            style="top:{topPct}%;height:{heightPct}%;background:{color};"
                            role="button"
                            tabindex="-1"
                            aria-label="Jump to {hunk.status} hunk"
                            onpointerdown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (scrollContainer) {
                                    const targetY = anchorLine * editorLineHeight - scrollContainer.clientHeight / 2;
                                    scrollContainer.scrollTop = Math.max(0, targetY);
                                }
                            }}
                        ></div>
                    {/if}
                {/each}
            {/each}
        </div>
    </div>

    {#if vimMode === "command"}
        <div class="pointer-events-none absolute bottom-8 left-0 right-0 z-40 flex items-center border-t border-white/5 bg-black/50 px-4 py-1 font-mono text-[12px] text-zinc-200 backdrop-blur-md">
            <span class="mr-2 text-emerald-400">:</span>
            <span>{commandLine}</span>
        </div>
    {/if}

    <!-- Diff hunk preview popup (fixed so it escapes overflow-hidden containers) -->
    {#if hunkPreviewVisible}
        <div
            class="diff-hunk-preview"
            style="top: {hunkPreviewScreenY}px; left: {hunkPreviewScreenX}px"
            aria-hidden="true"
        >
            {@html hunkPreviewHTML}
        </div>
    {/if}

</div>

<style>
    .custom-scrollbar::-webkit-scrollbar {
        width: 12px;
        height: 12px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
        background: transparent;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
        background: var(--eb-scrollbar-thumb, #1a1a1a);
        border-radius: 6px;
        border: 3px solid var(--eb-bg, #0d0d0d);
    }
    .custom-scrollbar:hover::-webkit-scrollbar-thumb {
        background: var(--eb-scrollbar-hover, #3a3a3a);
        opacity: 0.5;
    }

    /* ── Scrollbar diff markers overlay ─────────────────────────────────────── */
    /*
     * z-index 11: just above the scrollContainer (z-index 10) so markers render
     * on the track, but below the native scrollbar thumb which the browser always
     * paints last inside its own stacking context.
     * pointer-events: none on the container → only the marks themselves are interactive.
     */
    .scrollbar-diff-overlay {
        position: absolute;
        top: 0;
        right: 0;
        width: 12px;
        height: 100%;
        pointer-events: none;
        z-index: 11;
        background: var(--eb-bg, #0d0d0d);
    }
    .scrollbar-diff-mark {
        position: absolute;
        left: 1px;
        right: 1px;
        min-height: 2px;
        border-radius: 2px;
        opacity: 0.9;
        pointer-events: auto;
        cursor: pointer;
        transition: none;
    }
    .scrollbar-diff-mark:hover {
        opacity: 1;
        left: 0;
        right: 0;
    }

    /* ── Diff hunk preview popup ─────────────────────────────────────────────── */
    .diff-hunk-preview {
        position: fixed;
        z-index: 9999;
        background: var(--eb-bg, #161616);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        padding: 4px 0;
        pointer-events: none;
        min-width: 280px;
        max-width: 560px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.7);
        overflow: hidden;
        font-family: monospace;
        font-size: 12px;
        line-height: 1.6;
    }

    :global(.diff-preview-container) {
        display: flex;
        flex-direction: column;
    }
    :global(.diff-preview-line) {
        display: flex;
        align-items: baseline;
        padding: 0 8px;
        white-space: pre;
    }
    :global(.diff-preview-added) {
        background: rgba(78, 201, 78, 0.12);
        color: #7ddd7d;
    }
    :global(.diff-preview-deleted) {
        background: rgba(224, 82, 82, 0.12);
        color: #e07777;
    }
    :global(.diff-preview-lineno) {
        color: #444;
        min-width: 2.8em;
        text-align: right;
        margin-right: 10px;
        flex-shrink: 0;
        font-size: 11px;
        user-select: none;
    }
    :global(.diff-preview-text) {
        white-space: pre;
        color: #ccc;
    }
    :global(.diff-preview-added .diff-preview-text) {
        color: #7ddd7d;
    }
    :global(.diff-preview-deleted .diff-preview-text) {
        color: #e07777;
    }
</style>
