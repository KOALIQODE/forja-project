<script lang="ts">
    import { invoke } from "@tauri-apps/api/core";
    import { untrack, onMount } from "svelte";
    import { get } from "svelte/store";
    import { listen } from "@tauri-apps/api/event"; 

    import { EDITOR_CONFIG, TOKEN_COLORS } from "$lib/utils/constants";
    import { ChunkRenderer } from "$lib/utils/ChunkRenderer";
    import { TextMetricsCache } from "$lib/utils/TextMetricsCache";
    import { WrapLayout } from "$lib/utils/WrapLayout";
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
    import { bracketRangesToColors } from "$lib/utils/themeEngine";

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
    let register = $state<VimRegister>({ text: "", linewise: false });
    let lastFindChar = $state("");
    let lastFindMotion = $state<"f" | "F" | "t" | "T" | "">(""); 

    // ── Bracket pair colorizer state ─────────────────────────────────────────────
    let bracketColors = $state<Array<{ start: number; finish: number; color: string }>>([]);
    let bracketUpdateHandle: ReturnType<typeof setTimeout> | null = null;

    // ── Reactive theme colors (canvas uses these instead of hardcoded values) ─────
    let editorBgColor = $derived($activeTheme?.colors?.bg ?? '#0d0d0d');
    let currentTokenColors = $derived.by(() => {
        const s = $activeTheme?.syntax;
        if (!s) return TOKEN_COLORS;
        return {
            ...TOKEN_COLORS,
            Keyword:     s.keyword       ?? TOKEN_COLORS.Keyword,
            Function:    s.function_name ?? TOKEN_COLORS.Function,
            Type:        s.type          ?? TOKEN_COLORS.Type,
            String:      s.string        ?? TOKEN_COLORS.String,
            Comment:     s.comment       ?? TOKEN_COLORS.Comment,
            Number:      s.number        ?? TOKEN_COLORS.Number,
            Punctuation: s.punctuation   ?? TOKEN_COLORS.Punctuation,
            Operator:    s.operator      ?? TOKEN_COLORS.Operator,
            Variable:    s.variable      ?? TOKEN_COLORS.Variable,
            Constant:    s.constant      ?? TOKEN_COLORS.Constant,
            Attribute:   s.attribute     ?? TOKEN_COLORS.Attribute,
        };
    });

    // Redraw canvas when theme changes — also invalidate chunk cache so syntax colors update
    $effect(() => {
        const _ = currentTokenColors;
        const __ = editorBgColor;
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

    /** Rebuild bracket color ranges from the current buffer (debounced 400ms).
     *
     * Text source priority:
     *  1. All lines in lineCache → use cache directly (reflects unsaved edits).
     *  2. File is clean (not dirty) but cache is incomplete (large file, not fully
     *     scrolled) → read full content from disk for complete bracket analysis.
     *  3. File is dirty and cache is incomplete → use cache as-is; brackets in
     *     unloaded lines won't be colored (acceptable tradeoff for large dirty files).
     */
    function scheduleBracketUpdate() {
        if (bracketUpdateHandle !== null) clearTimeout(bracketUpdateHandle);
        bracketUpdateHandle = setTimeout(async () => {
            bracketUpdateHandle = null;
            try {
                let text: string;
                const allCached = lineCache.size >= totalLines;

                if (allCached) {
                    const lines: string[] = [];
                    for (let i = 0; i < totalLines; i++) lines.push(lineCache.get(i) ?? "");
                    text = lines.join("\n");
                } else if (!isDirty) {
                    // Large clean file: read full content from disk for complete analysis.
                    text = await invoke<string>("read_file", { path: filePath });
                } else {
                    // Large dirty file: use partial cache (only loaded lines are available).
                    const lines: string[] = [];
                    for (let i = 0; i < totalLines; i++) lines.push(lineCache.get(i) ?? "");
                    text = lines.join("\n");
                }

                if (!text.trim()) return;
                const ranges = await pluginRunBracketProviders(text, language);
                console.log("[bracket] ranges:", ranges.length, "lang:", language, "textLen:", text.length);
                bracketRanges.set(ranges);
                // Use theme palette if available, otherwise fall back to built-in colors
                const palette = get(activeTheme)?.brackets?.length
                    ? get(activeTheme)!.brackets
                    : ["#f7768e", "#e0af68", "#9ece6a", "#7aa2f7", "#bb9af7", "#2ac3de"];
                bracketColors = bracketRangesToColors(ranges, palette);
                queueRedraw();
            } catch (e) {
                console.warn("[bracket] update failed:", e);
            }
        }, 400);
    }

    let lineCache = new Map<number, string>();
    let tokenCache = new Map<number, Token[]>();
    let highlightEnabled = $state(false);

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

    interface CursorPosition {
        line: number;
        char: number;
    }

    interface EditorSnapshot {
        lineCache: Map<number, string>;
        totalLines: number;
        cursorLine: number;
        cursorChar: number;
    }

    interface VimRegister {
        text: string;
        linewise: boolean;
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
        const next = new Map<number, Diagnostic>();
        // severity priority: error > warning > info > hint
        const order: Record<string, number> = { error: 0, warning: 1, info: 2, hint: 3 };
        for (const d of fileDiagnostics) {
            const existing = next.get(d.line);
            if (!existing || order[d.severity] < order[existing.severity]) {
                next.set(d.line, d);
            }
        }
        diagByLine = next;
        queueRedraw();
    });

    function getLine(line: number): string {
        return lineCache.get(line) ?? "";
    }

    function setLine(line: number, text: string) {
        lineCache.set(line, text);
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
        tokenCache.clear();
        pendingChunks.clear();

        // Rebuild loadedChunks from the restored lineCache instead of clearing it
        // entirely. The snapshot contains the full in-memory content, so any chunk
        // whose lines are already present can be marked as loaded — this avoids a
        // re-fetch from disk that would produce stale content for highlighting.
        loadedChunks.clear();
        const totalChunks = Math.ceil(totalLines / CHUNK_SIZE);
        for (let chunkId = 0; chunkId < totalChunks; chunkId++) {
            if (getCachedLinesForChunk(chunkId) !== null) loadedChunks.add(chunkId);
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
            const bridgeProduced = await highlightViewportViaDocBridge();
            if (!bridgeProduced && highlightEnabled) {
                void rehighlightLoadedChunks();
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

    function comparePositions(a: CursorPosition, b: CursorPosition) {
        if (a.line !== b.line) return a.line - b.line;
        return a.char - b.char;
    }

    function sortPositions(a: CursorPosition, b: CursorPosition): [CursorPosition, CursorPosition] {
        return comparePositions(a, b) <= 0 ? [a, b] : [b, a];
    }

    function clonePosition(position: CursorPosition): CursorPosition {
        return { line: position.line, char: position.char };
    }

    function currentPosition(): CursorPosition {
        return { line: cursorLine, char: cursorChar };
    }

    function lineLength(line: number) {
        return getLine(line).length;
    }

    function clampLine(line: number) {
        return Math.max(0, Math.min(line, Math.max(totalLines - 1, 0)));
    }

    function clampChar(line: number, char: number) {
        return Math.max(0, Math.min(char, lineLength(line)));
    }

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

    function advancePosition(position: CursorPosition): CursorPosition | null {
        const text = getLine(position.line);
        if (position.char < text.length) {
            return { line: position.line, char: position.char + 1 };
        }
        if (position.line < totalLines - 1) {
            return { line: position.line + 1, char: 0 };
        }
        return null;
    }

    function retreatPosition(position: CursorPosition): CursorPosition | null {
        if (position.char > 0) {
            return { line: position.line, char: position.char - 1 };
        }
        if (position.line > 0) {
            return { line: position.line - 1, char: lineLength(position.line - 1) };
        }
        return null;
    }

    function charAt(position: CursorPosition) {
        const text = getLine(position.line);
        if (position.char < text.length) {
            return text[position.char];
        }
        return position.line < totalLines - 1 ? "\n" : "";
    }

    function isWordChar(char: string) {
        return /[A-Za-z0-9_]/.test(char);
    }

    function isWhitespace(char: string) {
        return /\s/.test(char);
    }

    function findNextWordStart(from: CursorPosition, count = 1): CursorPosition {
        let current = clonePosition(from);

        for (let iteration = 0; iteration < count; iteration++) {
            let walker = clonePosition(current);
            const firstChar = charAt(walker);
            const firstIsWord = isWordChar(firstChar);

            while (true) {
                const next = advancePosition(walker);
                if (!next) {
                    return current;
                }
                walker = next;
                const char = charAt(walker);
                if (!char) {
                    return current;
                }
                if (firstIsWord) {
                    if (!isWordChar(char)) break;
                } else if (!isWhitespace(char)) {
                    break;
                }
            }

            while (isWhitespace(charAt(walker))) {
                const next = advancePosition(walker);
                if (!next) break;
                walker = next;
            }

            current = walker;
        }

        return current;
    }

    function findPreviousWordStart(from: CursorPosition, count = 1): CursorPosition {
        let current = clonePosition(from);

        for (let iteration = 0; iteration < count; iteration++) {
            let walker = retreatPosition(current);
            if (!walker) {
                return { line: 0, char: 0 };
            }

            while (walker && isWhitespace(charAt(walker))) {
                walker = retreatPosition(walker);
            }

            if (!walker) {
                return { line: 0, char: 0 };
            }

            const categoryIsWord = isWordChar(charAt(walker));
            while (true) {
                const previous = retreatPosition(walker);
                if (!previous) break;
                const char = charAt(previous);
                if (categoryIsWord ? !isWordChar(char) : isWhitespace(char) || isWordChar(char)) {
                    break;
                }
                walker = previous;
            }

            if (categoryIsWord) {
                while (true) {
                    const previous = retreatPosition(walker);
                    if (!previous || !isWordChar(charAt(previous))) break;
                    walker = previous;
                }
            }

            current = walker;
        }

        return current;
    }

    function findWordEnd(from: CursorPosition, count = 1): CursorPosition {
        let current = clonePosition(from);

        for (let iteration = 0; iteration < count; iteration++) {
            let walker = clonePosition(current);
            while (isWhitespace(charAt(walker))) {
                const next = advancePosition(walker);
                if (!next) return walker;
                walker = next;
            }

            const categoryIsWord = isWordChar(charAt(walker));
            while (true) {
                const next = advancePosition(walker);
                if (!next) break;
                const nextChar = charAt(next);
                if (categoryIsWord ? !isWordChar(nextChar) : isWhitespace(nextChar) || isWordChar(nextChar)) {
                    break;
                }
                walker = next;
            }

            current = walker;
            if (iteration < count - 1) {
                const next = advancePosition(current);
                if (!next) break;
                current = next;
            }
        }

        return current;
    }

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

    function findCharForward(ch: string, count: number, stop = false): number {
        const line = getLine(cursorLine);
        let found = 0;
        for (let i = cursorChar + 1; i < line.length; i++) {
            if (line[i] === ch) {
                found++;
                if (found === count) {
                    return stop ? i - 1 : i;
                }
            }
        }
        return cursorChar;
    }

    function findCharBackward(ch: string, count: number, stop = false): number {
        const line = getLine(cursorLine);
        let found = 0;
        for (let i = cursorChar - 1; i >= 0; i--) {
            if (line[i] === ch) {
                found++;
                if (found === count) {
                    return stop ? i + 1 : i;
                }
            }
        }
        return cursorChar;
    }

    function findMatchingBracket(line: number, char: number): CursorPosition | null {
        const open = "({[";
        const close = ")}]";
        const lineText = getLine(line);
        const startCh = lineText[char];
        const isOpen = open.includes(startCh);
        const matchCh = isOpen ? close[open.indexOf(startCh)] : open[close.indexOf(startCh)];
        let depth = 0;
        if (isOpen) {
            for (let l = line; l < totalLines; l++) {
                const text = getLine(l);
                const startC = l === line ? char : 0;
                for (let c = startC; c < text.length; c++) {
                    if (text[c] === startCh) depth++;
                    else if (text[c] === matchCh) {
                        depth--;
                        if (depth === 0) return { line: l, char: c };
                    }
                }
            }
        } else {
            for (let l = line; l >= 0; l--) {
                const text = getLine(l);
                const startC = l === line ? char : text.length - 1;
                for (let c = startC; c >= 0; c--) {
                    if (text[c] === startCh) depth++;
                    else if (text[c] === matchCh) {
                        depth--;
                        if (depth === 0) return { line: l, char: c };
                    }
                }
            }
        }
        return null;
    }

    function getTextObjectRange(
        type: "i" | "a",
        obj: string,
    ): { start: CursorPosition; end: CursorPosition } | null {
        if (obj === "w" || obj === "W") {
            const line = getLine(cursorLine);
            const testFn: (c: string) => boolean = obj === "W"
                ? (c) => !/\s/.test(c)
                : isWordChar;
            let start = cursorChar;
            while (start > 0 && testFn(line[start - 1])) start--;
            let end = cursorChar;
            while (end < line.length && testFn(line[end])) end++;
            if (type === "a") {
                while (end < line.length && /\s/.test(line[end])) end++;
            }
            return {
                start: { line: cursorLine, char: start },
                end: { line: cursorLine, char: end },
            };
        }

        const pairs: Record<string, [string, string]> = {
            "(": ["(", ")"], ")": ["(", ")"],
            "[": ["[", "]"], "]": ["[", "]"],
            "{": ["{", "}"], "}": ["{", "}"],
            "<": ["<", ">"], ">": ["<", ">"],
            '"': ['"', '"'],
            "'": ["'", "'"],
            "`": ["`", "`"],
        };

        const pair = pairs[obj];
        if (!pair) return null;

        const [openCh, closeCh] = pair;
        const samePair = openCh === closeCh;

        let openLine = cursorLine, openChar = -1;
        let closeLinePos = cursorLine, closeChar = -1;

        if (samePair) {
            const line = getLine(cursorLine);
            for (let i = 0; i < line.length; i++) {
                if (line[i] === openCh && i < cursorChar) {
                    openChar = i;
                }
            }
            for (let i = cursorChar; i < line.length; i++) {
                if (line[i] === openCh && i > openChar) {
                    closeChar = i;
                    break;
                }
            }
            if (openChar < 0 || closeChar < 0) return null;
            openLine = cursorLine; closeLinePos = cursorLine;
        } else {
            for (let l = cursorLine; l >= 0; l--) {
                const line = getLine(l);
                const startC = l === cursorLine ? cursorChar : line.length - 1;
                for (let c = startC; c >= 0; c--) {
                    if (line[c] === openCh) {
                        openLine = l; openChar = c; break;
                    }
                }
                if (openChar >= 0) break;
            }
            if (openChar < 0) return null;
            let depth = 0;
            for (let l = openLine; l < totalLines; l++) {
                const line = getLine(l);
                const startC = l === openLine ? openChar : 0;
                for (let c = startC; c < line.length; c++) {
                    if (line[c] === openCh) depth++;
                    else if (line[c] === closeCh) {
                        depth--;
                        if (depth === 0) {
                            closeLinePos = l; closeChar = c; break;
                        }
                    }
                }
                if (closeChar >= 0) break;
            }
            if (closeChar < 0) return null;
        }

        if (type === "i") {
            return {
                start: { line: openLine, char: openChar + 1 },
                end: { line: closeLinePos, char: closeChar },
            };
        } else {
            return {
                start: { line: openLine, char: openChar },
                end: { line: closeLinePos, char: closeChar + 1 },
            };
        }
    }

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

    // ── Debounced syntax highlight scheduler ─────────────────────────────────────
    //
    // Syntax highlighting requires 1-2 Tauri IPC round-trips (apply_text_edit +
    // get_document_tokens). Firing these on every keystroke is wasteful — the text
    // is already redrawn immediately via queueRedraw(), so the highlight can safely
    // lag by a small amount without the user noticing.
    //
    // We debounce the refresh: the first edit after a pause fires immediately (via
    // RAF), subsequent edits during a burst are coalesced and fire once the user
    // stops typing for HIGHLIGHT_DEBOUNCE_MS.

    const HIGHLIGHT_DEBOUNCE_MS = 120;
    let highlightDebounceId: ReturnType<typeof setTimeout> | null = null;
    let highlightPendingChunk = -1; // chunk that needs re-highlight in the fallback path

    function scheduleHighlightRefresh(chunkId: number): void {
        // Always track the latest affected chunk so the eventual refresh targets it.
        highlightPendingChunk = chunkId;

        if (highlightDebounceId !== null) {
            clearTimeout(highlightDebounceId);
        }
        highlightDebounceId = setTimeout(() => {
            highlightDebounceId = null;
            void refreshHighlightsAfterEdit(highlightPendingChunk);
            highlightPendingChunk = -1;
        }, HIGHLIGHT_DEBOUNCE_MS);
    }

    async function refreshHighlightsAfterEdit(chunkId: number) {
        // Phase 7: mark only the affected chunk dirty instead of rehighlighting everything
        chunkRenderer.markDirty(chunkId);

        if (docBridge.isOpen()) {
            // Phase 6: use backend AST for visible-range tokens (fast, incremental).
            // Falls back to highlight_syntax when the bridge returns no tokens
            // (e.g. no WASM grammar installed for this language).
            const bridgeProducedTokens = await highlightViewportViaDocBridge();
            if (!bridgeProducedTokens && highlightEnabled) {
                const lines = getCachedLinesForChunk(chunkId);
                if (lines) await highlightChunk(lines, chunkId * CHUNK_SIZE);
            }
        } else if (highlightEnabled) {
            // Fallback: rehighlight only the affected chunk
            const lines = getCachedLinesForChunk(chunkId);
            if (lines) await highlightChunk(lines, chunkId * CHUNK_SIZE);
        }
        queueRedraw();
    }

    function mutateDocument(mutation: () => void) {
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
        scheduleHighlightRefresh(editChunk);
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

    function getRangeText(start: CursorPosition, end: CursorPosition) {
        if (start.line === end.line) {
            return getLine(start.line).slice(start.char, end.char);
        }

        const parts = [getLine(start.line).slice(start.char)];
        for (let i = start.line + 1; i < end.line; i++) {
            parts.push(getLine(i));
        }
        parts.push(getLine(end.line).slice(0, end.char));
        return parts.join("\n");
    }

    async function deleteRange(start: CursorPosition, end: CursorPosition) {
        await mutateDocument(() => {
            const [from, to] = sortPositions(start, end);
            register = { text: getRangeText(from, to), linewise: false };

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

            register = { text: removed.join("\n"), linewise: true };
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
        register = { text: getRangeText(from, to), linewise: false };
    }

    function yankCurrentLine(count = 1) {
        const start = clampLine(cursorLine);
        const end = Math.min(totalLines - 1, start + count - 1);
        const lines: string[] = [];
        for (let i = start; i <= end; i++) {
            lines.push(getLine(i));
        }
        register = { text: lines.join("\n"), linewise: true };
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

    function getChunkBounds(chunkId: number) {
        const start = chunkId * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE - 1, totalLines - 1);
        return { start, end };
    }

    function getCachedLinesForChunk(chunkId: number): string[] | null {
        const { start, end } = getChunkBounds(chunkId);
        const lines: string[] = [];

        for (let i = start; i <= end; i++) {
            const line = lineCache.get(i);
            if (line === undefined) {
                return null;
            }

            lines.push(line);
        }

        return lines;
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

    let loadedChunks = new Set<number>();
    
    async function fetchChunk(lineIdx: number) {
        const chunkId = Math.floor(lineIdx / CHUNK_SIZE);
    
        if (loadedChunks.has(chunkId) || pendingChunks.has(chunkId)) return;
    
        pendingChunks.add(chunkId);
    
        const { start, end } = getChunkBounds(chunkId);
    
        try {
            const fetched = await invoke<string[]>("read_file_lines", {
                path: filePath,
                startLine: start,
                endLine: end,
            });

            // Only populate lines that aren't already in lineCache.
            // In-memory edits (set via mutateDocument) take priority over stale
            // backend content that arrives asynchronously after the edit.
            fetched.forEach((line, idx) => {
                const lineNum = start + idx;
                if (!lineCache.has(lineNum)) {
                    lineCache.set(lineNum, line);
                }
            });
            
            console.log("chunk loaded", {
                chunkId,
                start,
                end,
                fetched: fetched.length
            });
    
            if (highlightEnabled) {
                const ok = await highlightChunk(fetched, start);
    
                if (!ok) {
                    highlightEnabled = false;
                    tokenCache.clear();
                }
            }
    
            loadedChunks.add(chunkId);
            wrapLayoutDirty = true;
            // Phase 4: new lines loaded → mark chunk canvas as needing re-render
            chunkRenderer.markDirty(chunkId);
            // Diff: update the line snapshot so the next real edit gets accurate data,
            // but do NOT schedule a new diff here — chunk loading is not a user edit,
            // and re-running diff on every scroll-triggered chunk load causes the
            // overview-ruler markers to jump as unloaded lines shift from "baseline" to real.
            diffScheduler.updateCurrentContent(lineCache, totalLines);
            queueRedraw();
    
        } catch (e) {
            console.error("Chunk Fetch Error:", e);
        } finally {
            pendingChunks.delete(chunkId);
        }
    }

    async function highlightChunk(lines: string[], start: number): Promise<boolean> {
        try {
            const result = await invoke<SyntaxHighlight>("highlight_syntax", {
                content: lines.join("\n"),
                language,
            });
    
            if (!result || !Array.isArray(result.tokens) || result.used_fallback) {
                console.warn("Invalid syntax highlight response");
                return false;
            }
    
            let lineIdx = start;
            let currentTokens: Token[] = [];
    
            for (const token of result.tokens) {
                if (!token || typeof token.text !== "string") continue;
    
                const parts = token.text.split("\n");
    
                for (let i = 0; i < parts.length; i++) {
                    currentTokens.push({
                        text: parts[i],
                        token_type: token.token_type || "Unknown",
                    });
    
                    if (i < parts.length - 1) {
                        tokenCache.set(lineIdx, currentTokens);
                        currentTokens = [];
                        lineIdx++;
                    }
                }
            }
    
            if (currentTokens.length > 0) {
                tokenCache.set(lineIdx, currentTokens);
            }
    
            return true;
        } catch (e) {
            console.warn("Highlight failed, fallback to plain text:", e);
            return false;
        }
    }

    /**
     * Phase 3 / Phase 6 — highlights only the visible viewport using the backend AST.
     * Much cheaper than rehighlighting all loaded chunks: only N visible lines are queried.
     *
     * Returns true only if the bridge actually produced tokens. Lines inside the
     * visible range that the bridge has no data for get their stale tokenCache
     * entries removed so the canvas falls back to plain-text rendering from
     * lineCache (instead of showing outdated highlighted text after an edit).
     */
    async function highlightViewportViaDocBridge(): Promise<boolean> {
        if (!docBridge.isOpen() || !canvas || !scrollContainer) return false;
        const startLine = Math.floor(currentScrollTop / editorLineHeight);
        const endLine = Math.min(
            startLine + Math.ceil(scrollContainer.clientHeight / editorLineHeight) + 2,
            totalLines - 1
        );
        const lineTokens = await docBridge.getTokensForRange(startLine, endLine, lineCache);
        if (!lineTokens) return false;

        // Apply fresh tokens and evict stale tokens for lines the bridge has
        // no data for (e.g. no WASM grammar installed, or no matching node).
        // Without this, old tokenCache entries shadow lineCache edits.
        for (let i = startLine; i <= endLine; i++) {
            const tokens = lineTokens.get(i);
            if (tokens !== undefined) {
                tokenCache.set(i, tokens);
                chunkRenderer.markDirty(Math.floor(i / CHUNK_SIZE));
            } else {
                tokenCache.delete(i);
            }
        }

        return lineTokens.size > 0;
    }

    async function rehighlightLoadedChunks(): Promise<boolean> {
        tokenCache.clear();

        for (const chunkId of [...loadedChunks].sort((a, b) => a - b)) {
            const lines = getCachedLinesForChunk(chunkId);
            if (!lines) continue;

            const ok = await highlightChunk(lines, chunkId * CHUNK_SIZE);
            if (!ok) {
                highlightEnabled = false;
                tokenCache.clear();
                queueRedraw();
                return false;
            }
        }

        queueRedraw();
        return true;
    }

    async function refreshHighlightAvailability(): Promise<boolean> {
        if (!language || language === "unknown") {
            highlightEnabled = false;
            tokenCache.clear();
            queueRedraw();
            return false;
        }

        try {
            // Fast path: native languages are always compiled into the binary.
            // No probe needed — just ask Rust if it knows this language.
            const isNative = await invoke<boolean>("is_native_language", { language });

            if (isNative) {
                highlightEnabled = true;
                return rehighlightLoadedChunks();
            }

            // Community WASM language: check if files are installed on disk
            const probe = await invoke<SyntaxHighlight>("highlight_syntax", {
                content: "x",
                language,
            });

            if (!probe || !Array.isArray(probe.tokens) || probe.used_fallback) {
                highlightEnabled = false;
                tokenCache.clear();
                queueRedraw();
                return false;
            }

            highlightEnabled = true;
            return rehighlightLoadedChunks();
        } catch (e) {
            console.warn("Highlight probe failed:", e);
            highlightEnabled = false;
            tokenCache.clear();
            queueRedraw();
            return false;
        }
    }

    let pendingChunks = new Set<number>(); // Needs to be declared outside `requestChunk`

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

        const frameStart = performance.now();
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();

        if (rect.width === 0 || rect.height === 0) {
            requestAnimationFrame(draw);
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
            requestAnimationFrame(draw);
            return;
        }

        needsRedraw = false;

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
                lastWrapCharWidth = charWidth;
                lastWrapContentWidth = contentWidth;
                wrapLayoutDirty = false;
                visualRowCount = wrapLayout.totalVisualRows;
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
                        ctx.fillStyle = "rgba(52, 211, 153, 0.08)";
                        ctx.fillRect(0, y - editorLineHeight / 2, rect.width, editorLineHeight);
                    }

                    if (i === mouseLine) {
                        ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
                        ctx.fillRect(0, y - editorLineHeight / 2, rect.width, editorLineHeight);
                    }

                    if (visualBounds) {
                        const [selectionStart, selectionEnd] = visualBounds;
                        if (i >= selectionStart.line && i <= selectionEnd.line) {
                            ctx.fillStyle = "rgba(52, 211, 153, 0.18)";
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
                    ctx.fillStyle = "rgba(52, 211, 153, 0.08)";
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
                        ctx.fillStyle = "rgba(52, 211, 153, 0.18)";
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
            ctx.fillRect(0, markerY, gutterWidth, 3);
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
                            ctx.fillStyle = "#3a3a3a";
                            const lineNumberText = vimModeEnabled && vimMode !== "insert"
                                ? Math.abs(i - cursorLine).toString()
                                : (i + 1).toString();
                            ctx.fillText(lineNumberText, lineNumberX, rowY);
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
                                ctx.fillStyle = "rgba(52, 211, 153, 0.6)";
                                ctx.fillRect(cx, rowY - editorLineHeight / 2 + 2, charWidth, editorLineHeight - 4);
                                ctx.fillStyle = "#ffffff";
                                ctx.fillText(ch, cx, rowY);
                            } else {
                                ctx.fillStyle = "#34d399";
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
                    ctx.fillStyle = "#3a3a3a";
                    ctx.textAlign = "right";
                    const lineNumberText = vimModeEnabled && vimMode !== "insert"
                        ? Math.abs(i - cursorLine).toString()
                        : (i + 1).toString();
                    ctx.fillText(lineNumberText, lineNumberX, y);
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
                        ctx.fillStyle = "rgba(52, 211, 153, 0.6)";
                        ctx.fillRect(cursorX, y - editorLineHeight / 2 + 2, charWidth, editorLineHeight - 4);
                        ctx.fillStyle = "#ffffff";
                        ctx.fillText(char, cursorX, y);
                    } else {
                        ctx.fillStyle = "#34d399";
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
        lastFrameDuration = performance.now() - frameStart;

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
                let pairColor = "#34d399";
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

        requestAnimationFrame(draw);
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

    async function handleInsertModeKeyDown(e: KeyboardEvent, useVimEscape = true) {
        if (e.key === "Escape") {
            e.preventDefault();
            if (useVimEscape) {
                enterNormalMode(true);
            } else {
                (e.currentTarget as HTMLElement).blur();
            }
            return;
        }

        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Backspace", "Enter", "Tab"].includes(e.key)) {
            e.preventDefault();
        }

        if (e.key === "Enter") {
            await handleInsertEnter();
            return;
        }

        if (e.key === "Backspace") {
            await handleInsertBackspace();
            return;
        }

        if (e.key === "Tab") {
            await handleInsertCharacter("  ");
            return;
        }

        if (e.key === "ArrowLeft") {
            if (cursorChar > 0) {
                setCursor(cursorLine, cursorChar - 1);
            } else if (cursorLine > 0) {
                setCursor(cursorLine - 1, lineLength(cursorLine - 1));
            }
            return;
        }

        if (e.key === "ArrowRight") {
            if (cursorChar < lineLength(cursorLine)) {
                setCursor(cursorLine, cursorChar + 1);
            } else if (cursorLine < totalLines - 1) {
                setCursor(cursorLine + 1, 0);
            }
            return;
        }

        if (e.key === "ArrowUp") {
            setCursor(cursorLine - 1, cursorChar);
            return;
        }

        if (e.key === "ArrowDown") {
            setCursor(cursorLine + 1, cursorChar);
            return;
        }

        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            await handleInsertCharacter(e.key);
        }
    }

    async function handleCommandModeKeyDown(e: KeyboardEvent) {
        e.preventDefault();

        if (e.key === "Escape") {
            commandLine = "";
            enterNormalMode();
            return;
        }

        if (e.key === "Enter") {
            await executeCommandLine();
            return;
        }

        if (e.key === "Backspace") {
            commandLine = commandLine.slice(0, -1);
            syncVimStatus();
            queueRedraw();
            return;
        }

        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            commandLine += e.key;
            syncVimStatus();
            queueRedraw();
        }
    }

    async function handleVisualModeKeyDown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            e.preventDefault();
            enterNormalMode();
            return;
        }

        if (e.key === "y" || e.key === "d" || e.key === "c") {
            e.preventDefault();
            const range = getVisualRange();
            if (!range) {
                enterNormalMode();
                return;
            }

            if (e.key === "y") {
                yankRange(range[0], range[1]);
                enterNormalMode();
                return;
            }

            await deleteRange(range[0], range[1]);
            if (e.key === "c") {
                enterInsertMode();
            } else {
                enterNormalMode();
            }
            return;
        }

        if (e.key === "p" || e.key === "P") {
            e.preventDefault();
            const range = getVisualRange();
            if (range) {
                await deleteRange(range[0], range[1]);
            }
            await pasteRegister(e.key === "p");
            enterNormalMode();
            return;
        }

        if (e.key === "o") {
            e.preventDefault();
            if (visualAnchor) {
                const oldAnchor = clonePosition(visualAnchor);
                visualAnchor = currentPosition();
                setCursor(oldAnchor.line, oldAnchor.char);
            }
            return;
        }

        if (e.key === ">" || e.key === "<") {
            e.preventDefault();
            const visualRange = getVisualBounds();
            if (visualRange) {
                const [vStart, vEnd] = visualRange;
                await indentLines(vStart.line, vEnd.line, e.key === ">" ? 1 : -1);
            }
            enterNormalMode();
            return;
        }

        if (e.key === "~") {
            e.preventDefault();
            const visualRange = getVisualBounds();
            if (visualRange) {
                const [vStart, vEnd] = visualRange;
                await mutateDocument(() => {
                    for (let l = vStart.line; l <= vEnd.line; l++) {
                        const line = getLine(l);
                        const from = l === vStart.line ? vStart.char : 0;
                        const to = l === vEnd.line ? vEnd.char + 1 : line.length;
                        const toggled =
                            line.slice(0, from) +
                            line.slice(from, to).split("").map((c) =>
                                c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()
                            ).join("") +
                            line.slice(to);
                        setLine(l, toggled);
                    }
                });
            }
            enterNormalMode();
            return;
        }

        await handleNormalModeKeyDown(e);
    }

    async function handleNormalModeKeyDown(e: KeyboardEvent) {
        const key = e.key;

        if (key === "Escape") {
            e.preventDefault();
            enterNormalMode();
            return;
        }

        if (pendingOperator) {
            e.preventDefault();
            await applyPendingOperator(key);
            return;
        }

        if (pendingSequence === "r") {
            e.preventDefault();
            if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                await mutateDocument(() => {
                    const line = getLine(cursorLine);
                    if (cursorChar < line.length) {
                        setLine(cursorLine, line.slice(0, cursorChar) + key + line.slice(cursorChar + 1));
                    }
                });
            }
            clearPendingState();
            return;
        }

        if (pendingSequence === "z") {
            e.preventDefault();
            if (scrollContainer) {
                if (key === "z") {
                    scrollContainer.scrollTop = Math.max(0, cursorLine * editorLineHeight - scrollContainer.clientHeight / 2);
                } else if (key === "t") {
                    scrollContainer.scrollTop = cursorLine * editorLineHeight;
                } else if (key === "b") {
                    scrollContainer.scrollTop = Math.max(0, (cursorLine + 1) * editorLineHeight - scrollContainer.clientHeight);
                }
                queueRedraw();
            }
            clearPendingState();
            return;
        }

        if (pendingSequence === "f" || pendingSequence === "F" || pendingSequence === "t" || pendingSequence === "T") {
            e.preventDefault();
            if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                const cnt = getCount();
                const motion = pendingSequence as "f" | "F" | "t" | "T";
                lastFindChar = key;
                lastFindMotion = motion;
                if (motion === "f") setNormalCursor(cursorLine, findCharForward(key, cnt));
                else if (motion === "F") setNormalCursor(cursorLine, findCharBackward(key, cnt));
                else if (motion === "t") setNormalCursor(cursorLine, findCharForward(key, cnt, true));
                else if (motion === "T") setNormalCursor(cursorLine, findCharBackward(key, cnt, true));
            }
            clearPendingState();
            return;
        }

        if (pendingSequence === ">") {
            e.preventDefault();
            if (key === ">") {
                const cnt = getCount();
                await indentLines(cursorLine, Math.min(cursorLine + cnt - 1, totalLines - 1), 1);
            }
            clearPendingState();
            return;
        }

        if (pendingSequence === "<") {
            e.preventDefault();
            if (key === "<") {
                const cnt = getCount();
                await indentLines(cursorLine, Math.min(cursorLine + cnt - 1, totalLines - 1), -1);
            }
            clearPendingState();
            return;
        }

        if (pendingSequence === "g") {
            e.preventDefault();
            if (key === "g") {
                moveToFirstLine();
            }
            clearPendingState();
            return;
        }

        if (key >= "1" && key <= "9") {
            e.preventDefault();
            pendingCount += key;
            syncVimStatus();
            return;
        }

        if (key === "0" && pendingCount) {
            e.preventDefault();
            pendingCount += key;
            syncVimStatus();
            return;
        }

        const countPrefix = pendingCount;
        const hadCount = countPrefix !== "";
        const count = getCount();
        clearPendingState();

        if (e.ctrlKey && key === "r") {
            e.preventDefault();
            for (let i = 0; i < count; i++) redo();
            clearPendingState();
            return;
        }

        if (e.ctrlKey && (key === "d" || key === "u")) {
            e.preventDefault();
            if (scrollContainer) {
                const halfPage = Math.floor(scrollContainer.clientHeight / editorLineHeight / 2);
                const delta = key === "d" ? halfPage : -halfPage;
                const newLine = Math.max(0, Math.min(totalLines - 1, cursorLine + delta));
                setCursor(newLine, cursorChar);
                normalizeNormalCursor();
                ensureCursorVisible();
            }
            clearPendingState();
            return;
        }

        if (e.ctrlKey && (key === "f" || key === "b")) {
            e.preventDefault();
            if (scrollContainer) {
                const fullPage = Math.floor(scrollContainer.clientHeight / editorLineHeight) - 1;
                const delta = key === "f" ? fullPage : -fullPage;
                const newLine = Math.max(0, Math.min(totalLines - 1, cursorLine + delta));
                setCursor(newLine, cursorChar);
                normalizeNormalCursor();
                ensureCursorVisible();
            }
            clearPendingState();
            return;
        }

        switch (key) {
            case "0":
                e.preventDefault();
                moveCursorToLineStart();
                normalizeNormalCursor();
                break;
            case "^":
                e.preventDefault();
                moveCursorToFirstNonWhitespace();
                normalizeNormalCursor();
                break;
            case "$":
                e.preventDefault();
                moveCursorToLineEnd();
                break;
            case "h":
            case "ArrowLeft":
                e.preventDefault();
                moveHorizontalWrap(-count);
                break;
            case "l":
            case "ArrowRight":
                e.preventDefault();
                moveHorizontalWrap(count);
                break;
            case "j":
            case "ArrowDown":
                e.preventDefault();
                moveVertical(count);
                break;
            case "k":
            case "ArrowUp":
                e.preventDefault();
                moveVertical(-count);
                break;
            case "w": {
                e.preventDefault();
                const target = findNextWordStart(currentPosition(), count);
                setNormalCursor(target.line, target.char);
                break;
            }
            case "b": {
                e.preventDefault();
                const target = findPreviousWordStart(currentPosition(), count);
                setNormalCursor(target.line, target.char);
                break;
            }
            case "e": {
                e.preventDefault();
                const target = findWordEnd(currentPosition(), count);
                setNormalCursor(target.line, target.char);
                break;
            }
            case "g":
                e.preventDefault();
                pendingSequence = "g";
                syncVimStatus();
                break;
            case "G":
                e.preventDefault();
                if (hadCount) {
                    setNormalCursor(clampLine(count - 1), 0);
                } else {
                    moveToLastLine();
                }
                break;
            case "i":
                e.preventDefault();
                enterInsertMode();
                break;
            case "I":
                e.preventDefault();
                moveCursorToFirstNonWhitespace();
                enterInsertMode();
                break;
            case "a":
                e.preventDefault();
                setCursor(cursorLine, Math.min(cursorChar + 1, lineLength(cursorLine)));
                enterInsertMode();
                break;
            case "A":
                e.preventDefault();
                setCursor(cursorLine, lineLength(cursorLine));
                enterInsertMode();
                break;
            case "o":
                e.preventDefault();
                await insertNewLineBelow();
                break;
            case "O":
                e.preventDefault();
                await insertNewLineAbove();
                break;
            case "x":
                e.preventDefault();
                await deleteCharAtCursor(count);
                break;
            case "p":
                e.preventDefault();
                await pasteRegister(true);
                break;
            case "P":
                e.preventDefault();
                await pasteRegister(false);
                break;
            case "u":
                e.preventDefault();
                for (let i = 0; i < count; i++) undo();
                break;
            case "v":
                e.preventDefault();
                enterVisualMode();
                break;
            case ":":
                e.preventDefault();
                enterCommandMode();
                break;
            case "d":
                e.preventDefault();
                pendingCount = countPrefix;
                pendingOperator = "delete";
                pendingSequence = "d";
                syncVimStatus();
                break;
            case "c":
                e.preventDefault();
                pendingCount = countPrefix;
                pendingOperator = "change";
                pendingSequence = "c";
                syncVimStatus();
                break;
            case "y":
                e.preventDefault();
                pendingCount = countPrefix;
                pendingOperator = "yank";
                pendingSequence = "y";
                syncVimStatus();
                break;
            case "D":
                e.preventDefault();
                await deleteRange(currentPosition(), {
                    line: cursorLine,
                    char: lineLength(cursorLine),
                });
                break;
            case "C":
                e.preventDefault();
                await deleteRange(currentPosition(), {
                    line: cursorLine,
                    char: lineLength(cursorLine),
                });
                enterInsertMode();
                break;
            case "s":
                e.preventDefault();
                await deleteCharAtCursor(count);
                enterInsertMode();
                break;
            case "S":
                e.preventDefault();
                await mutateDocument(() => {
                    register = { text: getLine(cursorLine), linewise: false };
                    setLine(cursorLine, "");
                    cursorChar = 0;
                });
                enterInsertMode();
                break;
            case "J": {
                e.preventDefault();
                const joinCount = Math.max(count, 1);
                await mutateDocument(() => {
                    for (let n = 0; n < joinCount && cursorLine < totalLines - 1; n++) {
                        const cur = getLine(cursorLine);
                        const next = getLine(cursorLine + 1);
                        const joined = cur + (next.trimStart() ? " " + next.trimStart() : "");
                        setLine(cursorLine, joined);
                        shiftLinesUp(cursorLine + 1, 1);
                        totalLines--;
                        cursorChar = cur.length;
                    }
                });
                break;
            }
            case "~": {
                e.preventDefault();
                await mutateDocument(() => {
                    const line = getLine(cursorLine);
                    let newLine = line;
                    for (let i = 0; i < count && cursorChar + i < line.length; i++) {
                        const ch = line[cursorChar + i];
                        const toggled = ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase();
                        newLine = newLine.slice(0, cursorChar + i) + toggled + newLine.slice(cursorChar + i + 1);
                    }
                    setLine(cursorLine, newLine);
                    cursorChar = Math.min(cursorChar + count, Math.max(lineLength(cursorLine) - 1, 0));
                });
                break;
            }
            case "%": {
                e.preventDefault();
                const lineText = getLine(cursorLine);
                const openBrackets = "({[";
                const closeBrackets = ")}]";
                const ch = lineText[cursorChar];
                if (ch && (openBrackets.includes(ch) || closeBrackets.includes(ch))) {
                    const matchResult = findMatchingBracket(cursorLine, cursorChar);
                    if (matchResult) setNormalCursor(matchResult.line, matchResult.char);
                }
                break;
            }
            case "r":
                e.preventDefault();
                pendingSequence = "r";
                syncVimStatus();
                break;
            case "z":
                e.preventDefault();
                pendingSequence = "z";
                syncVimStatus();
                break;
            case "f":
            case "F":
            case "t":
            case "T":
                e.preventDefault();
                pendingSequence = key;
                pendingCount = countPrefix;
                syncVimStatus();
                break;
            case ";":
                e.preventDefault();
                if (lastFindChar && lastFindMotion) {
                    if (lastFindMotion === "f") setNormalCursor(cursorLine, findCharForward(lastFindChar, count));
                    else if (lastFindMotion === "F") setNormalCursor(cursorLine, findCharBackward(lastFindChar, count));
                    else if (lastFindMotion === "t") setNormalCursor(cursorLine, findCharForward(lastFindChar, count, true));
                    else if (lastFindMotion === "T") setNormalCursor(cursorLine, findCharBackward(lastFindChar, count, true));
                    queueRedraw();
                }
                break;
            case ",":
                e.preventDefault();
                if (lastFindChar && lastFindMotion) {
                    const reversed: Record<string, "f" | "F" | "t" | "T"> = { f: "F", F: "f", t: "T", T: "t" };
                    const rev = reversed[lastFindMotion];
                    if (rev === "f") setNormalCursor(cursorLine, findCharForward(lastFindChar, count));
                    else if (rev === "F") setNormalCursor(cursorLine, findCharBackward(lastFindChar, count));
                    else if (rev === "t") setNormalCursor(cursorLine, findCharForward(lastFindChar, count, true));
                    else if (rev === "T") setNormalCursor(cursorLine, findCharBackward(lastFindChar, count, true));
                    queueRedraw();
                }
                break;
            case ">":
                e.preventDefault();
                pendingSequence = ">";
                pendingCount = countPrefix;
                syncVimStatus();
                break;
            case "<":
                e.preventDefault();
                pendingSequence = "<";
                pendingCount = countPrefix;
                syncVimStatus();
                break;
        }
    }

    async function handleEditorKeyDown(e: KeyboardEvent) {
        let activeDlg = false;
        dialogState.subscribe((s) => (activeDlg = !!s.activeDialog))();
        if (activeDlg) return;

        cursorVisible = true;

        if (!vimModeEnabled) {
            await handleInsertModeKeyDown(e, false);
            return;
        }

        if (vimMode === "insert") {
            await handleInsertModeKeyDown(e);
        } else if (vimMode === "command") {
            await handleCommandModeKeyDown(e);
        } else if (vimMode === "visual") {
            await handleVisualModeKeyDown(e);
        } else {
            await handleNormalModeKeyDown(e);
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
                        fetchChunk(i);
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
                fetchChunk(startLine);
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

    // --- Effect de Carga Inicial ---
    // A Svelte effect to react to filePath changes
    // $effect(() => {
    //     // Only proceed if filePath is defined and has actually changed
    //     if (filePath && filePath !== currentFilePath) {
    //         console.log(
    //             "EditorBuffer: filePath changed, resetting and loading new file:",
    //             filePath,
    //         );

    //         // Reset all states related to the previous file
    //         lineCache.clear();
    //         tokenCache.clear();
    //         pendingChunks.clear();
    //         totalLines = 0;
    //         currentScrollTop = 0;
    //         // startLine is now derived, no need to reset it directly
    //         highlightEnabled = false;

    //         // Reset scroll position if container exists
    //         if (scrollContainer) {
    //             scrollContainer.scrollTop = 0;
    //         }

    //         // Load data sequentially
    //         fetchTotalLines().then(() => {
    //             // Cargar las primeras 3 pantallas al abrir
    //             const visibleLines = Math.ceil(window.innerHeight / LINE_HEIGHT);
    //             const chunksNeeded = Math.ceil((visibleLines * 3) / CHUNK_SIZE);
                
    //             for (let i = 0; i < chunksNeeded; i++) {
    //                 const startLine = i * CHUNK_SIZE;
    //                 if (startLine < totalLines) {
    //                     fetchChunk(startLine);
    //                 }
    //             }
    //             // queueRedraw();
    //         });
    //         currentFilePath = filePath; // Update current path after initiating load
    //     }
    // });
    $effect(() => {
        if (filePath && filePath !== currentFilePath) {
            resetAndLoad(filePath);
        }
    });
    
    function resetAndLoad(path: string) {
        console.trace("[EditorBuffer] resetAndLoad called for:", path);
        lineCache.clear();
        tokenCache.clear();
        pendingChunks.clear();
        loadedChunks.clear();
        undoStack = [];
        redoStack = [];
    
        totalLines = 0;
        currentScrollTop = 0;
        highlightEnabled = false;
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
        if (highlightDebounceId !== null) {
            clearTimeout(highlightDebounceId);
            highlightDebounceId = null;
        }
        highlightPendingChunk = -1;
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
            await refreshHighlightAvailability();
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
                if (lineIdx < totalLines) fetchChunk(lineIdx);
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

        // Give the editor keyboard focus so the user can type immediately
        // without needing to click first.
        editorContainer?.focus();
        const blinkInterval = setInterval(() => {
            cursorVisible = !cursorVisible;
            queueRedraw();
        }, 500);

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

        if (canvas) {
            resizeObserver.observe(canvas);
        }

        invoke("watch_directory", {
            path: filePath.substring(0, filePath.lastIndexOf("/")),
        }).catch((e) => console.error("Failed to start directory watcher:", e));

        // 🔧 AQUÍ: Hacer async y await los listeners
        let unlistenParserReady: (() => void) | null = null;
        let unlistenFileChanged: (() => void) | null = null;
        let unlistenFileSaved: (() => void) | null = null;
        let unlistenFocus: (() => void) | null = null;

        (async () => {
            unlistenParserReady = await listen<string>("parser-ready", async (event) => {
                if (event.payload !== language) return;

                console.log("Parser ready, refreshing highlighted chunks...");
                await refreshHighlightAvailability();
            });

            unlistenFileChanged = await listen("file-changed", async (event: any) => {
                const changedPath = event.payload;
                console.log("[file-changed] path:", changedPath, "| filePath:", filePath, "| match:", changedPath === filePath, "| suppressed:", suppressExternalReload);

                if (changedPath !== filePath) return;

                // Ignore events caused by our own save (covers multiple watcher
                // events per write that some filesystems emit).
                if (suppressExternalReload) return;

                console.log("[file-changed] External change detected, reloading file.");
                resetAndLoad(filePath);
            });
            
            // Nuevo: escuchar guardado propio — solo refrescar explorer, NO el buffer
            unlistenFileSaved = await listen("file-saved", (event: any) => {
                const savedPath = event.payload;
                // Disparar evento para que el explorer refresque el tree
                window.dispatchEvent(new CustomEvent('explorer-refresh', { 
                    detail: { path: savedPath } 
                }));
                // NO tocar el buffer — ya tiene el contenido correcto en lineCache
            });

            // Escuchar evento para ir a una línea específica
            const handleGoToLine = (e: any) => {
                const { filePath: targetPath, line } = e.detail;
                if (targetPath === filePath) {
                    // line is 1-based from TODO store, setCursor is 0-based
                    setCursor(line - 1, 0);
                    if (vimModeEnabled) {
                        enterNormalMode();
                    }
                }
            };
            window.addEventListener('go-to-line', handleGoToLine);

            // Escuchar foco de ventana
            unlistenFocus = await listen("tauri://focus", async () => {
                // Only trigger a visual refresh on focus — do NOT reset totalLines
                // from disk, as that would corrupt in-memory edits.
                queueRedraw();
            });
        })(); // Ejecutar inmediatamente

        // Cleanup en onDestroy
        return () => {
          cancelAnimationFrame(fetchLoopId);
            // cancelAnimationFrame(raf);
            clearInterval(blinkInterval);
            resizeObserver.disconnect();
            unsubDiff();
            diffScheduler.dispose();

            // Ahora son funciones, no Promises
            if (unlistenParserReady) unlistenParserReady();
            if (unlistenFileChanged) unlistenFileChanged();
            if (unlistenFileSaved) unlistenFileSaved();
            if (unlistenFocus) unlistenFocus();
            window.removeEventListener('go-to-line', handleGoToLine);
            // Phase 3 bridge: release backend document state
            void docBridge.close();
            // LSP: close document
            void lspCloseDocument(language, filePath);
            // Clear the save-debounce timer so it doesn't fire after teardown
            if (saveDebounceHandle !== null) clearTimeout(saveDebounceHandle);
        };
    });
    
    const handleGoToLine = () => {
      
    }
    
    // --- Types & Colors ---
    interface Token {
        text: string;
        token_type: string;
    }
    interface SyntaxHighlight {
        tokens: Token[];
        used_fallback: boolean;
    }
</script>

<div
    bind:this={editorContainer}
    class="relative h-full w-full bg-[#0d0d0d] flex flex-col font-mono text-sm overflow-hidden"
    data-buffer-ui
    data-vim-mode={vimMode}
    role="textbox"
    aria-label="Code editor"
    aria-multiline="true"
    style={`font-family: ${editorFontFamily};`}
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
    <!-- Colorful Enhanced Status Bar (Top Right) -->
    <div
        class="absolute top-4 right-6 z-50 flex items-center justify-end pointer-events-none select-none group"
    >
        <div
            class="flex items-center gap-0.5 p-1 bg-[#121212]/80 backdrop-blur-xl border border-white/5 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden transition-all duration-500 hover:border-emerald-500/20"
        >
            <!-- File Path Section -->
            <div
                class="px-3 py-1.5 bg-white/5 rounded-lg flex items-center gap-2 border border-white/5"
            >
                {#if isDirty}
                    <div class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                {/if}
                <span
                    class="text-[11px] font-bold text-zinc-100 tracking-tight"
                >
                    {filePath.split(/[\/\\]/).pop()}
                </span>
            </div>

            <!-- Stats Section -->
            <div class="px-3 py-1.5 flex items-center gap-4">
                <div class="flex flex-col items-end">
                    <span
                        class="text-[9px] uppercase tracking-[0.1em] text-zinc-500 font-bold leading-none mb-0.5"
                        >Lines</span
                    >
                    <span class="text-[11px] text-zinc-300 font-medium"
                        >{totalLines.toLocaleString()}</span
                    >
                </div>
            </div>
        </div>
    </div>

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
                {#each scrollbarHunks as hunk, i (renderDeleted ? `d${i}` : `a${i}`)}
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
        background: #1a1a1a;
        border-radius: 6px;
        border: 3px solid #0d0d0d;
    }
    .custom-scrollbar:hover::-webkit-scrollbar-thumb {
        background: #252525;
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
        background: #0d0d0d;
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
        background: #161616;
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
